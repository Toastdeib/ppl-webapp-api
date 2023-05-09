import sql from 'mysql';
import crypto from 'crypto';
import logger from './logger.js';
import config from './config.js';
import { resultCode, leaderType, matchStatus, queueStatus, pplEvent } from './constants.js';

const TABLE_SUFFIX = process.env.TABLE_SUFFIX || config.tableSuffix;
const LOGINS_TABLE = 'ppl_webapp_logins' + TABLE_SUFFIX;
const CHALLENGERS_TABLE = 'ppl_webapp_challengers' + TABLE_SUFFIX;
const LEADERS_TABLE = 'ppl_webapp_leaders' + TABLE_SUFFIX;
const MATCHES_TABLE = 'ppl_webapp_matches' + TABLE_SUFFIX;

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
 * - ppl_events: TINYINT(4)
 * - is_leader: BOOLEAN
 * - leader_id: VARCHAR(8)
 * - registered_date: TIMESTAMP
 * - last_used_date: TIMESTAMP
 *
 * ppl_webapp_challengers
 * - id: VARCHAR(16)
 * - display_name: VARCHAR(40)
 * - bingo_board: VARCHAR(350)
 *
 * ppl_webapp_leaders
 * - id: VARCHAR(16)
 * - leader_name: VARCHAR(80)
 * - leader_type: TINYINT(4)
 * - battle_format: TINYINT(4)
 * - badge_name: VARCHAR(40)
 * - leader_bio: VARCHAR(800)
 * - leader_tagline: VARCHAR(150)
 * - queue_open: BOOLEAN
 * - queue_open_text: VARCHAR(150)
 * - queue_close_text: VARCHAR(150)
 * - twitch_handle: VARCHAR(30)
 * - badge_art: MEDIUMTEXT (defunct)
 * - profile_art: MEDIUMTEXT (defunct)
 *
 * ppl_webapp_matches
 * - match_id: INT
 * - leader_id: VARCHAR(16)
 * - challenger_id: VARCHAR(16)
 * - battle_difficulty: TINYINT(4)
 * - status: TINYINT(3)
 * - timestamp: TIMESTAMP
 */

const sqlDb = sql.createPool({
    host: config.mysqlHost,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    database: config.mysqlDatabase,
    connectionLimit: 5
});

function fetch(query, params) {
    return new Promise((resolve) => {
        sqlDb.query(query, params, (error, result) => {
            if (error) {
                logger.api.error('Database read failed');
                logger.api.error(error);
                resolve({ status: resultCode.dbFailure, rows: [] });
            } else {
                resolve({ status: resultCode.success, rows: result });
            }
        });
    });
}

function save(query, params) {
    return new Promise((resolve) => {
        sqlDb.query(query, params, (error, result) => {
            if (error) {
                logger.api.error('Database write failed');
                logger.api.error(error);
                resolve({ status: resultCode.dbFailure, rowCount: [] });
            } else {
                resolve({ status: resultCode.success, rowCount: result.affectedRows });
            }
        });
    });
}

function pplEventToBitmask(eventString) {
    if (!eventString) {
        return 0;
    }

    eventString = eventString.toLowerCase();
    if (!pplEvent[eventString]) {
        logger.api.warn(`Unexpected PPL event header value: ${eventString}`);
        return 0;
    }

    return pplEvent[eventString];
}

