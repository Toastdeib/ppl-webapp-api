/******************************************************
 *                  LEADER DB MODULE                  *
 *                                                    *
 * This module uses the core db module to expose APIs *
 * for the leader-related tasks.                      *
 *                                                    *
 * This module exports the following functions:       *
 *   getLeaderInfo, updateQueueStatus, reportResult,  *
 *   getAllChallengers, getLeaderMetrics              *
 ******************************************************/
import config from '../config/config.js';
import { sendPush } from '../push/push.js';
import { battleFormat, leaderType, matchStatus, queueStatus, resultCode } from '../util/constants.js';
import { clearLinkCode, fetch, getLinkCode, getPushTokens, save, shouldIncludeFeedbackSurvey, tables } from './core.js';

/***************
 * Public APIs *
 ***************/
export async function getLeaderInfo(id, callback) {
    let result = await fetch(`SELECT leader_name, leader_type, battle_format, badge_name, queue_open, duo_mode, twitch_handle FROM ${tables.leaders} WHERE id = ?`, [id]);
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
        battleFormat: result.rows[0].battle_format,
        badgeName: result.rows[0].badge_name,
        queueOpen: !!result.rows[0].queue_open,
        duoMode: !!result.rows[0].duo_mode,
        twitchEnabled: !!result.rows[0].twitch_handle,
        winCount: 0,
        lossCount: 0,
        badgesAwarded: 0,
        queue: [],
        onHold: []
    };

    result = await fetch(`SELECT m.challenger_id, c.display_name, m.status, m.battle_difficulty, m.battle_format FROM ${tables.matches} m INNER JOIN ${tables.challengers} c ON c.id = m.challenger_id WHERE m.leader_id = ? AND m.status IN (?, ?) ORDER BY m.status, m.timestamp ASC`, [id, matchStatus.inQueue, matchStatus.onHold]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i];
        let linkCode;
        if (!retval.duoMode) {
            // The easy path; 1:1 challenger to code mapping
            linkCode = getLinkCode(id, [row.challenger_id]);
        } else {
            // The hard path; 2:1 challenger to code mapping, so check the parity of i and if we have enough people for a code
            if (i % 2 === 1) {
                // Second person in a pair will always have a partner
                linkCode = getLinkCode(id, [result.rows[i - 1].challenger_id, row.challenger_id]);
            } else if (i < result.rows.length - 1) {
                // First person in a pair has a partner if we aren't at the end of the list
                linkCode = getLinkCode(id, [row.challenger_id, result.rows[i + 1].challenger_id]);
            } else {
                // First person in a pair at the end of the list has no partner yet
                linkCode = 'No doubles partner';
            }
        }

        if (row.status === matchStatus.inQueue) {
            retval.queue.push({
                challengerId: row.challenger_id,
                displayName: row.display_name,
                position: i,
                linkCode: linkCode,
                difficulty: row.battle_difficulty,
                format: row.battle_format
            });
        } else {
            retval.onHold.push({
                challengerId: row.challenger_id,
                displayName: row.display_name
            });
        }
    }

    result = await fetch(`SELECT status, battle_format, challenger_id FROM ${tables.matches} WHERE leader_id = ? AND status NOT IN (?, ?)`, [id, matchStatus.inQueue, matchStatus.onHold]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    for (const row of result.rows) {
        // Win/loss is from the challenger perspective, so it's inverted here
        const isSpecial = row.battle_format === battleFormat.special;
        switch (row.status) {
            case matchStatus.loss:
                if (!isSpecial) {
                    retval.winCount++;
                }
                break;
            case matchStatus.win:
                retval.badgesAwarded++;
                if (!isSpecial) {
                    retval.lossCount++;
                }
                break;
            case matchStatus.ash:
                retval.badgesAwarded++;
                if (!isSpecial) {
                    retval.winCount++;
                }
                break;
            case matchStatus.gary:
                if (!isSpecial) {
                    retval.lossCount++;
                }
                break;
        }
    }

    if (shouldIncludeFeedbackSurvey()) {
        retval.feedbackSurveyUrl = config.leaderSurveyUrl;
    }

    callback(resultCode.success, retval);
}

