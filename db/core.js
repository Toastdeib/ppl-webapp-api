/******************************************************
 *                   CORE DB MODULE                   *
 *                                                    *
 * This module provides a wrapper for the mysql node  *
 * module and contains core db functionality that's   *
 * shared across the other db modules in this folder. *
 *                                                    *
 * This module exports the following functions:       *
 *   fetch, save, getLinkCode, clearLinkCode,         *
 *   shouldIncludeFeedbackSurvey, generateBingoBoard  *
 *   inflateBingoBoard, debugSave, cachePushToken,    *
 *   uncachePushToken                                 *
 * It also exports the following constants:           *
 *   tables, dbReady                                  *
 ******************************************************/
import config from '../config/config.js';
import logger from '../util/logger.js';
import sql from 'mysql';
import { leaderType, resultCode } from '../util/constants.js';

const TABLE_SUFFIX = process.env.TABLE_SUFFIX || config.tableSuffix;
const LOGINS_TABLE = 'ppl_webapp_logins' + TABLE_SUFFIX;
const TOKENS_TABLE = 'ppl_webapp_push_tokens' + TABLE_SUFFIX;
const CHALLENGERS_TABLE = 'ppl_webapp_challengers' + TABLE_SUFFIX;
const LEADERS_TABLE = 'ppl_webapp_leaders' + TABLE_SUFFIX;
const MATCHES_TABLE = 'ppl_webapp_matches' + TABLE_SUFFIX;

const LINK_CODE_MULTIPLIER = 10000;
const LINK_CODE_PADDING = 4;

// For even-width boards, we don't want a free space since it can't be centered
// We also don't want a free space if the board is 3x3, since it's already very small
const MIN_WIDTH_FOR_FREE_SPACE = 5;
const BINGO_SPACE_COUNT = config.bingoBoardWidth * config.bingoBoardWidth;
const BINGO_ID_COUNT = BINGO_SPACE_COUNT - (config.bingoBoardWidth >= MIN_WIDTH_FOR_FREE_SPACE ? (config.bingoBoardWidth % 2) : 0);
const INCLUDE_FREE_SPACE = config.bingoBoardWidth >= MIN_WIDTH_FOR_FREE_SPACE && config.bingoBoardWidth % 2 === 1;

// TODO - Remove these, since the logic is moving over to the settings payload
// Challenger/leader survey dates
const SURVEY_START_DATE = new Date(config.surveyStartDate);
// eslint-disable-next-line no-magic-numbers
const SURVEY_END_DATE = new Date(SURVEY_START_DATE.getTime() + (config.surveyDurationDays * 24 * 60 * 60 * 1000));

const linkCodeCache = {};
const pushTokenCache = {};
let leaderIds, eliteIds;

/* TABLE SCHEMA *
 * ppl_webapp_logins
 * - id: VARCHAR(16) (PRIMARY KEY)
 * - username: VARCHAR(30) (UNIQUE)
 * - password_hash: VARCHAR(99)
 * - ppl_events: TINYINT(4)
 * - is_leader: TINYINT(1)
 * - leader_id: VARCHAR(8)
 * - registered_date: TIMESTAMP
 * - last_used_date: TIMESTAMP
 *
 * ppl_webapp_push_tokens
 * - id: VARCHAR(16) (PRIMARY KEY)
 * - device_id: VARCHAR(100) TODO - May not be needed?
 * - push_type: TINYINT(4)
 * - push_token: VARCHAR(300) TODO - May need embiggening
 *
 * ppl_webapp_challengers
 * - id: VARCHAR(16) (PRIMARY KEY)
 * - display_name: VARCHAR(40)
 * - bingo_board: VARCHAR(350)
 *
 * ppl_webapp_leaders
 * - id: VARCHAR(16) (PRIMARY KEY)
 * - leader_name: VARCHAR(80)
 * - leader_type: TINYINT(4)
 * - battle_format: TINYINT(4)
 * - badge_name: VARCHAR(40)
 * - leader_bio: VARCHAR(800)
 * - leader_tagline: VARCHAR(150)
 * - queue_open: TINYINT(1)
 * - duo_mode: TINYINT(1)
 * - battle_code: VARCHAR(9)
 * - queue_open_text: VARCHAR(150)
 * - queue_close_text: VARCHAR(150)
 * - twitch_handle: VARCHAR(30)
 * - badge_art: MEDIUMTEXT (defunct)
 * - profile_art: MEDIUMTEXT (defunct)
 *
 * ppl_webapp_matches
 * - match_id: INT (PRIMARY KEY) (AUTOINCREMENT)
 * - leader_id: VARCHAR(16)
 * - challenger_id: VARCHAR(16)
 * - battle_difficulty: TINYINT(4)
 * - battle_format: TINYINT(4)
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

/******************
 * Util functions *
 ******************/
function zeroPad(value, length) {
    let result = `${value}`;
    while (result.length < length) {
        result = `0${result}`;
    }

    return result;
}

function createLinkCodeKey(leaderId, challengerIds) {
    return `${leaderId}:${challengerIds.join('/')}`;
}

function filterBingoIds(ids) {
    const filtered = [];
    for (const id of ids) {
        if (config.multiBingoIds.indexOf(id) !== -1) {
            filtered.push(`${id}-1`);
            filtered.push(`${id}-2`);
        } else if (config.excludedBingoIds.indexOf(id) === -1 && !config.sharedBingoIds[id]) {
            filtered.push(id);
        }
    }

    return filtered;
}