async function fetchBingoIds(callback) {
    const result = await fetch(`SELECT id, leader_type FROM ${LEADERS_TABLE} WHERE leader_type <> ?`, [leaderType.champion]);
    if (result.resultCode) {
        logger.api.error('Couldn\'t populate IDs for bingo boards due to a DB error');
        callback();
        return;
    }

    if (result.rows.length === 0) {
        logger.api.error('Couldn\'t populate IDs for bingo boards, no IDs found');
        callback();
        return;
    }

    leaderIds = [];
    eliteIds = [];
    for (const row of result.rows) {
        if (row.leader_type === leaderType.elite) {
            eliteIds.push(row.id);
        } else {
            leaderIds.push(row.id);
        }
    }

    logger.api.info(`Bingo board IDs successfully populated with ${leaderIds.length} leader(s) and ${eliteIds.length} elite(s)`);
    callback();
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

async function register(username, password, eventString, callback) {
    let result = await fetch(`SELECT 1 FROM ${LOGINS_TABLE} WHERE username = ?`, [username]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length !== 0) {
        callback(resultCode.usernameTaken);
        return;
    }

    const salt = generateHex(16);
    const hash = hashWithSalt(password, salt);
    const id = generateHex(8);
    const eventMask = pplEventToBitmask(eventString);
    result = await save(`INSERT INTO ${LOGINS_TABLE} (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES (?, ?, ?, ?, 0, NULL)`, [id, username, `${hash}:${salt}`, eventMask]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.registrationFailure);
        return;
    }

    const bingoBoard = generateBingoBoard();
    result = await save(`INSERT INTO ${CHALLENGERS_TABLE} (id, display_name, bingo_board) VALUES (?, ?, ?)`, [id, username, bingoBoard]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.registrationFailure);
        return;
    }

    callback(resultCode.success, {
        id: id,
        isLeader: false,
        leaderId: null,
        pplEvent: eventMask
    });
}

async function login(username, password, eventString, callback) {
    let result = await fetch(`SELECT id, password_hash, ppl_events, is_leader, leader_id FROM ${LOGINS_TABLE} WHERE username = ?`, [username]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length === 0) {
        callback(resultCode.badCredentials);
        return;
    }

    const row = result.rows[0];
    const parts = row.password_hash.split(':');
    const hash = hashWithSalt(password, parts[1]);
    if (hash !== parts[0]) {
        callback(resultCode.badCredentials);
        return;
    }

    const oldMask = row.ppl_events;
    const eventMask = pplEventToBitmask(eventString);

    result = await save(`UPDATE ${LOGINS_TABLE} SET ppl_events = ?, last_used_date = CURRENT_TIMESTAMP() WHERE username = ?`, [oldMask | eventMask, username]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.badCredentials);
        return;
    }

    callback(resultCode.success, {
        id: row.id,
        isLeader: row.is_leader === 1,
        leaderId: row.leader_id,
        // Pass back the event mask for this login event if it wasn't in the existing mask
        newEvent: (oldMask & eventMask) === 0 ? eventMask : 0
    });
}

async function getAllIds(callback) {
    const retval = {};
    let result = await fetch(`SELECT id FROM ${CHALLENGERS_TABLE}`, []);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    retval.challengers = result.rows.map(row => row.id);
    result = await fetch(`SELECT id FROM ${LEADERS_TABLE}`, []);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    retval.leaders = result.rows.map(row => row.id);
    callback(resultCode.success, retval);
}

async function getAllLeaderData(callback) {
    const result = await fetch(`SELECT id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline FROM ${LEADERS_TABLE}`, []);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    const retval = {};
    for (const row of result.rows) {
        retval[row.id] = {
            name: row.leader_name,
            leaderType: row.leader_type,
            battleFormat: row.battle_format,
            badgeName: row.badge_name,
            bio: row.leader_bio,
            tagline: row.leader_tagline
        };
    }

    callback(resultCode.success, retval);
}

async function getOpenQueues(callback) {
    const result = await fetch(`SELECT id, queue_open FROM ${LEADERS_TABLE}`, []);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    const retval = {};
    for (const row of result.rows) {
        retval[row.id] = row.queue_open === queueStatus.open;
    }

    callback(resultCode.success, retval);
}

