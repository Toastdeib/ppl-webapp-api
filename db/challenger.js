/******************************************************
 *                CHALLENGER DB MODULE                *
 *                                                    *
 * This module uses the core db module to expose APIs *
 * for the for challenger-related tasks.              *
 *                                                    *
 * This module exports the following functions:       *
 *   getChallengerInfo, setDisplayName, getBingoBoard *
 ******************************************************/
import config from '../config.js';
import logger from '../logger.js';
import { fetch, generateBingoBoard, getLinkCode, inflateBingoBoard, save, shouldIncludeFeedbackSurvey, tables } from './core.js';
import { leaderType, matchStatus, resultCode } from '../constants.js';

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
    let bingoBoard = row.bingo_board;
    if (!bingoBoard) {
        bingoBoard = generateBingoBoard();
        result = await save(`UPDATE ${tables.challengers} SET bingo_board = ? WHERE id = ?`, [bingoBoard, id]);
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
    result = await fetch(`SELECT m.leader_id, l.leader_name, m.challenger_id, m.battle_difficulty, m.battle_format FROM ${tables.matches} m INNER JOIN ${tables.leaders} l ON l.id = m.leader_id WHERE status = ? AND EXISTS (SELECT 1 FROM ${tables.matches} WHERE leader_id = m.leader_id AND challenger_id = ? AND status = ?) AND timestamp <= (SELECT timestamp FROM ${tables.matches} WHERE leader_id = m.leader_id AND challenger_id = ? AND status = ?)`, [matchStatus.inQueue, id, matchStatus.inQueue, id, matchStatus.inQueue]);
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
                difficulty: row.battle_difficulty, // Default to the new row, clobber it if we get another one
                format: row.battle_format // Same logic here as with difficulty
            });
        } else {
            match.position++;
            if (row.challenger_id === id) {
                match.difficulty = row.battle_difficulty;
                match.format = row.battle_format;
            }
        }
    }

    result = await fetch(`SELECT m.leader_id, l.leader_name, l.leader_type, l.badge_name, m.battle_difficulty, m.battle_format, m.status FROM ${tables.matches} m INNER JOIN ${tables.leaders} l ON l.id = m.leader_id WHERE m.challenger_id = ? AND m.status IN (?, ?, ?)`, [id, matchStatus.onHold, matchStatus.win, matchStatus.ash]);
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

    const flatBoard = result.rows[0].bingo_board;
    result = await fetch(`SELECT leader_id FROM ${tables.matches} WHERE challenger_id = ? AND status IN (?, ?, ?)`, [id, matchStatus.loss, matchStatus.win, matchStatus.ash]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    callback(resultCode.success, { bingoBoard: inflateBingoBoard(flatBoard, result.rows.map(row => row.leader_id)) });
}