export async function updateQueueStatus(id, open, duoMode, callback) {
    let result = await fetch(`SELECT queue_open, battle_format FROM ${tables.leaders} WHERE id = ?`, [id]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length === 0) {
        callback(resultCode.notFound);
        return;
    }

    const row = result.rows[0];
    if (open === !!row.queue_open) {
        callback(open ? resultCode.queueAlreadyOpen : resultCode.queueAlreadyClosed);
        return;
    }

    if (open && duoMode && !(row.battle_format & battleFormat.multi)) {
        callback(resultCode.duoModeNotSupported);
        return;
    }

    result = await save(`UPDATE ${tables.leaders} SET queue_open = ?, duo_mode = ? WHERE id = ?`, [open ? queueStatus.open : queueStatus.closed, duoMode ? queueStatus.open : queueStatus.closed, id]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    callback(resultCode.success, {});
}

export async function reportResult(leaderId, challengerIds, challengerWin, badgeAwarded, callback) {
    if (challengerIds.length < 1 || challengerIds.length > 2) {
        // Only supports reports for 1 or 2 challengers (regular or multi-battles)
        callback(resultCode.badRequest);
        return;
    }

    let matchResult;
    if (challengerWin) {
        matchResult = badgeAwarded ? matchStatus.win : matchStatus.gary;
    } else {
        matchResult = badgeAwarded ? matchStatus.ash : matchStatus.loss;
    }

    let result;
    if (challengerIds.length === 1) {
        result = await save(`UPDATE ${tables.matches} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`, [matchResult, leaderId, challengerIds[0], matchStatus.inQueue]);
    } else {
        // Guaranteed to be 2 challengers thanks to the check above
        result = await save(`UPDATE ${tables.matches} SET status = ? WHERE leader_id = ? AND challenger_id IN (?, ?) AND status = ?`, [matchResult, leaderId, challengerIds[0], challengerIds[1], matchStatus.inQueue]);
    }

    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rowCount !== challengerIds.length) {
        callback(resultCode.notInQueue);
        return;
    }

    result = await fetch(`SELECT leader_type, duo_mode FROM ${tables.leaders} WHERE id = ?`, [leaderId]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    let hof = false;
    if (challengerWin) {
        // The query will return a row only if the leader ID is the champ; otherwise it'll be an empty set
        hof = result.rows.length > 0 && result.rows[0].leader_type === leaderType.champion;
    }

    clearLinkCode(leaderId, challengerIds);

    const duoMode = result.rows.length > 0 && !!result.rows.duo_mode;
    result = await fetch(`SELECT challenger_id FROM ${tables.matches} WHERE leader_id = ? AND status = ? ORDER BY timestamp ASC LIMIT ?`, [leaderId, matchStatus.inQueue, duoMode ? 2 : 1]);
    if (!result.resultCode && result.rows.length > 0) {
        // We have at least one challenger in queue, so send a push to the whoever is up next
        const pushMsg = 'Hey champ in making, it\'s time for your next battle! Check your queues in the app!';
        for (const row of result.rows) {
            sendPush(pushMsg, getPushTokens(row.challenger_id));
        }
    }

    callback(resultCode.success, { hof: hof });
}

export async function getAllChallengers(eventMask, callback) {
    const result = await fetch(`SELECT c.id, c.display_name FROM ${tables.challengers} c INNER JOIN ${tables.logins} l ON l.id = c.id WHERE l.ppl_events & ? <> 0 AND l.is_leader = 0`, [eventMask]);
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

export async function getLeaderMetrics(callback) {
    const result = await fetch(`SELECT l.id, l.leader_name, m.status, m.battle_format FROM ${tables.matches} AS m INNER JOIN ${tables.leaders} AS l ON l.id = m.leader_id WHERE m.status NOT IN (?, ?)`, [matchStatus.inQueue, matchStatus.onHold]);
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

        const isSpecial = row.battle_format === battleFormat.special;
        switch (row.status) {
            case matchStatus.loss:
                if (!isSpecial) {
                    retval[row.id].wins++;
                }
                break;
            case matchStatus.win:
                retval[row.id].badgesAwarded++;
                if (!isSpecial) {
                    retval[row.id].losses++;
                }
                break;
            case matchStatus.ash:
                retval[row.id].badgesAwarded++;
                if (!isSpecial) {
                    retval[row.id].wins++;
                }
                break;
            case matchStatus.gary:
                if (!isSpecial) {
                    retval[row.id].losses++;
                }
                break;
        }
    }

    callback(resultCode.success, retval);
}
