/***********************************************************
 *         TEST SUITE FOR CHALLENGER API FUNCTIONS         *
 *                                                         *
 * These test files expect two environment variables to be *
 * set: TEST_RUN=true and TABLE_SUFFIX=_test. The former   *
 * instructs the logger to write to console and not the    *
 * log files, and the latter causes all of the db          *
 * operations to run on a set of test tables that have     *
 * been populated for this suite and shouldn't be touched  *
 * outside of the tests (unless the tests themselves are   *
 * changing).                                              *
 *                                                         *
 * Usage:                                                  *
 * TEST_RUN=true TABLE_SUFFIX=_test node api-challenger.js *
 ***********************************************************/
if (process.env.TEST_RUN !== 'true' || !process.env.TABLE_SUFFIX) {
    console.log('Environment variables are missing. Proper usage: TEST_RUN=true TABLE_SUFFIX=_test node api-challenger.js');
    process.exit();
}

import { clearCache, encodeCredentials, init, sendRequest } from './base-api-test.js';
import { debug, fail, finish, name, pass, start } from './test-logger.js';
import { httpStatus, leaderType, resultCode } from '../constants.js';

/****************
 * TESTING DATA *
 ****************/
const username = 'toastchallenger';
const password = 'password1';
const credentials = {
    Authorization: encodeCredentials(username, password),
    'PPL-Event': 'online'
};
const token = {};
let basePath;

const newName = 'toastyboi';
const leaderId = 'd08cde9beddd';

/******************
 * TEST FUNCTIONS *
 ******************/
function login() {
    name(1, 'Log in with stored credentials');
    sendRequest('/login', 'POST', {}, credentials, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}, aborting test run`);
            finish();
            process.exit();
        } else {
            const data = JSON.parse(result.body);
            if (data.isLeader) {
                fail(`login succeeded but isLeader=${data.isLeader}, aborting test run`);
                finish();
                process.exit();
            } else {
                pass('successfully logged in');
                token.Authorization = `Bearer ${data.token}`;
                basePath = `/challenger/${data.id}`;
                setDisplayName();
            }
        }
    });
}

function setDisplayName() {
    name(2, 'Update display name');
    sendRequest(basePath, 'POST', { displayName: newName }, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.displayName !== newName) {
                fail(`displayName=${data.displayName}, expected=${newName}`);
            } else {
                pass('successfully updated display name');
            }
        }

        getBingoBoard();
    });
}

function getBingoBoard() {
    name(3, 'Fetch and validate bingo board');
    sendRequest(`${basePath}/bingoboard`, 'GET', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.length === 0) {
                fail('/bingoboard endpoint returned an empty board');
            } else {
                pass('successfully fetched bingo board');
            }
        }

        joinQueue1();
    });
}

function joinQueue1() {
    name(4, 'Join a leader queue');
    sendRequest(`${basePath}/enqueue/${leaderId}`, 'POST', { battleDifficulty: leaderType.casual }, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queuesEntered.find(item => item.leaderId === leaderId);
            if (!match) {
                fail('failed to join the leader queue');
            } else {
                pass('successfully joined the leader queue');
            }
        }

        joinQueue2();
    });
}

function joinQueue2() {
    name(5, 'Attempt to join a leader queue the challenger is already in');
    sendRequest(`${basePath}/enqueue/${leaderId}`, 'POST', { battleDifficulty: leaderType.casual }, token, (result) => {
        if (result.status === httpStatus.ok) {
            fail('successfully joined the leader queue');
        } else {
            const data = JSON.parse(result.body);
            if (result.status !== httpStatus.badRequest || data.code !== resultCode.alreadyInQueue) {
                fail(`failed to join the leader queue with unexpected HTTP status code ${result.status} and/or error code ${data.code}`);
            } else {
                pass(`failed to join the leader queue with HTTP status code ${result.status} and error code ${data.code}`);
            }
        }

        leaveQueue1();
    });
}

function leaveQueue1() {
    name(6, 'Leave the leader queue');
    sendRequest(`${basePath}/dequeue/${leaderId}`, 'POST', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queuesEntered.length > 0) {
                fail('failed to leave the leader queue');
            } else {
                pass('successfully left the leader queue');
            }
        }

        joinQueue3();
    });
}

function joinQueue3() {
    name(7, 'Join a leader queue (again)');
    sendRequest(`${basePath}/enqueue/${leaderId}`, 'POST', { battleDifficulty: leaderType.veteran }, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queuesEntered.find(item => item.leaderId === leaderId);
            if (!match) {
                fail('failed to join the leader queue');
            } else {
                pass('successfully joined the leader queue');
            }
        }

        hold();
    });
}

function hold() {
    name(8, 'Go on hold in the queue');
    sendRequest(`${basePath}/hold/${leaderId}`, 'POST', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queuesOnHold.find(item => item.leaderId === leaderId);
            if (!match) {
                fail('failed to go on hold in the leader queue');
            } else {
                pass('successfully went on hold in the leader queue');
            }
        }

        leaveQueue2();
    });
}

function leaveQueue2() {
    name(9, 'Leave the queue while on hold');
    sendRequest(`${basePath}/dequeue/${leaderId}`, 'POST', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queuesEntered.length > 0 || data.queuesOnHold.length > 0) {
                fail('failed to leave the leader queue');
            } else {
                pass('successfully left the leader queue');
            }
        }

        cleanup();
    });
}

function cleanup() {
    finish();
    sendRequest(basePath, 'POST', { displayName: 'toastchallenger' }, token, (result) => {
        if (result.status !== httpStatus.ok) {
            debug(`Unable to revert display name, response came back with status=${result.status}`);
            process.exit();
        }

        debug('Successfully reverted display name');
        clearCache();
        process.exit();
    });
}

init(() => {
    start(9);
    login();
});
