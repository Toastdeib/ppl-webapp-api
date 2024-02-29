/******************************************************
 *                   AUTH DB MODULE                   *
 *                                                    *
 * This module uses the core db module to expose auth *
 * APIs for the login system.                         *
 *                                                    *
 * This module exports the following functions:       *
 *   register, login, generateHex                     *
 ******************************************************/
import crypto from 'crypto';
import { resultCode } from '../util/constants.js';
import { fetch, generateBingoBoard, save, tables } from './core.js';

const SALT_HEX_LENGTH = 16;
const LOGIN_ID_HEX_LENGTH = 8;
const MIN_USERNAME_LENGTH = 4;
const MAX_USERNAME_LENGTH = 30;

/******************
 * Util functions *
 ******************/
function hashWithSalt(password, salt) {
    const hash = crypto.createHash('sha256');
    hash.update(password);
    hash.update(salt);
    return hash.digest('hex');
}

/***************
 * Public APIs *
 ***************/
export async function register(username, password, eventMask, callback) {
    username = username.trim();
    if (username.length < MIN_USERNAME_LENGTH) {
        callback(resultCode.usernameTooShort);
        return;
    }

    if (username.length > MAX_USERNAME_LENGTH) {
        callback(resultCode.usernameTooLong);
        return;
    }

    const salt = generateHex(SALT_HEX_LENGTH);
    const hash = hashWithSalt(password, salt);
    const id = generateHex(LOGIN_ID_HEX_LENGTH);
    let result = await save(`INSERT INTO ${tables.logins} (id, username, password_hash, ppl_events, is_leader, leader_id) VALUES (?, ?, ?, ?, 0, NULL)`, [id, username, `${hash}:${salt}`, eventMask]);
    if (result.resultCode) {
        if (result.sqlError.code === 'ER_DUP_ENTRY') {
            // Key collision on the username, reject it with usernameTaken
            callback(resultCode.usernameTaken);
            return;
        }

        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.registrationFailure);
        return;
    }

    const bingoBoard = generateBingoBoard();
    result = await save(`INSERT INTO ${tables.challengers} (id, display_name, bingo_board) VALUES (?, ?, ?)`, [id, username, bingoBoard]);
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

export async function login(username, password, eventMask, callback) {
    username = username.trim();
    let result = await fetch(`SELECT id, password_hash, ppl_events, is_leader, leader_id FROM ${tables.logins} WHERE username = ?`, [username]);
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
    result = await save(`UPDATE ${tables.logins} SET ppl_events = ?, last_used_date = CURRENT_TIMESTAMP() WHERE username = ?`, [oldMask | eventMask, username]);
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

export function generateHex(length) {
    return crypto.randomBytes(length).toString('hex');
}
