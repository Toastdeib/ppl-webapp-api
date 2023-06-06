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
import { battleFormat, leaderType, matchStatus, queueStatus, resultCode } from '../util/constants.js';
import { clearLinkCode, fetch, getLinkCode, pplEventToBitmask, save, shouldIncludeFeedbackSurvey, tables } from './core.js';

/***************
 * Public APIs *
 ***************/
export async function getLeaderInfo(id, callback) {
    let result = await fetch(`SELECT leader_name, leader_type, badge_name, queue_open, twitch_handle FROM ${tables.leaders} WHERE id = ?`, [id]);
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

    result = await fetch(`SELECT m.challenger_id, c.display_name, m.status, m.battle_difficulty, m.battle_format FROM ${tables.matches} m INNER JOIN ${tables.challengers} c ON c.id = m.challenger_id WHERE m.leader_id = ? AND m.status IN (?, ?) ORDER BY m.timestamp ASC`, [id, matchStatus.inQueue, matchStatus.onHold]);
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

export async function updateQueueStatus(id, open, callback) {
    const result = await save(`UPDATE ${tables.leaders} SET queue_open = ? WHERE id = ?`, [open ? queueStatus.open : queueStatus.closed, id]);
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

export async function reportResult(leaderId, challengerId, challengerWin, badgeAwarded, callback) {
    let matchResult;
    if (challengerWin) {
        matchResult = badgeAwarded ? matchStatus.win : matchStatus.gary;
    } else {
        matchResult = badgeAwarded ? matchStatus.ash : matchStatus.loss;
    }

    let result = await save(`UPDATE ${tables.matches} SET status = ? WHERE leader_id = ? AND challenger_id = ? AND status = ?`, [matchResult, leaderId, challengerId, matchStatus.inQueue]);
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
        result = await fetch(`SELECT 1 FROM ${tables.leaders} WHERE id = ? AND leader_type = ?`, [leaderId, leaderType.champion]);
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

export async function getAllChallengers(eventString, callback) {
    const eventMask = pplEventToBitmask(eventString);
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
