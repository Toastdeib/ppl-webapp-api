/******************************************************
                   GENERAL DB MODULE                  *
 *                                                    *
 * This module uses the core db module to expose APIs *
 * for the general unauthenticated tasks.             *
 *                                                    *
 * This module exports the following functions:       *
 *   getAllIds, getAllLeaderData, getOpenQueues,      *
 *   getBadges                                        *
 ******************************************************/
import config from '../config/config.js';
import { fetch, tables } from './core.js';
import { matchStatus, queueStatus, resultCode } from '../util/constants.js';

/***************
 * Public APIs *
 ***************/
export async function getAllIds(callback) {
    const retval = {};
    let result = await fetch(`SELECT id FROM ${tables.challengers}`, []);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    retval.challengers = result.rows.map(row => row.id);
    result = await fetch(`SELECT id FROM ${tables.leaders}`, []);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    retval.leaders = result.rows.map(row => row.id);
    callback(resultCode.success, retval);
}

export async function getAllLeaderData(callback) {
    const result = await fetch(`SELECT id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline FROM ${tables.leaders}`, []);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    const retval = {};
    for (const row of result.rows) {
        if (config.excludedTrainerCardIds.indexOf(row.id) > -1) {
            continue;
        }

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

export async function getOpenQueues(callback) {
    const result = await fetch(`SELECT id, queue_open FROM ${tables.leaders}`, []);
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

export async function getBadges(id, callback) {
    let result = await fetch(`SELECT display_name FROM ${tables.challengers} WHERE id = ?`, [id]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length === 0) {
        callback(resultCode.notFound);
        return;
    }

    const retval = {
        challengerId: id,
        displayName: result.rows[0].display_name,
        badgesEarned: []
    };

    result = await fetch(`SELECT m.leader_id, l.leader_name, l.badge_name FROM ${tables.matches} m INNER JOIN ${tables.leaders} l ON l.id = m.leader_id WHERE m.challenger_id = ? AND m.status IN (?, ?)`, [id, matchStatus.win, matchStatus.ash]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    for (const row of result.rows) {
        retval.badgesEarned.push({
            leaderId: row.leader_id,
            leaderName: row.leader_name,
            badgeName: row.badge_name
        });
    }

    callback(resultCode.success, retval);
}
