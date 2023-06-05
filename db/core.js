/******************************************************
 *                   CORE DB MODULE                   *
 *                                                    *
 * This module provides a wrapper for the mysql node  *
 * module and contains core db functionality that's   *
 * shared across the other db modules in this folder. *
 *                                                    *
 * This module exports the following functions:       *
 *   fetch, save, getLinkCode, clearLinkCode,         *
 *   pplEventToBitmask, shouldIncludeFeedbackSurvey,  *
 *   generateBingoBoard, inflateBingoBoard            *
 * It also exports the following constants:           *
 *   tables, dbReady                                  *
 ******************************************************/
import config from '../config.js';
import logger from '../logger.js';
import sql from 'mysql';
import { leaderType, pplEvent, resultCode } from '../constants.js';

const TABLE_SUFFIX = process.env.TABLE_SUFFIX || config.tableSuffix;
const LOGINS_TABLE = 'ppl_webapp_logins' + TABLE_SUFFIX;
const CHALLENGERS_TABLE = 'ppl_webapp_challengers' + TABLE_SUFFIX;
const LEADERS_TABLE = 'ppl_webapp_leaders' + TABLE_SUFFIX;
const MATCHES_TABLE = 'ppl_webapp_matches' + TABLE_SUFFIX;

const LINK_CODE_MULTIPLIER = 10000;
const LINK_CODE_PADDING = 4;

// For even-width boards, we don't want a free space since it can't be centered
const BINGO_SPACE_COUNT = config.bingoBoardWidth * config.bingoBoardWidth;
const BINGO_ID_COUNT = BINGO_SPACE_COUNT - (config.bingoBoardWidth % 2);
const INCLUDE_FREE_SPACE = config.bingoBoardWidth % 2 === 1;

// Challenger/leader survey dates
const SURVEY_START_DATE = new Date(config.surveyStartDate);
// eslint-disable-next-line no-magic-numbers
const SURVEY_END_DATE = new Date(SURVEY_START_DATE.getTime() + (config.surveyDurationDays * 24 * 60 * 60 * 1000));

const linkCodeCache = {};
let leaderIds, eliteIds;

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

function createLinkCodeKey(leaderId, challengerId) {
    return `${leaderId}:${challengerId}`;
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

/***************
 * Public APIs *
 ***************/
export function fetch(query, params) {
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

export function save(query, params) {
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

export function getLinkCode(leaderId, challengerId) {
    const key = createLinkCodeKey(leaderId, challengerId);
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

export function clearLinkCode(leaderId, challengerId) {
    delete linkCodeCache[createLinkCodeKey(leaderId, challengerId)];
}

export function pplEventToBitmask(eventString) {
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

export function shouldIncludeFeedbackSurvey() {
    const now = new Date();
    return now > SURVEY_START_DATE && now < SURVEY_END_DATE;
}

export function generateBingoBoard() {
    const ids = [];
    const leaderCopy = leaderIds.slice();
    const eliteCopy = eliteIds.slice();

    // Populate with random leader IDs first
    while (ids.length < BINGO_ID_COUNT && leaderCopy.length > 0) {
        const index = Math.floor(Math.random() * leaderCopy.length);
        const id = leaderCopy.splice(index, 1)[0];
        if (config.excludedBingoIds.indexOf(id) === -1) {
            ids.push(id);
        }
    }

    // And then fill with elite IDs if we don't have enough
    while (ids.length < BINGO_ID_COUNT && eliteCopy.length > 0) {
        const index = Math.floor(Math.random() * eliteCopy.length);
        const id = eliteCopy.splice(index, 1)[0];
        if (config.excludedBingoIds.indexOf(id) === -1) {
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

export function inflateBingoBoard(flatBoard, earnedBadges) {
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
    challengers: CHALLENGERS_TABLE,
    leaders: LEADERS_TABLE,
    matches: MATCHES_TABLE
};

export const dbReady = new Promise((resolve) => {
    fetchBingoIds(() => {
        resolve();
    });
});