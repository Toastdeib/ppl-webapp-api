/******************************************************
 *                   MAIN DB MODULE                   *
 *                                                    *
 * This module aggregates the db functions in all of  *
 * the submodules so they can be exposed with a       *
 * single import. Modules using any db functionality  *
 * should import this one rather than the individual  *
 * submodules.                                        *
 ******************************************************/
import { dbReady, debugSave, tables } from './core.js';
import { dequeue, enqueue, hold, unhold } from './queue.js';
import { generateHex, login, register } from './auth.js';
import { getAllChallengers, getLeaderInfo, getLeaderMetrics, reportResult, updateQueueStatus } from './leader.js';
import { getAllIds, getAllLeaderData, getBadges, getOpenQueues } from './general.js';
import { getBingoBoard, getChallengerInfo, setDisplayName } from './challenger.js';

const db = {
    challenger: {
        getInfo: getChallengerInfo,
        setDisplayName: setDisplayName,
        getBingoBoard: getBingoBoard
    },
    leader: {
        getInfo: getLeaderInfo,
        updateQueueStatus: updateQueueStatus,
        reportResult: reportResult,
        getAllChallengers: getAllChallengers,
        metrics: getLeaderMetrics
    },
    queue: {
        enqueue: enqueue,
        dequeue: dequeue,
        hold: hold,
        unhold: unhold
    },
    auth: {
        register: register,
        login: login
    },
    generateHex: generateHex,
    getAllIds: getAllIds,
    getAllLeaderData: getAllLeaderData,
    getOpenQueues: getOpenQueues,
    getBadges: getBadges,
    debugSave: debugSave,
    tables: tables,
    dbReady: dbReady
};

export default db;
