/******************************************************
 *                  QUEUE DB MODULE                   *
 *                                                    *
 * This module uses the core db module to expose APIs *
 * for the queue-management-related tasks.            *
 *                                                    *
 * This module exports the following functions:       *
 *   enqueue, dequeue, hold, unhold                   *
 ******************************************************/
import config from '../config/config.js';
import { clearLinkCode, fetch, save, tables } from './core.js';
import { leaderType, matchStatus, resultCode } from '../util/constants.js';

/***************
 * Public APIs *
 ***************/
export async function enqueue(leaderId, challengerId, difficulty, format, callback) {
    // This is still disgusting and I still hate it, and now it's even worse than the clusterfuck in the bot.
    // Checks, in order, are:
    // 1. Leader's queue is open
    // 2. Leader supports the requested battle difficulty and format
    // 3. Challenger has enough badges/emblems to challenge
    // 4. Challenger isn't already in this leader's queue and hasn't already beaten them (0 matches with status <> 2)
    // 5. Leader has room in the queue (<20 matches with status in [0, 1])
    // 6. Challenger isn't in too many queues (<3 matches with status in [0, 1] across all leaders)
    let result = await fetch(`SELECT leader_type, battle_format, queue_open FROM ${tables.leaders} WHERE id = ?`, [leaderId]);
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

    if (!(result.rows[0].battle_format & format)) {
        callback(resultCode.unsupportedFormat);
        return;
    }

    if (type & (leaderType.elite | leaderType.champion)) {
        // Elite or champ; pull badges and validate
        result = await fetch(`SELECT battle_difficulty FROM ${tables.matches} WHERE challenger_id = ? AND status IN (?, ?)`, [challengerId, matchStatus.win, matchStatus.ash]);
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

    result = await fetch(`SELECT status FROM ${tables.matches} WHERE leader_id = ? AND challenger_id = ? AND status <> ?`, [leaderId, challengerId, matchStatus.loss]);
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

    result = await fetch(`SELECT 1 FROM ${tables.matches} WHERE leader_id = ? AND status = ?`, [leaderId, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length >= config.maxQueueSize) {
        callback(resultCode.queueIsFull);
        return;
    }

    result = await fetch(`SELECT 1 FROM ${tables.matches} WHERE challenger_id = ? AND status IN (?, ?)`, [challengerId, matchStatus.inQueue, matchStatus.onHold]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length >= config.maxQueuesPerChallenger) {
        callback(resultCode.tooManyChallenges);
        return;
    }

    result = await save(`INSERT INTO ${tables.matches} (leader_id, challenger_id, battle_difficulty, battle_format, status, timestamp) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP())`, [leaderId, challengerId, difficulty, format, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    callback(resultCode.success);
}

export async function dequeue(leaderId, challengerId, callback) {
    const result = await save(`DELETE FROM ${tables.matches} WHERE leader_id = ? AND challenger_id = ? AND status IN (?, ?)`, [leaderId, challengerId, matchStatus.inQueue, matchStatus.onHold]);
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

export async function hold(leaderId, challengerId, callback) {
    const result = await save(`UPDATE ${tables.matches} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`, [matchStatus.onHold, leaderId, challengerId, matchStatus.inQueue]);
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

export async function unhold(leaderId, challengerId, placeAtFront, callback) {
    let result = await fetch(`SELECT SUBDATE(MIN(timestamp), INTERVAL 1 MINUTE) front_timestamp FROM ${tables.matches} WHERE leader_id = ? AND status = ?`, [leaderId, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    let sql = `UPDATE ${tables.matches} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
    const params = [matchStatus.inQueue, leaderId, challengerId, matchStatus.onHold];
    if (!placeAtFront) {
        sql = `UPDATE ${tables.matches} SET status = ?, timestamp = CURRENT_TIMESTAMP() WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
    } else if (result.rows[0].front_timestamp) {
        sql = `UPDATE ${tables.matches} SET status = ?, timestamp = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`;
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
