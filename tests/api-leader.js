/***********************************************************
 *           TEST SUITE FOR LEADER API FUNCTIONS           *
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
 * TEST_RUN=true TABLE_SUFFIX=_test node api-leader.js     *
 **********************************************************/
if (process.env.TEST_RUN !== 'true' || !process.env.TABLE_SUFFIX) {
    console.log('Environment variables are missing. Proper usage: TEST_RUN=true TABLE_SUFFIX=_test node api-leader.js');
    process.exit();
}

import { leaderType } from '../constants.js';
import { encodeCredentials, sendRequest, init } from './base-api-test.js';
import { name, pass, fail, start, finish } from './test-logger.js';

/****************
 * TESTING DATA *
 ****************/
const username = 'toastleader';
const password = 'password1';
const credentials = { Authorization: encodeCredentials(username, password) };
const token = {};
let basePath;

const challengerId = '5ae3d0f7ea736bda';

/******************
 * TEST FUNCTIONS *
 ******************/
function login() {
    name(1, 'Log in with stored credentials');
    sendRequest('/login', 'POST', {}, credentials, (result) => {
        if (result.status !== 200) {
            fail(`received HTTP status code ${result.status}, aborting test run`);
            finish();
            process.exit();
        } else {
            const data = JSON.parse(result.body);
            if (!data.isLeader) {
                fail(`login succeeded but isLeader=${data.isLeader}, aborting test run`);
                finish();
                process.exit();
            } else {
                pass('successfully logged in');
                token.Authorization = `Bearer ${data.token}`;
                basePath = `/leader/${data.id}`;
                openQueue();
            }
        }
    });
}

function openQueue() {
    name(2, 'Open the queue');
    sendRequest(`${basePath}/openqueue`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (!data.queueOpen) {
                fail(`openqueue response came back with queueOpen=${data.queueOpen}`);
            } else {
                pass('successfully opened leader queue');
            }
        }

        goLive();
    });
}

function goLive() {
    name(3, 'Notify that the leader is live on Twitch');
    sendRequest(`${basePath}/live`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('successfully notified that the leader is live');
        }

        enqueueChallenger1();
    });
}

function enqueueChallenger1() {
    name(4, 'Add a challenger to the queue');
    sendRequest(`${basePath}/enqueue/${challengerId}`, 'POST', { battleDifficulty: leaderType.casual }, token, (result) => {
        if (result.status !== 200) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queue.find(item => item.challengerId === challengerId);
            if (!match) {
                fail('failed to add the challenger to the queue');
            } else {
                pass('successfully added the challenger to the queue');
            }
        }

        holdChallenger();
    });
}

function holdChallenger() {
    name(5, 'Place the challenger on hold');
    sendRequest(`${basePath}/hold/${challengerId}`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.onHold.find(item => item.challengerId === challengerId);
            if (!match) {
                fail('failed to place the challenger on hold');
            } else {
                pass('successfully placed the challenger on hold');
            }
        }

        unholdChallenger();
    });
}

function unholdChallenger() {
    name(6, 'Return the challenger from being on hold');
    sendRequest(`${basePath}/unhold/${challengerId}`, 'POST', { placeAtFront: false }, token, (result) => {
        if (result.status !== 200) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queue.find(item => item.challengerId === challengerId);
            if (!match) {
                fail('failed to return the challenger to the queue');
            } else {
                pass('successfully returned the challenger to the queue');
            }
        }

        dequeueChallenger();
    });
}

function dequeueChallenger() {
    name(7, 'Remove the challenger from queue');
    sendRequest(`${basePath}/dequeue/${challengerId}`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queue.length > 0) {
                fail('failed to remove the challenger from queue');
            } else {
                pass('successfully removed the challenger from queue');
            }
        }

        enqueueChallenger2();
    });
}

function enqueueChallenger2() {
    name(8, 'Add a challenger to queue (again)');
    sendRequest(`${basePath}/enqueue/${challengerId}`, 'POST', { battleDifficulty: leaderType.intermediate }, token, (result) => {
        if (result.status !== 200) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queue.find(item => item.challengerId === challengerId);
            if (!match) {
                fail('failed to add the challenger to the queue');
            } else {
                pass('successfully added the challenger to the queue');
            }
        }

        reportResult();
    });
}

function reportResult() {
    name(9, 'Report a match result');
    sendRequest(`${basePath}/report/${challengerId}`, 'POST', { challengerWin: false, badgeAwarded: false }, token, (result) => {
        if (result.status !== 200) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queue.length > 0) {
                fail('failed to report the match result');
            } else if (!(data.winCount > 0 && data.lossCount === 0 && data.badgesAwarded === 0)) {
                fail('match result was reported incorrectly');
            } else {
                pass('successfully reported the match result');
            }
        }

        closeQueue();
    });
}

function closeQueue() {
    name(10, 'Close the queue');
    sendRequest(`${basePath}/closequeue`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queueOpen) {
                fail(`closequeue response came back with queueOpen=${data.queueOpen}`);
            } else {
                pass('successfully closed leader queue');
            }
        }

        cleanup();
    });
}

function cleanup() {
    // No cleanup necessary for this suite
    finish();
    process.exit();
}

init(() => {
    start(10);
    login();
});
