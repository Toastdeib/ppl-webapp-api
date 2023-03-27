const sql = require('mysql');
const crypto = require('crypto');
const logger = require('./logger.js');
const config = require('./config.js');

const TABLE_SUFFIX = config.tableSuffix;
const LOGINS_TABLE = 'ppl_webapp_logins';
const CHALLENGERS_TABLE = 'ppl_webapp_challengers' + TABLE_SUFFIX;
const LEADERS_TABLE = 'ppl_webapp_leaders' + TABLE_SUFFIX;
const MATCHES_TABLE = 'ppl_webapp_matches' + TABLE_SUFFIX;

const MAX_CHALLENGERS_PER_QUEUE = 20;
const MAX_QUEUES_PER_CHALLENGER = 3;

const BINGO_SPACE_COUNT = config.bingoBoardWidth * config.bingoBoardWidth;

// For even-width boards, we don't want a free space since it can't be centered
const BINGO_ID_COUNT = BINGO_SPACE_COUNT - (config.bingoBoardWidth % 2);
const INCLUDE_FREE_SPACE = config.bingoBoardWidth % 2 === 1;

// Excluding Sal and Aidan due to overlap (Garganacl and Roaring Moon, respectively)
const EXCLUDED_BINGO_IDS = ['3ffb37c301b4', 'f27c016d37c9'];

// Challenger/leader survey dates
const SURVEY_START_DATE = new Date(config.surveyStartDate);
const SURVEY_END_DATE = new Date(SURVEY_START_DATE.getTime() + (config.surveyDurationDays * 24 * 60 * 60 * 1000));

let leaderIds, eliteIds;

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
 * - bingo_board: VARCHAR(350)
 *
 * ppl_webapp_leaders
 * - id: VARCHAR(16)
 * - leader_name: VARCHAR(80)
 * - leader_type: TINYINT
 * - badge_name: VARCHAR(40)
 * - leader_bio: VARCHAR(800)
 * - leader_tagline: VARCHAR(150)
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

// This is a bitmask now - leaders can be a mix of casual/intermediate/veteran
const leaderType = {
    casual: 1,
    intermediate: 2,
    veteran: 4,
    elite: 8,
    champion: 16
};

const matchStatus = {
    inQueue: 0,
    onHold: 1,
    loss: 2, // Challenger loss
    win: 3, // Challenger win
    ash: 4, // Challenger loss but badge awarded anyway
    gary: 5 // Challenger win but no badge awarded because the challenger was a complete prick
};

function fetch(query, params, callback) {
    db.query(query, params, (error, result) => {
        if (error) {
            logger.error('Database read failed');
            logger.error(error);
            callback(resultCode.dbFailure, []);
            return;
        }

        callback(resultCode.success, result);
    });
}