async function getBadges(id, callback) {
    const result = await fetch(`SELECT m.leader_id, l.leader_name, l.badge_name FROM ${MATCHES_TABLE} m INNER JOIN ${LEADERS_TABLE} l ON l.id = m.leader_id WHERE m.challenger_id = ? AND m.status IN (?, ?)`, [id, matchStatus.win, matchStatus.ash]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    const retval = {
        challengerId: id,
        badgesEarned: []
    };

    for (const row of result.rows) {
        retval.badgesEarned.push({
            leaderId: row.leader_id,
            leaderName: row.leader_name,
            badgeName: row.badge_name
        });
    }

    callback(resultCode.success, retval);
}

// Challenger functions
async function getChallengerInfo(id, callback) {
    let result = await fetch(`SELECT display_name, bingo_board FROM ${CHALLENGERS_TABLE} WHERE id = ?`, [id]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length === 0) {
        callback(resultCode.notFound);
        return;
    }

    let row = result.rows[0];
    let bingoBoard = row.bingo_board;
    if (!bingoBoard) {
        bingoBoard = generateBingoBoard();
        result = await save(`UPDATE ${CHALLENGERS_TABLE} SET bingo_board = ? WHERE id = ?`, [bingoBoard, id]);
        if (result.resultCode) {
            logger.api.error(`Error saving new bingo board for id=${id}`);
        } else {
            logger.api.info(`Saved new bingo board for id=${id}`);
        }
    }

    const retval = {
        displayName: row.display_name,
        queuesEntered: [],
        queuesOnHold: [],
        badgesEarned: []
    };

    // aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    result = await fetch(`SELECT m.leader_id, l.leader_name, m.challenger_id, m.battle_difficulty FROM ${MATCHES_TABLE} m INNER JOIN ${LEADERS_TABLE} l ON l.id = m.leader_id WHERE status = ? AND EXISTS (SELECT 1 FROM ${MATCHES_TABLE} WHERE leader_id = m.leader_id AND challenger_id = ? AND status = ?) AND timestamp <= (SELECT timestamp FROM ${MATCHES_TABLE} WHERE leader_id = m.leader_id AND challenger_id = ? AND status = ?)`, [matchStatus.inQueue, id, matchStatus.inQueue, id, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    for (const row of result.rows) {
        const match = retval.queuesEntered.find(item => item.leaderId === row.leader_id);
        if (!match) {
            retval.queuesEntered.push({
                leaderId: row.leader_id,
                leaderName: row.leader_name,
                position: 0, // Start this at 0, increment if we have additional rows for the leader ID
                linkCode: getLinkCode(row.leader_id, id),
                difficulty: row.battle_difficulty // Default to the new row, clobber it if we get another one
            });
        } else {
            match.position++;
            if (row.challenger_id === id) {
                match.difficulty = row.battle_difficulty;
            }
        }
    }

    result = await fetch(`SELECT m.leader_id, l.leader_name, l.leader_type, l.badge_name, m.battle_difficulty, m.status FROM ${MATCHES_TABLE} m INNER JOIN ${LEADERS_TABLE} l ON l.id = m.leader_id WHERE m.challenger_id = ? AND m.status IN (?, ?, ?)`, [id, matchStatus.onHold, matchStatus.win, matchStatus.ash]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    let championDefeated = false;
    for (const row of result.rows) {
        if (row.status === matchStatus.onHold) {
            retval.queuesOnHold.push({
                leaderId: row.leader_id,
                leaderName: row.leader_name,
                difficulty: row.battle_difficulty
            });
        } else {
            retval.badgesEarned.push({
                leaderId: row.leader_id,
                leaderName: row.leader_name,
                badgeName: row.badge_name
            });

            if (row.leader_type === leaderType.champion) {
                championDefeated = true;
            }
        }
    }

    retval.championDefeated = championDefeated;
    if (championDefeated) {
        retval.championSurveyUrl = config.championSurveyUrl;
    }

    if (shouldIncludeFeedbackSurvey()) {
        retval.feedbackSurveyUrl = config.challengerSurveyUrl;
    }

    callback(resultCode.success, retval);
}

async function setDisplayName(id, name, callback) {
    const result = await save(`UPDATE ${CHALLENGERS_TABLE} SET display_name = ? WHERE id = ?`, [name, id]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.notFound);
        return;
    }

    callback(resultCode.success);
}

