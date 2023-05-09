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

const constants = require('../constants.js');
const base = require('./base-api-test.js');
const test = require('./test-logger.js');

/****************
 * TESTING DATA *
 ****************/
const username = 'toastleader';
const password = 'password1';
const credentials = { Authorization: base.encodeCredentials(username, password) };
const token = {};
let basePath;

const challengerId = '5ae3d0f7ea736bda';

/******************
 * TEST FUNCTIONS *
 ******************/
function login() {
    test.name(1, 'Log in with stored credentials');
    base.sendRequest('/login', 'POST', {}, credentials, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}, aborting test run`);
            test.finish();
            process.exit();
        } else {
            const data = JSON.parse(result.body);
            if (!data.isLeader) {
                test.fail(`login succeeded but isLeader=${data.isLeader}, aborting test run`);
                test.finish();
                process.exit();
            } else {
                test.pass('successfully logged in');
                token.Authorization = `Bearer ${data.token}`;
                basePath = `/leader/${data.id}`;
                openQueue();
            }
        }
    });
}

function openQueue() {
    test.name(2, 'Open the queue');
    base.sendRequest(`${basePath}/openqueue`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (!data.queueOpen) {
                test.fail(`openqueue response came back with queueOpen=${data.queueOpen}`);
            } else {
                test.pass('successfully opened leader queue');
            }
        }

        goLive();
    });
}

function goLive() {
    test.name(3, 'Notify that the leader is live on Twitch');
    base.sendRequest(`${basePath}/live`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            test.pass('successfully notified that the leader is live');
        }

        enqueueChallenger1();
    });
}

function enqueueChallenger1() {
    test.name(4, 'Add a challenger to the queue');
    base.sendRequest(`${basePath}/enqueue/${challengerId}`, 'POST', { battleDifficulty: constants.leaderType.casual }, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queue.find(item => item.challengerId === challengerId);
            if (!match) {
                test.fail('failed to add the challenger to the queue');
            } else {
                test.pass('successfully added the challenger to the queue');
            }
        }

        holdChallenger();
    });
}

function holdChallenger() {
    test.name(5, 'Place the challenger on hold');
    base.sendRequest(`${basePath}/hold/${challengerId}`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.onHold.find(item => item.challengerId === challengerId);
            if (!match) {
                test.fail('failed to place the challenger on hold');
            } else {
                test.pass('successfully placed the challenger on hold');
            }
        }

        unholdChallenger();
    });
}

function unholdChallenger() {
    test.name(6, 'Return the challenger from being on hold');
    base.sendRequest(`${basePath}/unhold/${challengerId}`, 'POST', { placeAtFront: false }, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queue.find(item => item.challengerId === challengerId);
            if (!match) {
                test.fail('failed to return the challenger to the queue');
            } else {
                test.pass('successfully returned the challenger to the queue');
            }
        }

        dequeueChallenger();
    });
}

function dequeueChallenger() {
    test.name(7, 'Remove the challenger from queue');
    base.sendRequest(`${basePath}/dequeue/${challengerId}`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queue.length > 0) {
                test.fail('failed to remove the challenger from queue');
            } else {
                test.pass('successfully removed the challenger from queue');
            }
        }

        enqueueChallenger2();
    });
}

function enqueueChallenger2() {
    test.name(8, 'Add a challenger to queue (again)');
    base.sendRequest(`${basePath}/enqueue/${challengerId}`, 'POST', { battleDifficulty: constants.leaderType.intermediate }, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queue.find(item => item.challengerId === challengerId);
            if (!match) {
                test.fail('failed to add the challenger to the queue');
            } else {
                test.pass('successfully added the challenger to the queue');
            }
        }

        reportResult();
    });
}

function reportResult() {
    test.name(9, 'Report a match result');
    base.sendRequest(`${basePath}/report/${challengerId}`, 'POST', { challengerWin: false, badgeAwarded: false }, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queue.length > 0) {
                test.fail('failed to report the match result');
            } else if (!(data.winCount > 0 && data.lossCount === 0 && data.badgesAwarded === 0)) {
                test.fail('match result was reported incorrectly');
            } else {
                test.pass('successfully reported the match result');
            }
        }

        closeQueue();
    });
}

function closeQueue() {
    test.name(10, 'Close the queue');
    base.sendRequest(`${basePath}/closequeue`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queueOpen) {
                test.fail(`closequeue response came back with queueOpen=${data.queueOpen}`);
            } else {
                test.pass('successfully closed leader queue');
            }
        }

        cleanup();
    });
}

function cleanup() {
    // No cleanup necessary for this suite
    test.finish();
    process.exit();
}

base.init(() => {
    test.start(10);
    login();
});