async function initCaches(callback) {
    let result = await fetch(`SELECT id, leader_type FROM ${tables.leaders} WHERE leader_type <> ?`, [leaderType.champion]);
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

    logger.api.debug('Skipping token cache init');
    result = await fetch(`SELECT id, push_type, push_token FROM ${tables.tokens}`, []);
    if (result.resultCode) {
        logger.api.error('Couldn\'t populate push token cache due to a DB error');
        callback();
        return;
    }

    for (const row of result.rows) {
        cachePushToken(row.id, row.push_type, row.push_token);
    }

    logger.api.info(`Caches successfully populated with ${leaderIds.length} leader(s), ${eliteIds.length} elite(s), and ${result.rows.length} push token(s)`);
    callback();
}

/*****************
 * Internal APIs *
 *****************/
export function cachePushToken(id, platform, token) {
    if (!pushTokenCache[id]) {
        pushTokenCache[id] = {};
    }

    if (!pushTokenCache[id][platform]) {
        pushTokenCache[id][platform] = [];
    }

    pushTokenCache[id][platform].push(token);
}

export function uncachePushToken(id, platform, token) {
    if (!pushTokenCache[id]) {
        return;
    }

    if (!pushTokenCache[id][platform]) {
        return;
    }

    const index = pushTokenCache[id][platform].indexOf(token);
    if (index === -1) {
        return;
    }

    pushTokenCache[id][platform].splice(index, 1);
    if (pushTokenCache[id][platform].length === 0) {
        delete pushTokenCache[id][platform];
    }
}

export function getPushTokens(id) {
    if (!pushTokenCache[id]) {
        return {};
    }

    return pushTokenCache[id];
}

/***************
 * Public APIs *
 ***************/
export function fetch(query, params) {
    return new Promise((resolve) => {
        sqlDb.query(query, params, (error, result) => {
            if (error) {
                logger.api.error(`Database read failed; query=${query}`);
                logger.api.error(error);
                resolve({ resultCode: resultCode.dbFailure, rows: [], sqlError: error });
            } else {
                resolve({ resultCode: resultCode.success, rows: result });
            }
        });
    });
}

export function save(query, params) {
    return new Promise((resolve) => {
        sqlDb.query(query, params, (error, result) => {
            if (error) {
                logger.api.error(`Database write failed; query=${query}`);
                logger.api.error(error);
                resolve({ resultCode: resultCode.dbFailure, rowCount: 0, sqlError: error });
            } else {
                resolve({ resultCode: resultCode.success, rowCount: result.affectedRows });
            }
        });
    });
}

export function getLinkCode(leaderId, challengerIds) {
    const key = createLinkCodeKey(leaderId, challengerIds);
    if (linkCodeCache[key]) {
        // This matchup already has a code, so just use that
        return linkCodeCache[key];
    }

    // New matchup, create a new code and store it
    const firstHalf = Math.floor(Math.random() * LINK_CODE_MULTIPLIER);
    const secondHalf = Math.floor(Math.random() * LINK_CODE_MULTIPLIER);
    const code = `${zeroPad(firstHalf, LINK_CODE_PADDING)} ${zeroPad(secondHalf, LINK_CODE_PADDING)}`;
    linkCodeCache[key] = code;
    return code;
}

export function clearLinkCode(leaderId, challengerIds) {
    delete linkCodeCache[createLinkCodeKey(leaderId, challengerIds)];
}

export function shouldIncludeFeedbackSurvey() {
    const now = new Date();
    return now > SURVEY_START_DATE && now < SURVEY_END_DATE;
}

export function generateBingoBoard() {
    const ids = [];
    const leaderCopy = filterBingoIds(leaderIds);
    const eliteCopy = filterBingoIds(eliteIds);

    // Populate with random leader IDs first
    while (ids.length < BINGO_ID_COUNT && leaderCopy.length > 0) {
        const index = Math.floor(Math.random() * leaderCopy.length);
        ids.push(leaderCopy.splice(index, 1)[0]);
    }

    // And then fill with elite IDs if we don't have enough
    while (ids.length < BINGO_ID_COUNT && eliteCopy.length > 0) {
        const index = Math.floor(Math.random() * eliteCopy.length);
        ids.push(eliteCopy.splice(index, 1)[0]);
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
        shuffled.splice(Math.floor(shuffled.length / 2), 0, 'free-space');
    }

    return shuffled.join(',');
}

export function inflateBingoBoard(flatBoard, battledIds) {
    const board = [];
    const split = flatBoard.split(',');
    if (split.length !== BINGO_SPACE_COUNT) {
        logger.api.error(`Couldn't inflate bingo board; split array was length ${split.length}`);
        return board;
    }

    const idsCopy = battledIds.map(id => config.sharedBingoIds[id] || id);

    for (let i = 0; i < config.bingoBoardWidth; i++) {
        board.push([]);
        for (let k = 0; k < config.bingoBoardWidth; k++) {
            const boardId = split.splice(0, 1)[0];
            let realId = boardId;
            const index = realId.indexOf('-');
            if (index > -1) {
                // Trim the '-1' or '-2' off if it's got one, for the battledIds check
                realId = realId.substr(0, index);
            }

            const blob = {};
            blob[boardId] = realId === 'free-space' || idsCopy.indexOf(realId) > -1;
            board[i].push(blob);
        }
    }

    return board;
}

export async function debugSave(query, params, callback) {
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

export const tables = {
    logins: LOGINS_TABLE,
    tokens: TOKENS_TABLE,
    challengers: CHALLENGERS_TABLE,
    leaders: LEADERS_TABLE,
    matches: MATCHES_TABLE
};

export const dbReady = new Promise((resolve) => {
    initCaches(() => {
        resolve();
    });
});