async function getBingoBoard(id, callback) {
    let result = await fetch(`SELECT bingo_board FROM ${CHALLENGERS_TABLE} WHERE id = ?`, [id]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length === 0) {
        callback(resultCode.notFound);
        return;
    }

    const flatBoard = result.rows[0].bingo_board;
    result = await fetch(`SELECT leader_id FROM ${MATCHES_TABLE} WHERE challenger_id = ? AND status IN (?, ?, ?)`, [id, matchStatus.loss, matchStatus.win, matchStatus.ash]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    callback(resultCode.success, { bingoBoard: inflateBingoBoard(flatBoard, result.rows.map(row => row.leader_id)) });
}

// Leader functions
async function getLeaderInfo(id, callback) {
    let result = await fetch(`SELECT leader_name, leader_type, badge_name, queue_open, twitch_handle FROM ${LEADERS_TABLE} WHERE id = ?`, [id]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length === 0) {
        callback(resultCode.notFound);
        return;
    }

    const retval = {
        leaderName: result.rows[0].leader_name,
        leaderType: result.rows[0].leader_type,
        badgeName: result.rows[0].badge_name,
        queueOpen: result.rows[0].queue_open === queueStatus.open,
        twitchEnabled: !!result.rows[0].twitch_handle,
        winCount: 0,
        lossCount: 0,
        badgesAwarded: 0,
        queue: [],
        onHold: []
    };

    result = await fetch(`SELECT m.challenger_id, c.display_name, m.status, m.battle_difficulty FROM ${MATCHES_TABLE} m INNER JOIN ${CHALLENGERS_TABLE} c ON c.id = m.challenger_id WHERE m.leader_id = ? AND m.status IN (?, ?) ORDER BY m.timestamp ASC`, [id, matchStatus.inQueue, matchStatus.onHold]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    let position = 0;
    for (const row of result.rows) {
        if (row.status === matchStatus.inQueue) {
            retval.queue.push({
                challengerId: row.challenger_id,
                displayName: row.display_name,
                position: position++,
                linkCode: getLinkCode(id, row.challenger_id),
                difficulty: row.battle_difficulty
            });
        } else {
            retval.onHold.push({
                challengerId: row.challenger_id,
                displayName: row.display_name
            });
        }
    }

    result = await fetch(`SELECT status, COUNT(challenger_id) count FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status NOT IN (?, ?) GROUP BY status`, [id, matchStatus.inQueue, matchStatus.onHold]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    // Win/loss is from the challenger perspective, so it's inverted here
    const wins = (result.rows.find(row => row.status === matchStatus.loss) || { count: 0 }).count;
    const losses = (result.rows.find(row => row.status === matchStatus.win) || { count: 0 }).count;
    const ash = (result.rows.find(row => row.status === matchStatus.ash) || { count: 0 }).count;
    const gary = (result.rows.find(row => row.status === matchStatus.gary) || { count: 0 }).count;

    retval.winCount = wins + ash;
    retval.lossCount = losses + gary;
    retval.badgesAwarded = losses + ash;

    if (shouldIncludeFeedbackSurvey()) {
        retval.feedbackSurveyUrl = config.leaderSurveyUrl;
    }

    callback(resultCode.success, retval);
}

async function updateQueueStatus(id, open, callback) {
    const result = await save(`UPDATE ${LEADERS_TABLE} SET queue_open = ? WHERE id = ?`, [open ? queueStatus.open : queueStatus.closed, id]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.notFound);
        return;
    }

    callback(resultCode.success, {});
}

async function enqueue(leaderId, challengerId, difficulty, callback) {
    // This is still disgusting and I still hate it, and now it's even worse than the clusterfuck in the bot.
    // Checks, in order, are:
    // 1. Leader's queue is open
    // 2. Leader supports the requested battle difficulty
    // 3. Challenger has enough badges/emblems to challenge
    // 4. Challenger isn't already in this leader's queue and hasn't already beaten them (0 matches with status <> 2)
    // 5. Leader has room in the queue (<20 matches with status in [0, 1])
    // 6. Challenger isn't in too many queues (<3 matches with status in [0, 1] across all leaders)
    let result = await fetch(`SELECT leader_type, queue_open FROM ${LEADERS_TABLE} WHERE id = ?`, [leaderId]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length === 0) {
        callback(resultCode.notFound);
        return;
    }

    if (result.rows[0].queue_open === 0) {
        callback(resultCode.queueIsClosed);
        return;
    }

    const type = result.rows[0].leader_type;
    if (!(type & difficulty)) {
        callback(resultCode.unsupportedDifficulty);
        return;
    }

    if (type & (leaderType.elite | leaderType.champion)) {
        // Elite or champ; pull badges and validate
        result = await fetch(`SELECT battle_difficulty FROM ${MATCHES_TABLE} WHERE challenger_id = ? AND status IN (?, ?)`, [challengerId, matchStatus.win, matchStatus.ash]);
        const badgeCount = result.rows.filter(row => !(row.battle_difficulty & (leaderType.elite | leaderType.champion))).length;
        const emblemCount = result.rows.filter(row => row.battle_difficulty & leaderType.elite).length;
        // Match validity check is a bit wacky because PPL West doesn't have elites,
        // so we need to check badge count for the champ if config.requiredEmblems === 0
        if (((type & leaderType.elite) && badgeCount < config.requiredBadges) || // Elite with insufficient badges
            ((type & leaderType.champion) && config.requiredEmblems === 0 && badgeCount < config.requiredBadges)) { // Champ with no elites and insufficient badges
            callback(resultCode.notEnoughBadges);
            return;
        }

        if (((type & leaderType.champion) && emblemCount < config.requiredEmblems)) { // Champ with insufficient emblems
            callback(resultCode.notEnoughEmblems);
            return;
        }
    }

    result = await fetch(`SELECT status FROM ${MATCHES_TABLE} WHERE leader_id = ? AND challenger_id = ? AND status <> ?`, [leaderId, challengerId, matchStatus.loss]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.find(row => row.status === matchStatus.inQueue || row.status === matchStatus.onHold)) {
        callback(resultCode.alreadyInQueue);
        return;
    }

    if (result.rows.find(row => row.status === matchStatus.win)) {
        callback(resultCode.alreadyWon);
        return;
    }

    result = await fetch(`SELECT 1 FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status = ?`, [leaderId, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length >= config.maxQueueSize) {
        callback(resultCode.queueIsFull);
        return;
    }

    result = await fetch(`SELECT 1 FROM ${MATCHES_TABLE} WHERE challenger_id = ? AND status IN (?, ?)`, [challengerId, matchStatus.inQueue, matchStatus.onHold]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length >= config.maxQueuesPerChallenger) {
        callback(resultCode.tooManyChallenges);
        return;
    }

    result = await save(`INSERT INTO ${MATCHES_TABLE} (leader_id, challenger_id, battle_difficulty, status, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP())`, [leaderId, challengerId, difficulty, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    callback(resultCode.success);
}

async function dequeue(leaderId, challengerId, callback) {
    const result = await save(`DELETE FROM ${MATCHES_TABLE} WHERE leader_id = ? AND challenger_id = ? AND status IN (?, ?)`, [leaderId, challengerId, matchStatus.inQueue, matchStatus.onHold]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.notInQueue);
        return;
    }

    clearLinkCode(leaderId, challengerId);
    callback(resultCode.success);
}

async function reportResult(leaderId, challengerId, challengerWin, badgeAwarded, callback) {
    let matchResult;
    if (challengerWin) {
        matchResult = badgeAwarded ? matchStatus.win : matchStatus.gary;
    } else {
        matchResult = badgeAwarded ? matchStatus.ash : matchStatus.loss;
    }

    let result = await save(`UPDATE ${MATCHES_TABLE} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`, [matchResult, leaderId, challengerId, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.notInQueue);
        return;
    }

    let hof = false;
    if (challengerWin) {
        // Check whether the leader they were battling was the champ and notify the API that it was a HoFer if yes
        result = await fetch(`SELECT 1 FROM ${LEADERS_TABLE} WHERE id = ? AND leader_type = ?`, [leaderId, leaderType.champion]);
        if (result.resultCode) {
            callback(result.resultCode);
            return;
        }

        // The query will return a row only if the leader ID is the champ; otherwise it'll be an empty set
        hof = result.rows.length > 0;
    }

    clearLinkCode(leaderId, challengerId);
    callback(resultCode.success, { hof: hof });
}

async function hold(leaderId, challengerId, callback) {
    const result = await save(`UPDATE ${MATCHES_TABLE} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`, [matchStatus.onHold, leaderId, challengerId, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.notInQueue);
        return;
    }

    callback(resultCode.success);
}

async function unhold(leaderId, challengerId, placeAtFront, callback) {
    let result = await fetch(`SELECT SUBDATE(MIN(timestamp), INTERVAL 1 MINUTE) front_timestamp FROM ${MATCHES_TABLE} WHERE leader_id = ? AND status = ?`, [leaderId, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    let sql = `UPDATE ${MATCHES_TABLE} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
    let params = [matchStatus.inQueue, leaderId, challengerId, matchStatus.onHold];
    if (!placeAtFront) {
        sql = `UPDATE ${MATCHES_TABLE} SET status = ?, timestamp = CURRENT_TIMESTAMP() WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
    } else if (result.rows[0].front_timestamp) {
        sql = `UPDATE ${MATCHES_TABLE} SET status = ?, timestamp = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
        params.splice(1, 0, result.rows[0].front_timestamp);
    }

    result = await save(sql, params);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.notInQueue);
        return;
    }

    callback(resultCode.success);
}

async function getAllChallengers(eventString, callback) {
    const eventMask = pplEventToBitmask(eventString);
    const result = await fetch(`SELECT c.id, c.display_name FROM ${CHALLENGERS_TABLE} c INNER JOIN ${LOGINS_TABLE} l ON l.id = c.id WHERE l.ppl_events & ? <> 0 AND l.is_leader = 0`, [eventMask]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    const retval = [];
    for (const row of result.rows) {
        retval.push({ id: row.id, name: row.display_name });
    }

    callback(resultCode.success, retval);
}

async function getLeaderMetrics(callback) {
    const result = await fetch(`SELECT l.id, l.leader_name, m.status FROM ${MATCHES_TABLE} AS m INNER JOIN ${LEADERS_TABLE} AS l ON l.id = m.leader_id WHERE m.status NOT IN (?, ?)`, [matchStatus.inQueue, matchStatus.onHold]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    const retval = {};
    for (const row of result.rows) {
        if (!retval[row.id]) {
            retval[row.id] = {
                name: row.leader_name,
                wins: 0,
                losses: 0,
                badgesAwarded: 0
            };
        }

        if (row.status === matchStatus.loss || row.status === matchStatus.ash) {
            retval[row.id].wins++;
        } else {
            retval[row.id].losses++;
        }

        if (row.status === matchStatus.win || row.status === matchStatus.ash) {
            retval[row.id].badgesAwarded++;
        }
    }

    callback(resultCode.success, retval);
}

async function debugSave(query, params, callback) {
    if (!config.debug) {
        callback(0);
        return;
    }

    const result = await save(query, params);
    if (result.resultCode) {
        callback(0);
        return;
    }

    callback(result.rowCount);
}

const db = {
    challenger: {
        getInfo: getChallengerInfo,
        setDisplayName: setDisplayName,
        getBingoBoard: getBingoBoard
    },
    leader: {
        getInfo: getLeaderInfo,
        updateQueueStatus: updateQueueStatus,
        reportResult: reportResult,
        getAllChallengers: getAllChallengers,
        metrics: getLeaderMetrics
    },
    queue: {
        enqueue: enqueue,
        dequeue: dequeue,
        hold: hold,
        unhold: unhold,
    },
    auth: {
        register: register,
        login: login,
    },
    generateHex: generateHex,
    getAllIds: getAllIds,
    getAllLeaderData: getAllLeaderData,
    getOpenQueues: getOpenQueues,
    getBadges: getBadges,
    debugSave: debugSave,
    tables: {
        logins: LOGINS_TABLE,
        challengers: CHALLENGERS_TABLE,
        leaders: LEADERS_TABLE,
        matches: MATCHES_TABLE
    },
    dbReady: new Promise((resolve, reject) => {
        fetchBingoIds(() => {
            resolve();
        });
    })
};

export default db;
