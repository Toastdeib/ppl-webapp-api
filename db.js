const sql = require('mysql');
const config = require('./config.js');

const TABLE_SUFFIX = '';
const CHALLENGERS_TABLE = 'ppl_webapp_challengers' + TABLE_SUFFIX;
const LEADERS_TABLE = 'ppl_webapp_leaders' + TABLE_SUFFIX;
const MATCHES_TABLE = 'ppl_webapp_matches' + TABLE_SUFFIX;

/* TABLE SCHEMA *
 * ppl_webapp_challengers
 * - id: VARCHAR(16)
 * - display_name: VARCHAR(40)
 *
 * ppl_webapp_leaders
 * - id: VARCHAR(16)
 * - leader_name: VARCHAR(80)
 * - badge_name: VARCHAR(40)
 *
 * ppl_webapp_matches
 * - match_id: INT
 * - leader_id: VARCHAR(16)
 * - challenger_id: VARCHAR(16)
 * - status: TINYINT
 * - timestamp: TIMESTAMP
 */

const db = sql.createPool({
    host: config.mysqlHost,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    database: config.mysqlDatabase,
    connectionLimit: 5
});

const resultCode = {
    success: 0,
    dbFailure: 1,
    notFound: 2,
    alreadyInQueue: 3,
    alreadyWon: 4,
    queueIsFull: 5,
    tooManyChallenges: 6,
    notInQueue: 7
};


const leaderType = {
    casual: 0,
    veteran: 1,
    elite: 2,
    champion: 3
};

const matchStatus = {
    inQueue: 0,
    onHold: 1,
    loss: 2, // Challenger loss
    win: 3 // Challenger win
};

function fetch(query, params, callback) {
    db.query(query, params, (error, result) => {
        if (error) {
            console.log('Database fetch failed');
            console.log(error);
            callback(resultCode.dbFailure, []);
            return;
        }

        callback(resultCode.success, result);
    });
}

function save(query, params, callback) {
    db.query(query, params, (error, result) => {
        if (error) {
            console.log('Error: save failed');
            console.log(error);
            callback(resultCode.dbFailure);
            return;
        }

        callback(resultCode.success, result.affectedRows);
    });
}

// Challenger functions
function getChallengerInfo(id, callback) {
    fetch(`SELECT display_name FROM ${CHALLENGERS_TABLE} WHERE id = ?`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length === 0) {
            callback(resultCode.notFound);
        } else {
            const result = {
                displayName: rows[0].display_name,
                queuesEntered: [],
                badgesEarned: []
            };

            // aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
            fetch(`SELECT m.leader_id, l.leader_name, COUNT(m.challenger_id) position FROM ${MATCHES_TABLE} m INNER JOIN ${LEADERS_TABLE} l ON l.id = m.leader_id WHERE status = ? AND EXISTS (SELECT 1 FROM ${MATCHES_TABLE} WHERE leader_id = m.leader_id AND challenger_id = ? AND status = ?) AND timestamp <= (SELECT timestamp FROM ${MATCHES_TABLE} WHERE leader_id = m.leader_id AND challenger_id = ? AND status = ?) GROUP BY leader_id`, [matchStatus.inQueue, id, matchStatus.inQueue, id, matchStatus.inQueue], (error, rows) => {
                if (error) {
                    callback(error);
                } else {
                    for (let i = 0; i < rows.length; i++) {
                        // Position gets a -1 here because the count includes the challenger themselves and we want it 0-indexed
                        result.queuesEntered.push({
                            leaderId: rows[i].leader_id,
                            leaderName: rows[i].leader_name,
                            position: rows[i].position - 1
                        });
                    }

                    fetch(`SELECT leader_id FROM ${MATCHES_TABLE} WHERE challenger_id = ? AND status = ?`, [id, matchStatus.win], (error, rows) => {
                        if (error) {
                            callback(error);
                        } else {
                            for (let i = 0; i < rows.length; i++) {
                                result.badgesEarned.push(rows[i].leader_id);
                            }

                            callback(resultCode.success, result);
                        }
                    });
                }
            });
        }
    });
}

function setDisplayName(id, name, callback) {
    save(`UPDATE ${CHALLENGERS_TABLE} SET display_name = ? WHERE id = ?`, [name, id], (error, rowCount) => {
        if (error) {
            callback(error);
        } else if (rowCount === 0) {
            callback(resultCode.notFound);
        } else {
            callback(resultCode.success);
        }
    });
}

