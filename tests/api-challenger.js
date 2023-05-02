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
 **********************************************************/
if (process.env.TEST_RUN !== 'true' || !process.env.TABLE_SUFFIX) {
    console.log('Environment variables are missing. Proper usage: TEST_RUN=true TABLE_SUFFIX=_test node api-challenger.js');
    process.exit();
}

const constants = require('../constants.js');
const base = require('./base-api-test.js');
const test = require('./test-logger.js');

/****************
 * TESTING DATA *
 ****************/
const username = 'toastchallenger';
const password = 'password1';
const credentials = { Authorization: base.encodeCredentials(username, password) };
const token = {};
let basePath;

const newName = 'toastyboi';
const leaderId = 'd08cde9beddd';

/******************
 * TEST FUNCTIONS *
 ******************/
function login() {
    test.name(1, 'Log in with stored credentials');
    base.sendRequest('/login', 'POST', {}, credentials, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}, aborting test run`);
            process.exit();
        } else {
            const data = JSON.parse(result.body);
            if (data.isLeader) {
                test.fail(`login succeeded but isLeader=${data.isLeader}, aborting test run`);
                process.exit();
            } else {
                test.pass('successfully logged in');
                token.Authorization = `Bearer ${data.token}`;
                basePath = `/challenger/${data.id}`;
                setDisplayName();
            }
        }
    });
}

function setDisplayName() {
    test.name(2, 'Update display name');
    base.sendRequest(basePath, 'POST', { displayName: newName }, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.displayName !== newName) {
                test.fail(`displayName=${data.displayName}, expected=${newName}`);
            } else {
                test.pass('successfully updated display name');
            }
        }

        getBingoBoard();
    });
}

function getBingoBoard() {
    test.name(3, 'Fetch and validate bingo board');
    base.sendRequest(`${basePath}/bingoboard`, 'GET', {}, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.length === 0) {
                test.fail('/bingoboard endpoint returned an empty board');
            } else {
                test.pass('successfully fetched bingo board');
            }
        }

        joinQueue1();
    });
}

function joinQueue1() {
    test.name(4, 'Join a leader queue');
    base.sendRequest(`${basePath}/enqueue/${leaderId}`, 'POST', { battleDifficulty: constants.leaderType.casual }, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queuesEntered.find(item => item.leaderId === leaderId);
            if (!match) {
                test.fail('failed to join the leader queue');
            } else {
                test.pass('successfully joined the leader queue');
            }
        }

        leaveQueue1();
    });
}

function leaveQueue1() {
    test.name(5, 'Leave the leader queue');
    base.sendRequest(`${basePath}/dequeue/${leaderId}`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queuesEntered.length > 0) {
                test.fail('failed to leave the leader queue');
            } else {
                test.pass('successfully left the leader queue');
            }
        }

        joinQueue2();
    });
}

function joinQueue2() {
    test.name(6, 'Join a leader queue (again)');
    base.sendRequest(`${basePath}/enqueue/${leaderId}`, 'POST', { battleDifficulty: constants.leaderType.veteran }, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            const match = data.queuesEntered.find(item => item.leaderId === leaderId);
            if (!match) {
                test.fail('failed to join the leader queue');
            } else {
                test.pass('successfully joined the leader queue');
            }
        }

        hold();
    });
}

function hold() {
    test.name(7, 'Go on hold in the queue');
    base.sendRequest(`${basePath}/hold/${leaderId}`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            // TODO - Validate with the actual hold property, when we have that
            if (data.queuesEntered.length > 0) {
                test.fail('failed to go on hold in the leader queue');
            } else {
                test.pass('successfully went on hold in the leader queue');
            }
        }

        leaveQueue2();
    });
}

function leaveQueue2() {
    test.name(8, 'Leave the queue while on hold');
    base.sendRequest(`${basePath}/dequeue/${leaderId}`, 'POST', {}, token, (result) => {
        if (result.status !== 200) {
            test.fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queuesEntered.length > 0) {
                test.fail('failed to leave the leader queue');
            } else {
                test.pass('successfully left the leader queue');
            }
        }

        cleanup();
    });
}

function cleanup() {
    test.finish();
    base.sendRequest(basePath, 'POST', { displayName: 'toastchallenger' }, token, (result) => {
        if (result.status !== 200) {
            test.debug(`Unable to revert display name, response came back with status=${result.status}`);
            process.exit();
        }

        test.debug('Successfully reverted display name');
        process.exit();
    });
}

base.init(() => {
    test.start(8);
    login();
});