function save(query, params, callback) {
    db.query(query, params, (error, result) => {
        if (error) {
            logger.error('Database write failed');
            logger.error(error);
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

function fetchBingoIds() {
    fetch(`SELECT id, leader_type FROM ${LEADERS_TABLE} WHERE leader_type <> ?`, [leaderType.champion], (error, rows) => {
        if (error) {
            logger.error('Couldn\'t populate IDs for bingo boards due to a DB error');
        } else if (rows.length === 0) {
            logger.error('Couldn\'t populate IDs for bingo boards, no IDs found');
        } else {
            leaderIds = [];
            eliteIds = [];
            for (let i = 0; i < rows.length; i++) {
                let row = rows[i];
                if (row.leader_type === leaderType.elite) {
                    eliteIds.push(row.id);
                } else {
                    leaderIds.push(row.id);
                }
            }

            logger.info(`Bingo board IDs successfully populated with ${leaderIds.length} leader(s) and ${eliteIds.length} elite(s)`);
        }
    });
}

function generateBingoBoard() {
    const ids = [];
    const leaderCopy = leaderIds.slice();
    const eliteCopy = eliteIds.slice();

    // Populate with random leader IDs first
    while (ids.length < BINGO_ID_COUNT && leaderCopy.length > 0) {
        const index = Math.floor(Math.random() * leaderCopy.length);
        const id = leaderCopy.splice(index, 1)[0];
        if (EXCLUDED_BINGO_IDS.indexOf(id) === -1) {
            ids.push(id);
        }
    }

    // And then fill with elite IDs if we don't have enough
    while (ids.length < BINGO_ID_COUNT && eliteCopy.length > 0) {
        const index = Math.floor(Math.random() * eliteCopy.length);
        const id = eliteCopy.splice(index, 1)[0];
        if (EXCLUDED_BINGO_IDS.indexOf(id) === -1) {
            ids.push(id);
        }
    }

    if (ids.length < BINGO_ID_COUNT) {
        logger.warn('Insufficient IDs for a bingo board');
        return '';
    }

    const shuffled = [];
    while (ids.length > 0) {
        const index = Math.floor(Math.random() * ids.length);
        shuffled.push(ids.splice(index, 1)[0]);
    }

    if (INCLUDE_FREE_SPACE) {
        shuffled.splice(Math.floor(shuffled.length / 2), 0, '');
    }
    return shuffled.join(',');
}

function inflateBingoBoard(flatBoard, earnedBadges) {
    const board = [];
    const split = flatBoard.split(',');
    if (split.length !== BINGO_SPACE_COUNT) {
        logger.error(`Couldn't inflate bingo board; split array was length ${split.length}`);
        return board;
    }

    for (let i = 0; i < config.bingoBoardWidth; i++) {
        board.push([]);
        for (let k = 0; k < config.bingoBoardWidth; k++) {
            const id = split.splice(0, 1)[0];
            const blob = {};
            blob[id] = id === '' || earnedBadges.indexOf(id) > -1;
            board[i].push(blob);
        }
    }

    return board;
}

function shouldIncludeFeedbackSurvey() {
    const now = new Date();
    return now > SURVEY_START_DATE && now < SURVEY_END_DATE;
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
                    const bingoBoard = generateBingoBoard();
                    save(`INSERT INTO ${CHALLENGERS_TABLE} (id, display_name, bingo_board) VALUES (?, ?, ?)`, [id, username, bingoBoard], (error, rowCount) => {
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
    fetch(`SELECT id, leader_name, leader_type, badge_name, leader_bio, leader_tagline FROM ${LEADERS_TABLE}`, [], (error, rows) => {
        if (error) {
            callback(error);
        } else {
            const result = {};
            for (let i = 0; i < rows.length; i++) {
                let row = rows[i];
                result[row.id] = {
                    name: row.leader_name,
                    leaderType: row.leader_type,
                    badgeName: row.badge_name,
                    bio: row.leader_bio,
                    tagline: row.leader_tagline
                };
            }

            callback(resultCode.success, result);
        }
    });
}

// Challenger functions
function getChallengerInfo(id, callback) {
    fetch(`SELECT display_name, bingo_board FROM ${CHALLENGERS_TABLE} WHERE id = ?`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length === 0) {
            callback(resultCode.notFound);
        } else {
            let bingoBoard = rows[0].bingo_board;
            if (!bingoBoard) {
                bingoBoard = generateBingoBoard();
                save(`UPDATE ${CHALLENGERS_TABLE} SET bingo_board = ? WHERE id = ?`, [bingoBoard, id], (error, rowCount) => {
                    if (error) {
                        logger.error(`Error saving new bingo board for id=${id}`);
                    } else {
                        logger.info(`Saved new bingo board for id=${id}`);
                    }
                });
            }

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

                    fetch(`SELECT m.leader_id, l.leader_name, l.leader_type, l.badge_name FROM ${MATCHES_TABLE} m INNER JOIN ${LEADERS_TABLE} l ON l.id = m.leader_id WHERE m.challenger_id = ? AND m.status IN (?, ?)`, [id, matchStatus.win, matchStatus.ash], (error, rows) => {
                        if (error) {
                            callback(error);
                        } else {
                            let championDefeated = id === '433c4b55a17da084';//false; // TODO - Revert
                            for (let i = 0; i < rows.length; i++) {
                                result.badgesEarned.push({
                                    leaderId: rows[i].leader_id,
                                    leaderName: rows[i].leader_name,
                                    badgeName: rows[i].badge_name
                                });

                                if (rows[i].leader_type === leaderType.champion) {
                                    championDefeated = true;
                                }
                            }

                            result.championDefeated = championDefeated;
                            if (championDefeated) {
                                result.championSurveyUrl = config.championSurveyUrl;
                            }

                            if (shouldIncludeFeedbackSurvey()) {
                                result.feedbackSurveyUrl = config.challengerSurveyUrl;
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

function getBingoBoard(id, callback) {
    fetch(`SELECT bingo_board FROM ${CHALLENGERS_TABLE} WHERE id = ?`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length === 0) {
            callback(resultCode.notFound);
        } else {
            const flatBoard = rows[0].bingo_board;
            fetch(`SELECT leader_id FROM ${MATCHES_TABLE} WHERE challenger_id = ? AND status IN (?, ?, ?)`, [id, matchStatus.loss, matchStatus.win, matchStatus.ash], (error, rows) => {
                if (error) {
                    callback(error);
                } else {
                    const result = {
                        bingoBoard: inflateBingoBoard(flatBoard, rows.map(row => row.leader_id))
                    };
                    callback(resultCode.success, result);
                }
            });
        }
    });
}

// Leader functions
function getLeaderInfo(id, callback) {
    fetch(`SELECT leader_name, leader_type, badge_name FROM ${LEADERS_TABLE} WHERE id = ?`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length === 0) {
            callback(resultCode.notFound);
        } else {
            const result = {
                leaderName: rows[0].leader_name,
                leaderType: rows[0].leader_type,
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

                            if (shouldIncludeFeedbackSurvey()) {
                                result.feedbackSurveyUrl = config.leaderSurveyUrl;
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
            fetch(`SELECT 1 FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status = ?`, [id, matchStatus.inQueue], (error, rows) => {
                if (error) {
                    callback(error);
                } else if (rows.length >= MAX_CHALLENGERS_PER_QUEUE) {
                    callback(resultCode.queueIsFull);
                } else {
                    fetch(`SELECT 1 FROM ${MATCHES_TABLE} WHERE challenger_id = ? AND status IN (?, ?)`, [challengerId, matchStatus.inQueue, matchStatus.onHold], (error, rows) => {
                        if (error) {
                            callback(error);
                        } else if (rows.length >= MAX_QUEUES_PER_CHALLENGER) {
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
    fetch(`SELECT SUBDATE(MIN(timestamp), INTERVAL 1 MINUTE) front_timestamp FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status = ?`, [id, matchStatus.inQueue], (error, rows) => {
        if (error) {
            callback(error);
        } else {
            let sql = `UPDATE ${MATCHES_TABLE} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
            let params = [matchStatus.inQueue, id, challengerId, matchStatus.onHold];
            if (!placeAtFront) {
                sql = `UPDATE ${MATCHES_TABLE} SET status = ?, timestamp = CURRENT_TIMESTAMP() WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
            } else if (rows[0].front_timestamp) {
                sql = `UPDATE ${MATCHES_TABLE} SET status = ?, timestamp = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
                params.splice(1, 0, rows[0].front_timestamp);
            }

            save(sql, params, (error, rowCount) => {
                if (error) {
                    callback(error);
                } else if (rowCount === 0) {
                    callback(resultCode.notInQueue);
                } else {
                    callback(resultCode.success);
                }
            });
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

fetchBingoIds();

module.exports = {
    challenger: {
        getInfo: getChallengerInfo,
        setDisplayName: setDisplayName,
        getBingoBoard: getBingoBoard
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
    getAllLeaderData: getAllLeaderData
};