// Leader functions
function getLeaderInfo(id, callback) {
    fetch(`SELECT leader_name, badge_name FROM ${LEADERS_TABLE} WHERE id = ?`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length === 0) {
            callback(resultCode.notFound);
        } else {
            const result = {
                leaderName: rows[0].leader_name,
                badgeName: rows[0].badge_name,
                winCount: 0,
                lossCount: 0,
                queue: [],
                onHold: []
            };

            fetch(`SELECT m.challenger_id, c.display_name, m.status FROM ${MATCHES_TABLE} m INNER JOIN ${CHALLENGERS_TABLE} c ON c.id = m.challenger_id WHERE m.leader_id = ? AND m.status IN (?, ?) ORDER BY m.timestamp ASC`, [id, matchStatus.inQueue, matchStatus.onHold], (error, rows) => {
                if (error) {
                    callback(error);
                } else {
                    let position = 0;
                    for (let i = 0; i < rows.length; i++) {
                        if (rows[i].status === matchStatus.inQueue) {
                            result.queue.push({
                                challengerId: rows[i].challenger_id,
                                displayName: rows[i].display_name,
                                position: position
                            });
                            position++;
                        } else {
                            result.onHold.push(rows[i].challenger_id);
                        }
                    }

                    fetch(`SELECT status, COUNT(challenger_id) count FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status IN (?, ?) GROUP BY status`, [id, matchStatus.loss, matchStatus.win], (error, rows) => {
                        if (error) {
                            callback(error);
                        } else {
                            // Win/loss is from the challenger perspective, so it's inverted here
                            const wins = rows.find(row => row.status === matchStatus.loss);
                            const losses = rows.find(row => row.status === matchStatus.win);
                            if (wins) {
                                result.winCount = wins.count;
                            }

                            if (losses) {
                                result.lossCount = losses.count;
                            }

                            callback(resultCode.success, result);
                        }
                    });
                }
            });
        }
    });
}

function enqueue(id, challengerId, callback) {
    // This is still disgusting and I still hate it, even if it's smaller than the clusterfuck in the bot.
    // Checks, in order, are:
    // 1. Challenger isn't already in this leader's queue and hasn't already beaten them (0 matches with status <> 2)
    // 2. Leader has room in the queue (<5 matches with status in [0, 1])
    // 3. Challenger isn't in too many queues (<3 matches with status in [0, 1] across all leaders)
    fetch(`SELECT status FROM ${MATCHES_TABLE} WHERE leader_id = ? AND challenger_id = ? AND status <> ?`, [id, challengerId, matchStatus.loss], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.find(row => row.status === matchStatus.inQueue || row.status === matchStatus.onHold)) {
            callback(resultCode.alreadyInQueue);
        } else if (rows.find(row => row.status === matchStatus.win)) {
            callback(resultCode.alreadyWon);
        } else {
            fetch(`SELECT 1 FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status IN (?, ?)`, [id, matchStatus.inQueue, matchStatus.onHold], (error, rows) => {
                if (error) {
                    callback(error);
                } else if (rows.length >= 5) {
                    callback(resultCode.queueIsFull);
                } else {
                    fetch(`SELECT 1 FROM ${MATCHES_TABLE} WHERE challenger_id = ? AND status IN (?, ?)`, [challengerId, matchStatus.inQueue, matchStatus.onHold], (error, rows) => {
                        if (error) {
                            callback(error);
                        } else if (rows.length >= 3) {
                            callback(resultCode.tooManyChallenges);
                        } else {
                            save(`INSERT INTO ${MATCHES_TABLE} (leader_id, challenger_id, status, timestamp) VALUES (?, ?, ?, CURRENT_TIMESTAMP())`, [id, challengerId, matchStatus.inQueue], callback);
                        }
                    });
                }
            });
        }
    });
}

function dequeue(id, challengerId, callback) {
    save(`DELETE FROM ${MATCHES_TABLE} WHERE leader_id = ? AND challenger_id = ? AND status IN (?, ?)`, [id, challengerId, matchStatus.inQueue, matchStatus.onHold], (error, rowCount) => {
        if (error) {
            callback(error);
        } else if (rowCount === 0) {
            callback(resultCode.notInQueue);
        } else {
            callback(resultCode.success);
        }
    });
}

function reportResult(id, challengerId, challengerWin, callback) {
    const matchResult = challengerWin ? matchStatus.win : matchStatus.loss;
    save(`UPDATE ${MATCHES_TABLE} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`, [matchResult, id, challengerId, matchStatus.inQueue], (error, rowCount) => {
        if (error) {
            callback(error);
        } else if (rowCount === 0) {
            callback(resultCode.notInQueue);
        } else {
            callback(resultCode.success);
        }
    });
}

function hold(id, challengerId, callback) {
    save(`UPDATE ${MATCHES_TABLE} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`, [matchStatus.onHold, id, challengerId, matchStatus.inQueue], (error, rowCount) => {
        if (error) {
            callback(error);
        } else if (rowCount === 0) {
            callback(resultCode.notInQueue);
        } else {
            callback(resultCode.success);
        }
    });
}

function unhold(id, challengerId, placeAtFront, callback) {
    let sql = `UPDATE ${MATCHES_TABLE} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
    if (!placeAtFront) {
        sql = `UPDATE ${MATCHES_TABLE} SET status = ?, timestamp = CURRENT_TIMESTAMP() WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
    }

    save(sql, [matchStatus.inQueue, id, challengerId, matchStatus.onHold], (error, rowCount) => {
        if (error) {
            callback(error);
        } else if (rowCount === 0) {
            callback(resultCode.notInQueue);
        } else {
            callback(resultCode.success);
        }
    });
}

module.exports = {
    challenger: {
        getInfo: getChallengerInfo,
        setDisplayName: setDisplayName
    },
    leader: {
        getInfo: getLeaderInfo,
        enqueue: enqueue,
        dequeue: dequeue,
        reportResult: reportResult,
        hold: hold,
        unhold: unhold
    },
    resultCode: resultCode,
    leaderType: leaderType,
    matchStatus: matchStatus
};
