const sql = require('mysql');
const crypto = require('crypto');
const config = require('./config.js');

const TABLE_SUFFIX = '';
const LOGINS_TABLE = 'ppl_webapp_logins';
const CHALLENGERS_TABLE = 'ppl_webapp_challengers' + TABLE_SUFFIX;
const LEADERS_TABLE = 'ppl_webapp_leaders' + TABLE_SUFFIX;
const MATCHES_TABLE = 'ppl_webapp_matches' + TABLE_SUFFIX;

/* TABLE SCHEMA *
 * ppl_webapp_logins
 * - id: VARCHAR(16)
 * - username: VARCHAR(30)
 * - password_hash: VARCHAR(99)
 * - is_leader: BOOLEAN
 * - leader_id: VARCHAR(8)
 *
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
    notInQueue: 7,
    usernameTaken: 8,
    registrationFailure: 9,
    badCredentials: 10,
    invalidToken: 11
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
    win: 3, // Challenger win
    ash: 4, // Challenger loss but badge awarded anyway
    gary: 5 // Challenger win but no badge awarded because the challenger was a complete prick
};

function zeroPad(value, length) {
    let string = '' + value;
    while (string.length < length) {
        string = '0' + string;
    }

    return string;
}

function log(msg) {
    const now = new Date();
    const timestamp = `[${now.getFullYear()}-${zeroPad(now.getMonth() + 1, 2)}-${zeroPad(now.getDate(), 2)} ${zeroPad(now.getHours(), 2)}:${zeroPad(now.getMinutes(), 2)}:${zeroPad(now.getSeconds(), 2)}]`;
    console.log(`${timestamp} ${msg}`);
}

function fetch(query, params, callback) {
    db.query(query, params, (error, result) => {
        if (error) {
            log('Database fetch failed');
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
            log('Error: save failed');
            console.log(error);
            callback(resultCode.dbFailure);
            return;
        }

        callback(resultCode.success, result.affectedRows);
    });
}

function pplEventToBitmask(pplEvent) {
    if (!pplEvent) {
        return 0;
    }

    switch (pplEvent.toLowerCase()) {
        case 'east':
            return 1;
        case 'west':
            return 2;
        case 'aus':
            return 4;
        default:
            return 0;
    }
}

// Authentication functions
function generateHex(length) {
    return crypto.randomBytes(length).toString('hex');
}

function hashWithSalt(password, salt) {
    const hash = crypto.createHash('sha256');
    hash.update(password);
    hash.update(salt);
    return hash.digest('hex');
}

function register(username, password, pplEvent, callback) {
    fetch(`SELECT 1 FROM ${LOGINS_TABLE} WHERE username = ?`, [username], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length !== 0) {
            callback(resultCode.usernameTaken);
        } else {
            const salt = generateHex(16);
            const hash = hashWithSalt(password, salt);
            const id = generateHex(8);
            const eventMask = pplEventToBitmask(pplEvent);
            save(`INSERT INTO ${LOGINS_TABLE} (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES (?, ?, ?, ?, 0, NULL)`, [id, username, `${hash}:${salt}`, eventMask], (error, rowCount) => {
                if (error) {
                    callback(error);
                } else if (rowCount === 0) {
                    callback(resultCode.registrationFailure);
                } else {
                    save(`INSERT INTO ${CHALLENGERS_TABLE} (id, display_name) VALUES (?, ?)`, [id, username], (error, rowCount) => {
                        if (error) {
                            callback(error);
                        } else if (rowCount === 0) {
                            callback(resultCode.registrationFailure);
                        } else {
                            callback(resultCode.success, {
                                id: id,
                                isLeader: false,
                                leaderId: null
                            });
                        }
                    });
                }
            });
        }
    });
}

function login(username, password, pplEvent, callback) {
    fetch(`SELECT id, password_hash, ppl_events, is_leader, leader_id FROM ${LOGINS_TABLE} WHERE username = ?`, [username], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length === 0) {
            callback(resultCode.badCredentials);
        } else {
            const parts = rows[0].password_hash.split(':');
            const hash = hashWithSalt(password, parts[1]);
            if (hash !== parts[0]) {
                callback(resultCode.badCredentials);
            } else {
                const oldMask = rows[0].ppl_events;
                const eventMask = pplEventToBitmask(pplEvent);
                save(`UPDATE ${LOGINS_TABLE} SET ppl_events = ? WHERE username = ?`, [oldMask | eventMask, username], (error, rowCount) => {
                    if (error) {
                        callback(error);
                    } else if (rowCount === 0) {
                        callback(resultCode.badCredentials);
                    } else {
                        callback(resultCode.success, {
                            id: rows[0].id,
                            isLeader: rows[0].is_leader === 1,
                            leaderId: rows[0].leader_id
                        });
                    }
                });
            }
        }
    });
}

function getAllIds(callback) {
    const result = {};
    fetch(`SELECT id FROM ${CHALLENGERS_TABLE}`, [], (error, rows) => {
        if (error) {
            callback(error);
        } else {
            result.challengers = rows.map(row => row.id);
            fetch(`SELECT id FROM ${LEADERS_TABLE}`, [], (error, rows) => {
                if (error) {
                    callback(error);
                } else {
                    result.leaders = rows.map(row => row.id);
                    callback(resultCode.success, result);
                }
            });
        }
    });
}

function getAllLeaderData(callback) {
    fetch(`SELECT id, leader_name, badge_name, badge_art, portrait_art FROM ${LEADERS_TABLE}`, [], (error, rows) => {
        if (error) {
            callback(error);
        } else {
            const result = {};
            for (let i = 0; i < rows.length; i++) {
                let row = rows[i];
                result[row.id] = {
                    name: row.leader_name,
                    badgeName: row.badge_name,
                    badgeArt: row.badge_art,
                    portraitArt: row.portrait_art
                };
            }

            callback(resultCode.success, result);
        }
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

                    fetch(`SELECT m.leader_id, l.leader_name, l.badge_name FROM ${MATCHES_TABLE} m INNER JOIN ${LEADERS_TABLE} l ON l.id = m.leader_id WHERE m.challenger_id = ? AND m.status IN (?, ?)`, [id, matchStatus.win, matchStatus.ash], (error, rows) => {
                        if (error) {
                            callback(error);
                        } else {
                            for (let i = 0; i < rows.length; i++) {
                                result.badgesEarned.push({
                                    leaderId: rows[i].leader_id,
                                    leaderName: rows[i].leader_name,
                                    badgeName: rows[i].badge_name
                                });
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
                badgesAwarded: 0,
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
                            result.onHold.push({
                                challengerId: rows[i].challenger_id,
                                displayName: rows[i].display_name
                            });
                        }
                    }

                    fetch(`SELECT status, COUNT(challenger_id) count FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status NOT IN (?, ?) GROUP BY status`, [id, matchStatus.inQueue, matchStatus.onHold], (error, rows) => {
                        if (error) {
                            callback(error);
                        } else {
                            // Win/loss is from the challenger perspective, so it's inverted here
                            const wins = (rows.find(row => row.status === matchStatus.loss) || { count: 0 }).count;
                            const losses = (rows.find(row => row.status === matchStatus.win) || { count: 0 }).count;
                            const ash = (rows.find(row => row.status === matchStatus.ash) || { count: 0 }).count;
                            const gary = (rows.find(row => row.status === matchStatus.gary) || { count: 0 }).count;

                            result.winCount = wins + ash;
                            result.lossCount = losses + gary;
                            result.badgesAwarded = losses + ash;

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
            fetch(`SELECT 1 FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status = ?`, [id, matchStatus.inQueue], (error, rows) => {
                if (error) {
                    callback(error);
                } else if (rows.length >= 6) {
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

function reportResult(id, challengerId, challengerWin, badgeAwarded, callback) {
    let matchResult;
    if (challengerWin) {
        matchResult = badgeAwarded ? matchStatus.win : matchStatus.gary;
    } else {
        matchResult = badgeAwarded ? matchStatus.ash : matchStatus.loss;
    }

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

function getAllChallengers(pplEvent, callback) {
    const eventMask = pplEventToBitmask(pplEvent);
    fetch(`SELECT c.id, c.display_name FROM ${CHALLENGERS_TABLE} c INNER JOIN ${LOGINS_TABLE} l ON l.id = c.id WHERE l.ppl_events & ? <> 0 AND l.is_leader = 0`, [eventMask], (error, rows) => {
        if (error) {
            callback(error);
        } else {
            const result = [];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                result.push({ id: row.id, name: row.display_name });
            }

            callback(resultCode.success, result);
        }
    });
}

function getLeaderMetrics(callback) {
    fetch(`SELECT l.id, l.leader_name, m.status FROM ${MATCHES_TABLE} AS m INNER JOIN ${LEADERS_TABLE} AS l ON l.id = m.leader_id WHERE m.status NOT IN (?, ?)`, [matchStatus.inQueue, matchStatus.onHold], (error, rows) => {
        if (error) {
            callback(error);
        } else {
            const result = {};
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (!result[row.id]) {
                    result[row.id] = {
                        name: row.leader_name,
                        wins: 0,
                        losses: 0,
                        badgesAwarded: 0
                    };
                }

                if (row.status === matchStatus.loss || row.status === matchStatus.ash) {
                    result[row.id].wins++;
                } else {
                    result[row.id].losses++;
                }

                if (row.status === matchStatus.win || row.status === matchStatus.ash) {
                    result[row.id].badgesAwarded++;
                }
            }

            callback(resultCode.success, result);
        }
    });
}

function debugSave(sql) {
    if (!config.debug) {
        return;
    }

    save(sql, [], log);
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
        unhold: unhold,
        getAllChallengers: getAllChallengers,
        metrics: getLeaderMetrics
    },
    resultCode: resultCode,
    leaderType: leaderType,
    matchStatus: matchStatus,
    generateHex: generateHex,
    register: register,
    login: login,
    getAllIds: getAllIds,
    getAllLeaderData: getAllLeaderData,
    //debugSave: debugSave
};
