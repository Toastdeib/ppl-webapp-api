/******************************************************
 *                  QUEUE DB MODULE                   *
 *                                                    *
 * This module uses the core db module to expose APIs *
 * for the queue-management-related tasks.            *
 *                                                    *
 * This module exports the following functions:       *
 *   enqueue, dequeue, hold, unhold, getIdsInQueue    *
 ******************************************************/
import config from '../config/config.js';
import { sendPush } from '../push/push.js';
import { clearLinkCode, fetch, getPushTokens, save, tables } from './core.js';
import { leaderType, matchStatus, queueStatus, resultCode } from '../util/constants.js';

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
    let result = await fetch(`SELECT l.leader_type, l.battle_format, l.queue_open, (SELECT COUNT(m.challenger_id) FROM ${tables.matches} m WHERE m.leader_id = l.id AND m.status = ?) queue_size FROM ${tables.leaders} l WHERE l.id = ? GROUP BY l.id`, [matchStatus.inQueue, leaderId]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length === 0) {
        callback(resultCode.notFound);
        return;
    }

    const leaderInfo = result.rows[0];
    if (leaderInfo.queue_open === queueStatus.closed) {
        callback(resultCode.queueIsClosed);
        return;
    }

    if (!(leaderInfo.leader_type & difficulty)) {
        callback(resultCode.unsupportedDifficulty);
        return;
    }

    if (!(leaderInfo.battle_format & format)) {
        callback(resultCode.unsupportedFormat);
        return;
    }

    if (leaderInfo.queue_size >= config.maxQueueSize) {
        callback(resultCode.queueIsFull);
        return;
    }

    result = await fetch(`SELECT leader_id, battle_difficulty, status FROM ${tables.matches} WHERE challenger_id = ? AND status <> ?`, [challengerId, matchStatus.loss]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (leaderInfo.leader_type & (leaderType.elite | leaderType.champion)) {
        // Elite or champ; pull badges and validate
        const earned = result.rows.filter(row => row.status === matchStatus.win || row.status === matchStatus.ash);
        const badgeCount = earned.filter(row => !(row.battle_difficulty & (leaderType.elite | leaderType.champion))).length;
        const emblemCount = earned.filter(row => row.battle_difficulty & leaderType.elite).length;

        if ((leaderInfo.leader_type & leaderType.elite) && badgeCount < config.requiredBadgesForElites) {
            callback(resultCode.notEnoughBadges);
            return;
        }

        if ((leaderInfo.leader_type & leaderType.champion)) {
            if (config.requiredEmblemsForChamp > 0 && emblemCount < config.requiredEmblemsForChamp) {
                // Regular format, elites are required
                callback(resultCode.notEnoughEmblems);
                return;
            }

            if (config.requiredBadgesForChamp > 0 && (badgeCount + emblemCount * config.emblemWeight) < config.requiredBadgesForChamp) {
                // Elite-optional format, count them as weighted badges
                callback(resultCode.notEnoughBadges);
                return;
            }
        }
    }

    if (result.rows.find(row => row.leader_id === leaderId && (row.status === matchStatus.inQueue || row.status === matchStatus.onHold))) {
        callback(resultCode.alreadyInQueue);
        return;
    }

    if (result.rows.find(row => row.leader_id === leaderId && row.status === matchStatus.win)) {
        callback(resultCode.alreadyWon);
        return;
    }

    if (result.rows.filter(row => row.status === matchStatus.inQueue || row.status === matchStatus.onHold).length >= config.maxQueuesPerChallenger) {
        callback(resultCode.tooManyChallenges);
        return;
    }

    result = await save(`INSERT INTO ${tables.matches} (leader_id, challenger_id, battle_difficulty, battle_format, status, timestamp) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP())`, [leaderId, challengerId, difficulty, format, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (leaderInfo.queue_size === 0) {
        // Notify the challenger that it's their turn to battle, since they're the only one in queue
        const pushMsg = 'Hey champ in making, it\'s time for your next battle! Check your queues in the app!';
        sendPush(pushMsg, getPushTokens(challengerId));
    }

    callback(resultCode.success);
}

export async function dequeue(leaderId, challengerId, callback) {
    let result = await save(`DELETE FROM ${tables.matches} WHERE leader_id = ? AND challenger_id = ? AND status IN (?, ?)`, [leaderId, challengerId, matchStatus.inQueue, matchStatus.onHold]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.notInQueue);
        return;
    }

    // TODO - Maybe make this logic account for duo mode pairs
    clearLinkCode(leaderId, [challengerId]);

    result = await fetch(`SELECT challenger_id FROM ${tables.matches} WHERE leader_id = ? AND status = ? ORDER BY timestamp ASC LIMIT 1`, [leaderId, matchStatus.inQueue]);
    if (!result.resultCode && result.rows.length > 0) {
        // We have at least one challenger in queue, so send a push to the whoever is up next
        const pushMsg = 'Hey champ in making, it\'s time for your next battle! Check your queues in the app!';
        sendPush(pushMsg, getPushTokens(result.rows[0].challenger_id));
    }

    callback(resultCode.success);
}

export async function hold(leaderId, challengerId, callback) {
    let result = await save(`UPDATE ${tables.matches} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`, [matchStatus.onHold, leaderId, challengerId, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount === 0) {
        callback(resultCode.notInQueue);
        return;
    }

    result = await fetch(`SELECT challenger_id FROM ${tables.matches} WHERE leader_id = ? AND status = ? ORDER BY timestamp ASC LIMIT 1`, [leaderId, matchStatus.inQueue]);
    if (!result.resultCode && result.rows.length > 0) {
        // We have at least one challenger in queue, so send a push to the whoever is up next
        const pushMsg = 'Hey champ in making, it\'s time for your next battle! Check your queues in the app!';
        sendPush(pushMsg, getPushTokens(result.rows[0].challenger_id));
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

    if (placeAtFront) {
        // We have at least one challenger in queue, so send a push to the whoever is up next
        const pushMsg = 'Hey champ in making, it\'s time for your next battle! Check your queues in the app!';
        sendPush(pushMsg, getPushTokens(challengerId));
    }

    callback(resultCode.success);
}

export async function getIdsInQueue(leaderId, callback) {
    const result = await fetch(`SELECT challenger_id FROM ${tables.matches} WHERE leader_id = ? AND status = ?`, [leaderId, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    callback(resultCode.success, result.rows.map(row => row.challenger_id));
}
