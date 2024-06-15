/******************************************************
 *                CHALLENGER DB MODULE                *
 *                                                    *
 * This module uses the core db module to expose APIs *
 * for the for challenger-related tasks.              *
 *                                                    *
 * This module exports the following functions:       *
 *   getChallengerInfo, setDisplayName, getBingoBoard *
 ******************************************************/
import config from '../config/config.js';
import logger from '../util/logger.js';
import { fetch, generateBingoBoard, getLinkCode, inflateBingoBoard, save, shouldIncludeFeedbackSurvey, tables } from './core.js';
import { leaderType, matchStatus, resultCode } from '../util/constants.js';

/***************
 * Public APIs *
 ***************/
export async function getChallengerInfo(id, callback) {
    let result = await fetch(`SELECT display_name, bingo_board FROM ${tables.challengers} WHERE id = ?`, [id]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length === 0) {
        callback(resultCode.notFound);
        return;
    }

    const row = result.rows[0];
    const retval = {
        displayName: row.display_name,
        winCount: 0,
        lossCount: 0,
        queuesEntered: [],
        queuesOnHold: [],
        badgesEarned: []
    };

    // aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    result = await fetch(`SELECT m.leader_id, l.leader_name, m.challenger_id, m.battle_difficulty, m.battle_format, l.duo_mode, l.battle_code FROM ${tables.matches} m INNER JOIN ${tables.leaders} l ON l.id = m.leader_id WHERE status = ? AND EXISTS (SELECT 1 FROM ${tables.matches} WHERE leader_id = m.leader_id AND challenger_id = ? AND status = ?) ORDER BY m.leader_id, m.timestamp ASC`, [matchStatus.inQueue, id, matchStatus.inQueue]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i];
        const match = retval.queuesEntered.find(item => item.leaderId === row.leader_id);
        if (!match) {
            retval.queuesEntered.push({
                leaderId: row.leader_id,
                leaderName: row.leader_name,
                position: 0, // Start this at 0, increment if we have additional rows for the leader ID
                linkCode: row.duo_mode ? 'No doubles partner' : row.battle_code || getLinkCode(row.leader_id, [id]),
                difficulty: row.battle_difficulty, // Default to the new row, clobber it if we get another one
                format: row.battle_format, // Same logic here as with difficulty
                positionFound: row.challenger_id === id // Temporary field that gets stripped off before returning the response
            });
        } else {
            if (!match.positionFound) {
                match.position++;
            }

            if (row.challenger_id === id) {
                match.positionFound = true;
                if (row.duo_mode) {
                    // Only overwrite the link code if the leader is in duo mode
                    if (match.position % 2 === 1) {
                        // Second person in a pair will always have a partner
                        match.linkCode = row.battle_code || getLinkCode(row.leader_id, [result.rows[i - 1].challenger_id, id]);
                    } else if (i < result.rows.length - 1 && result.rows[i + 1].leader_id === row.leader_id) {
                        // First person in a pair has a partner if we aren't at the end of the list for the leader
                        match.linkCode = row.battle_code || getLinkCode(row.leader_id, [id, result.rows[i + 1].challenger_id]);
                    }
                }
                match.difficulty = row.battle_difficulty;
                match.format = row.battle_format;
            }
        }
    }

    retval.queuesEntered.forEach(match => delete match.positionFound);

    result = await fetch(`SELECT m.leader_id, l.leader_name, l.leader_type, l.badge_name, m.battle_difficulty, m.battle_format, m.status FROM ${tables.matches} m INNER JOIN ${tables.leaders} l ON l.id = m.leader_id WHERE m.challenger_id = ? AND m.status <> ?`, [id, matchStatus.inQueue]);
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
                difficulty: row.battle_difficulty,
                format: row.battle_format
            });
        } else if (row.status === matchStatus.win || row.status === matchStatus.ash) {
            retval.badgesEarned.push({
                leaderId: row.leader_id,
                leaderName: row.leader_name,
                badgeName: row.badge_name,
                difficulty: row.battle_difficulty,
                format: row.battle_format
            });

            if (row.leader_type === leaderType.champion) {
                championDefeated = true;
            }
        }

        if (row.status === matchStatus.win || row.status === matchStatus.gary) {
            retval.winCount++;
        } else if (row.status === matchStatus.loss || row.status === matchStatus.ash) {
            retval.lossCount++;
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

export async function setDisplayName(id, name, callback) {
    const result = await save(`UPDATE ${tables.challengers} SET display_name = ? WHERE id = ?`, [name, id]);
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

export async function getBingoBoard(id, callback) {
    let result = await fetch(`SELECT bingo_board FROM ${tables.challengers} WHERE id = ?`, [id]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.length === 0) {
        callback(resultCode.notFound);
        return;
    }

    let flatBoard = result.rows[0].bingo_board;
    if (!flatBoard) {
        flatBoard = generateBingoBoard();
        result = await save(`UPDATE ${tables.challengers} SET bingo_board = ? WHERE id = ?`, [flatBoard, id]);
        if (result.resultCode) {
            logger.api.error(`Error saving new bingo board for id=${id}`);
            callback(result.resultCode);
            return;
        } else {
            logger.api.info(`Saved new bingo board for id=${id}`);
        }
    }

    result = await fetch(`SELECT leader_id FROM ${tables.matches} WHERE challenger_id = ? AND status IN (?, ?, ?)`, [id, matchStatus.loss, matchStatus.win, matchStatus.ash]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    callback(resultCode.success, { bingoBoard: inflateBingoBoard(flatBoard, result.rows.map(row => row.leader_id)) });
}
