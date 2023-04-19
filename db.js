const sql = require('mysql');
const crypto = require('crypto');
const logger = require('./logger.js');
const config = require('./config.js');
const constants = require('./constants.js');

const TABLE_SUFFIX = process.env.TABLE_SUFFIX || config.tableSuffix;
const LOGINS_TABLE = 'ppl_webapp_logins' + TABLE_SUFFIX;
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

const linkCodeCache = {};

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

function fetch(query, params, callback) {
    db.query(query, params, (error, result) => {
        if (error) {
            logger.api.error('Database read failed');
            logger.api.error(error);
            callback(constants.resultCode.dbFailure, []);
            return;
        }

        callback(constants.resultCode.success, result);
    });
}

function save(query, params, callback) {
    db.query(query, params, (error, result) => {
        if (error) {
            logger.api.error('Database write failed');
            logger.api.error(error);
            callback(constants.resultCode.dbFailure);
            return;
        }

        callback(constants.resultCode.success, result.affectedRows);
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
    fetch(`SELECT id, leader_type FROM ${LEADERS_TABLE} WHERE leader_type <> ?`, [constants.leaderType.champion], (error, rows) => {
        if (error) {
            logger.api.error('Couldn\'t populate IDs for bingo boards due to a DB error');
        } else if (rows.length === 0) {
            logger.api.error('Couldn\'t populate IDs for bingo boards, no IDs found');
        } else {
            leaderIds = [];
            eliteIds = [];
            for (row of rows) {
                if (row.leader_type === constants.leaderType.elite) {
                    eliteIds.push(row.id);
                } else {
                    leaderIds.push(row.id);
                }
            }

            logger.api.info(`Bingo board IDs successfully populated with ${leaderIds.length} leader(s) and ${eliteIds.length} elite(s)`);
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
        logger.api.warn('Insufficient IDs for a bingo board');
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
        logger.api.error(`Couldn't inflate bingo board; split array was length ${split.length}`);
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

function zeroPad(value, length) {
    let result = `${value}`;
    while (result.length < length) {
        result = `0${result}`;
    }

    return result;
}

function createLinkCodeKey(leaderId, challengerId) {
    return `${leaderId}:${challengerId}`;
}

function getLinkCode(leaderId, challengerId) {
    const key = createLinkCodeKey(leaderId, challengerId);
    if (linkCodeCache[key]) {
        // This matchup already has a code, so just use that
        return linkCodeCache[key];
    }

    // New matchup, create a new code and store it
    const firstHalf = Math.floor(Math.random() * 10000);
    const secondHalf = Math.floor(Math.random() * 10000);
    const code = `${zeroPad(firstHalf, 4)} ${zeroPad(secondHalf, 4)}`;
    linkCodeCache[key] = code;
    return code;
}

function clearLinkCode(leaderId, challengerId) {
    delete linkCodeCache[createLinkCodeKey(leaderId, challengerId)];
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
            callback(constants.resultCode.usernameTaken);
        } else {
            const salt = generateHex(16);
            const hash = hashWithSalt(password, salt);
            const id = generateHex(8);
            const eventMask = pplEventToBitmask(pplEvent);
            save(`INSERT INTO ${LOGINS_TABLE} (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES (?, ?, ?, ?, 0, NULL)`, [id, username, `${hash}:${salt}`, eventMask], (error, rowCount) => {
                if (error) {
                    callback(error);
                } else if (rowCount === 0) {
                    callback(constants.resultCode.registrationFailure);
                } else {
                    const bingoBoard = generateBingoBoard();
                    save(`INSERT INTO ${CHALLENGERS_TABLE} (id, display_name, bingo_board) VALUES (?, ?, ?)`, [id, username, bingoBoard], (error, rowCount) => {
                        if (error) {
                            callback(error);
                        } else if (rowCount === 0) {
                            callback(constants.resultCode.registrationFailure);
                        } else {
                            callback(constants.resultCode.success, {
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
            callback(constants.resultCode.badCredentials);
        } else {
            const parts = rows[0].password_hash.split(':');
            const hash = hashWithSalt(password, parts[1]);
            if (hash !== parts[0]) {
                callback(constants.resultCode.badCredentials);
            } else {
                const oldMask = rows[0].ppl_events;
                const eventMask = pplEventToBitmask(pplEvent);
                save(`UPDATE ${LOGINS_TABLE} SET ppl_events = ? WHERE username = ?`, [oldMask | eventMask, username], (error, rowCount) => {
                    if (error) {
                        callback(error);
                    } else if (rowCount === 0) {
                        callback(constants.resultCode.badCredentials);
                    } else {
                        callback(constants.resultCode.success, {
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
                    callback(constants.resultCode.success, result);
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
            for (row of rows) {
                result[row.id] = {
                    name: row.leader_name,
                    leaderType: row.leader_type,
                    badgeName: row.badge_name,
                    bio: row.leader_bio,
                    tagline: row.leader_tagline
                };
            }

            callback(constants.resultCode.success, result);
        }
    });
}

// Challenger functions
function getChallengerInfo(id, callback) {
    fetch(`SELECT display_name, bingo_board FROM ${CHALLENGERS_TABLE} WHERE id = ?`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length === 0) {
            callback(constants.resultCode.notFound);
        } else {
            let bingoBoard = rows[0].bingo_board;
            if (!bingoBoard) {
                bingoBoard = generateBingoBoard();
                save(`UPDATE ${CHALLENGERS_TABLE} SET bingo_board = ? WHERE id = ?`, [bingoBoard, id], (error, rowCount) => {
                    if (error) {
                        logger.api.error(`Error saving new bingo board for id=${id}`);
                    } else {
                        logger.api.info(`Saved new bingo board for id=${id}`);
                    }
                });
            }

            const result = {
                displayName: rows[0].display_name,
                queuesEntered: [],
                badgesEarned: []
            };

            // aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
            fetch(`SELECT m.leader_id, l.leader_name, COUNT(m.challenger_id) position FROM ${MATCHES_TABLE} m INNER JOIN ${LEADERS_TABLE} l ON l.id = m.leader_id WHERE status = ? AND EXISTS (SELECT 1 FROM ${MATCHES_TABLE} WHERE leader_id = m.leader_id AND challenger_id = ? AND status = ?) AND timestamp <= (SELECT timestamp FROM ${MATCHES_TABLE} WHERE leader_id = m.leader_id AND challenger_id = ? AND status = ?) GROUP BY leader_id`, [constants.matchStatus.inQueue, id, constants.matchStatus.inQueue, id, constants.matchStatus.inQueue], (error, rows) => {
                if (error) {
                    callback(error);
                } else {
                    for (row of rows) {
                        // Position gets a -1 here because the count includes the challenger themselves and we want it 0-indexed
                        result.queuesEntered.push({
                            leaderId: row.leader_id,
                            leaderName: row.leader_name,
                            position: row.position - 1,
                            linkCode: getLinkCode(row.leader_id, id)
                        });
                    }

                    fetch(`SELECT m.leader_id, l.leader_name, l.leader_type, l.badge_name FROM ${MATCHES_TABLE} m INNER JOIN ${LEADERS_TABLE} l ON l.id = m.leader_id WHERE m.challenger_id = ? AND m.status IN (?, ?)`, [id, constants.matchStatus.win, constants.matchStatus.ash], (error, rows) => {
                        if (error) {
                            callback(error);
                        } else {
                            let championDefeated = false;
                            for (row of rows) {
                                result.badgesEarned.push({
                                    leaderId: row.leader_id,
                                    leaderName: row.leader_name,
                                    badgeName: row.badge_name
                                });

                                if (row.leader_type === constants.leaderType.champion) {
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

                            callback(constants.resultCode.success, result);
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
            callback(constants.resultCode.notFound);
        } else {
            callback(constants.resultCode.success);
        }
    });
}

function getBingoBoard(id, callback) {
    fetch(`SELECT bingo_board FROM ${CHALLENGERS_TABLE} WHERE id = ?`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length === 0) {
            callback(constants.resultCode.notFound);
        } else {
            const flatBoard = rows[0].bingo_board;
            fetch(`SELECT leader_id FROM ${MATCHES_TABLE} WHERE challenger_id = ? AND status IN (?, ?, ?)`, [id, constants.matchStatus.loss, constants.matchStatus.win, constants.matchStatus.ash], (error, rows) => {
                if (error) {
                    callback(error);
                } else {
                    const result = {
                        bingoBoard: inflateBingoBoard(flatBoard, rows.map(row => row.leader_id))
                    };
                    callback(constants.resultCode.success, result);
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
            callback(constants.resultCode.notFound);
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

            fetch(`SELECT m.challenger_id, c.display_name, m.status, m.battle_difficulty FROM ${MATCHES_TABLE} m INNER JOIN ${CHALLENGERS_TABLE} c ON c.id = m.challenger_id WHERE m.leader_id = ? AND m.status IN (?, ?) ORDER BY m.timestamp ASC`, [id, constants.matchStatus.inQueue, constants.matchStatus.onHold], (error, rows) => {
                if (error) {
                    callback(error);
                } else {
                    let position = 0;
                    for (row of rows) {
                        if (row.status === constants.matchStatus.inQueue) {
                            result.queue.push({
                                challengerId: row.challenger_id,
                                displayName: row.display_name,
                                position: position++,
                                linkCode: getLinkCode(id, row.challenger_id),
                                difficulty: row.battle_difficulty
                            });
                        } else {
                            result.onHold.push({
                                challengerId: row.challenger_id,
                                displayName: row.display_name
                            });
                        }
                    }

                    fetch(`SELECT status, COUNT(challenger_id) count FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status NOT IN (?, ?) GROUP BY status`, [id, constants.matchStatus.inQueue, constants.matchStatus.onHold], (error, rows) => {
                        if (error) {
                            callback(error);
                        } else {
                            // Win/loss is from the challenger perspective, so it's inverted here
                            const wins = (rows.find(row => row.status === constants.matchStatus.loss) || { count: 0 }).count;
                            const losses = (rows.find(row => row.status === constants.matchStatus.win) || { count: 0 }).count;
                            const ash = (rows.find(row => row.status === constants.matchStatus.ash) || { count: 0 }).count;
                            const gary = (rows.find(row => row.status === constants.matchStatus.gary) || { count: 0 }).count;

                            result.winCount = wins + ash;
                            result.lossCount = losses + gary;
                            result.badgesAwarded = losses + ash;

                            if (shouldIncludeFeedbackSurvey()) {
                                result.feedbackSurveyUrl = config.leaderSurveyUrl;
                            }

                            callback(constants.resultCode.success, result);
                        }
                    });
                }
            });
        }
    });
}

function updateQueueStatus(open, id, callback) {
    save(`UPDATE ${LEADERS_TABLE} SET queue_open = ? WHERE id = ?`, [open ? constants.queueStatus.open : constants.queueStatus.closed, id], (error, rowCount) => {
        if (error) {
            callback(error);
        } else if (rowCount === 0) {
            callback(constants.resultCode.notFound);
        } else {
            callback(constants.resultCode.success, {});
        }
    });
}

function enqueue(id, challengerId, callback) {
    // This is still disgusting and I still hate it, even if it's smaller than the clusterfuck in the bot.
    // Checks, in order, are:
    // 1. Challenger isn't already in this leader's queue and hasn't already beaten them (0 matches with status <> 2)
    // 2. Leader has room in the queue (<5 matches with status in [0, 1])
    // 3. Challenger isn't in too many queues (<3 matches with status in [0, 1] across all leaders)
    fetch(`SELECT status FROM ${MATCHES_TABLE} WHERE leader_id = ? AND challenger_id = ? AND status <> ?`, [id, challengerId, constants.matchStatus.loss], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.find(row => row.status === constants.matchStatus.inQueue || row.status === constants.matchStatus.onHold)) {
            callback(constants.resultCode.alreadyInQueue);
        } else if (rows.find(row => row.status === constants.matchStatus.win)) {
            callback(constants.resultCode.alreadyWon);
        } else {
            fetch(`SELECT 1 FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status = ?`, [id, constants.matchStatus.inQueue], (error, rows) => {
                if (error) {
                    callback(error);
                } else if (rows.length >= MAX_CHALLENGERS_PER_QUEUE) {
                    callback(constants.resultCode.queueIsFull);
                } else {
                    fetch(`SELECT 1 FROM ${MATCHES_TABLE} WHERE challenger_id = ? AND status IN (?, ?)`, [challengerId, constants.matchStatus.inQueue, constants.matchStatus.onHold], (error, rows) => {
                        if (error) {
                            callback(error);
                        } else if (rows.length >= MAX_QUEUES_PER_CHALLENGER) {
                            callback(constants.resultCode.tooManyChallenges);
                        } else {
                            save(`INSERT INTO ${MATCHES_TABLE} (leader_id, challenger_id, status, timestamp) VALUES (?, ?, ?, CURRENT_TIMESTAMP())`, [id, challengerId, constants.matchStatus.inQueue], callback);
                        }
                    });
                }
            });
        }
    });
}

function dequeue(id, challengerId, callback) {
    save(`DELETE FROM ${MATCHES_TABLE} WHERE leader_id = ? AND challenger_id = ? AND status IN (?, ?)`, [id, challengerId, constants.matchStatus.inQueue, constants.matchStatus.onHold], (error, rowCount) => {
        if (error) {
            callback(error);
        } else if (rowCount === 0) {
            callback(constants.resultCode.notInQueue);
        } else {
            clearLinkCode(id, challengerId);
            callback(constants.resultCode.success);
        }
    });
}

function reportResult(id, challengerId, challengerWin, badgeAwarded, callback) {
    let matchResult;
    if (challengerWin) {
        matchResult = badgeAwarded ? constants.matchStatus.win : constants.matchStatus.gary;
    } else {
        matchResult = badgeAwarded ? constants.matchStatus.ash : constants.matchStatus.loss;
    }

    save(`UPDATE ${MATCHES_TABLE} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`, [matchResult, id, challengerId, constants.matchStatus.inQueue], (error, rowCount) => {
        if (error) {
            callback(error);
        } else if (rowCount === 0) {
            callback(constants.resultCode.notInQueue);
        } else {
            clearLinkCode(id, challengerId);
            callback(constants.resultCode.success);
        }
    });
}

function hold(id, challengerId, callback) {
    save(`UPDATE ${MATCHES_TABLE} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`, [constants.matchStatus.onHold, id, challengerId, constants.matchStatus.inQueue], (error, rowCount) => {
        if (error) {
            callback(error);
        } else if (rowCount === 0) {
            callback(constants.resultCode.notInQueue);
        } else {
            callback(constants.resultCode.success);
        }
    });
}

function unhold(id, challengerId, placeAtFront, callback) {
    fetch(`SELECT SUBDATE(MIN(timestamp), INTERVAL 1 MINUTE) front_timestamp FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status = ?`, [id, constants.matchStatus.inQueue], (error, rows) => {
        if (error) {
            callback(error);
        } else {
            let sql = `UPDATE ${MATCHES_TABLE} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
            let params = [constants.matchStatus.inQueue, id, challengerId, constants.matchStatus.onHold];
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
                    callback(constants.resultCode.notInQueue);
                } else {
                    callback(constants.resultCode.success);
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
            for (row of rows) {
                result.push({ id: row.id, name: row.display_name });
            }

            callback(constants.resultCode.success, result);
        }
    });
}

function getLeaderMetrics(callback) {
    fetch(`SELECT l.id, l.leader_name, m.status FROM ${MATCHES_TABLE} AS m INNER JOIN ${LEADERS_TABLE} AS l ON l.id = m.leader_id WHERE m.status NOT IN (?, ?)`, [constants.matchStatus.inQueue, constants.matchStatus.onHold], (error, rows) => {
        if (error) {
            callback(error);
        } else {
            const result = {};
            for (row of rows) {
                if (!result[row.id]) {
                    result[row.id] = {
                        name: row.leader_name,
                        wins: 0,
                        losses: 0,
                        badgesAwarded: 0
                    };
                }

                if (row.status === constants.matchStatus.loss || row.status === constants.matchStatus.ash) {
                    result[row.id].wins++;
                } else {
                    result[row.id].losses++;
                }

                if (row.status === constants.matchStatus.win || row.status === constants.matchStatus.ash) {
                    result[row.id].badgesAwarded++;
                }
            }

            callback(constants.resultCode.success, result);
        }
    });
}

function debugSave(sql, params, callback) {
    if (!config.debug) {
        callback(0);
        return;
    }

    save(sql, params, (error, rowCount) => {
        if (error) {
            callback(0);
        } else {
            callback(rowCount);
        }
    });
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
        updateQueueStatus: updateQueueStatus,
        enqueue: enqueue,
        dequeue: dequeue,
        reportResult: reportResult,
        hold: hold,
        unhold: unhold,
        getAllChallengers: getAllChallengers,
        metrics: getLeaderMetrics
    },
    generateHex: generateHex,
    register: register,
    login: login,
    getAllIds: getAllIds,
    getAllLeaderData: getAllLeaderData,
    debugSave: debugSave,
    tables: {
        logins: LOGINS_TABLE,
        challengers: CHALLENGERS_TABLE,
        leaders: LEADERS_TABLE,
        matches: MATCHES_TABLE
    }
};
