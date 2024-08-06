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
 ***********************************************************/
if (process.env.TEST_RUN !== 'true' || !process.env.TABLE_SUFFIX) {
    console.log('Environment variables are missing. Proper usage: TEST_RUN=true TABLE_SUFFIX=_test node api-leader.js');
    process.exit();
}

import { battleFormat, httpStatus, leaderType } from '../util/constants.js';
import { clearCache, encodeCredentials, init, sendRequest } from './base-api-test.js';
import { fail, finish, name, next, pass, start } from './test-logger.js';

/****************
 * TESTING DATA *
 ****************/
const credentials = { Authorization: encodeCredentials('toastleader', 'password1') };
const pplEvent = { 'PPL-Event': 'online' };
const token = {};
let basePath;
let logoutPath;

const challengerId = '5ae3d0f7ea736bda';
const allChallengers = {
    count: 1,
    id: '77959f8b9e892345'
};

const customLinkCode = {
    validSet: '12345678',
    invalidSetLetters: '1a2b3c4d',
    invalidSetFormat: '1234 5678',
    get: '1234 5678'
};

/******************
 * TEST FUNCTIONS *
 ******************/
function login() {
    name(1, 'Log in with stored credentials');
    sendRequest('/api/v2/login', 'POST', {}, { ...credentials, ...pplEvent }, (result) => {
        if (result.status !== httpStatus.ok) {
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
                basePath = `/api/v2/leader/${data.id}`;
                logoutPath = `/api/v2/logout/${data.id}`;
                next(openQueue);
            }
        }
    });
}

function openQueue() {
    name(2, 'Open the queue');
    sendRequest(`${basePath}/openqueue`, 'POST', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (!data.queueOpen) {
                fail(`openqueue response came back with queueOpen=${data.queueOpen}`);
            } else {
                pass('successfully opened leader queue');
            }
        }

        next(goLive);
    });
}

function goLive() {
    name(3, 'Notify that the leader is live on Twitch');
    sendRequest(`${basePath}/live`, 'POST', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('successfully notified that the leader is live');
        }

        next(enqueueChallenger1);
    });
}

function enqueueChallenger1() {
    name(4, 'Add a challenger to the queue');
    sendRequest(`${basePath}/enqueue/${challengerId}`, 'POST', { battleDifficulty: leaderType.casual, battleFormat: battleFormat.singles }, token, (result) => {
        if (result.status !== httpStatus.ok) {
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

        next(setInvalidCustomLinkCode1);
    });
}

function setInvalidCustomLinkCode1() {
    name(5, 'Attempt to set invalid custom link code (letters)');
    sendRequest(basePath, 'PUT', { linkCode: customLinkCode.invalidSetLetters }, token, (result) => {
        if (result.status !== httpStatus.badRequest) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('received bad request HTTP status code');
        }

        next(setInvalidCustomLinkCode2);
    });
}

function setInvalidCustomLinkCode2() {
    name(6, 'Attempt to set invalid custom link code (format)');
    sendRequest(basePath, 'PUT', { linkCode: customLinkCode.invalidSetFormat }, token, (result) => {
        if (result.status !== httpStatus.badRequest) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('received bad request HTTP status code');
        }

        next(setValidCustomLinkCode);
    });
}

function setValidCustomLinkCode() {
    name(7, 'Attempt to set valid custom link code');
    sendRequest(basePath, 'PUT', { linkCode: customLinkCode.validSet }, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.linkCode !== customLinkCode.get) {
                fail(`API returned incorrect link code ${data.linkCode}`);
            } else if (!data.queue.every(match => match.linkCode === customLinkCode.get)) {
                fail('not all battles in queue had the custom link code set');
            } else {
                pass('successfully set a custom link code');
            }
        }

        next(clearCustomLinkCode);
    });
}

function clearCustomLinkCode() {
    name(8, 'Attempt to clear custom link code');
    sendRequest(basePath, 'PUT', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.linkCode) {
                fail(`API returned unexpected link code ${data.linkCode}`);
            } else if (data.queue.every(match => match.linkCode === customLinkCode.get)) {
                // NOTE: There's a 1/10^8 chance that this fails because the randomly generated code
                // winds up as 1234 5678. But I'm willing to play those odds.
                fail('all battles in queue still had the custom link code set');
            } else {
                pass('successfully cleared the custom link code');
            }
        }

        next(holdChallenger);
    });
}

function holdChallenger() {
    name(9, 'Place the challenger on hold');
    sendRequest(`${basePath}/hold/${challengerId}`, 'POST', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
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

        next(unholdChallenger);
    });
}

function unholdChallenger() {
    name(10, 'Return the challenger from being on hold');
    sendRequest(`${basePath}/unhold/${challengerId}`, 'POST', { placeAtFront: false }, token, (result) => {
        if (result.status !== httpStatus.ok) {
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

        next(dequeueChallenger);
    });
}

function dequeueChallenger() {
    name(11, 'Remove the challenger from queue');
    sendRequest(`${basePath}/dequeue/${challengerId}`, 'DELETE', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queue.length > 0) {
                fail('failed to remove the challenger from queue');
            } else {
                pass('successfully removed the challenger from queue');
            }
        }

        next(enqueueChallenger2);
    });
}

function enqueueChallenger2() {
    name(12, 'Add a challenger to queue (again)');
    sendRequest(`${basePath}/enqueue/${challengerId}`, 'POST', { battleDifficulty: leaderType.intermediate, battleFormat: battleFormat.doubles }, token, (result) => {
        if (result.status !== httpStatus.ok) {
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

        next(reportResult);
    });
}

function reportResult() {
    name(13, 'Report a match result');
    sendRequest(`${basePath}/report/${challengerId}`, 'POST', { challengerWin: false, badgeAwarded: false }, token, (result) => {
        if (result.status !== httpStatus.ok) {
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

        next(closeQueue);
    });
}

function closeQueue() {
    name(14, 'Close the queue');
    sendRequest(`${basePath}/closequeue`, 'POST', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.queueOpen) {
                fail(`closequeue response came back with queueOpen=${data.queueOpen}`);
            } else {
                pass('successfully closed leader queue');
            }
        }

        next(getAllChallengers);
    });
}

function getAllChallengers() {
    name(15, 'Fetch and validate the challenger list');
    sendRequest(`${basePath}/allchallengers`, 'GET', {}, { ...token, ...pplEvent }, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.length !== allChallengers.count) {
                fail(`challenger count=${data.length}, expected=${allChallengers.count}`);
            } else if (data[0].id !== allChallengers.id) {
                fail(`challenger list contained id=${data[0].id}, expected=${allChallengers.id}`);
            } else {
                pass('successfully got challenger list');
            }
        }

        next(logout);
    });
}

function logout() {
    name(16, 'Log out and end the session');
    sendRequest(logoutPath, 'POST', {}, token, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('successfully logged out');
        }

        next(getLeaderInfo);
    });
}

function getLeaderInfo() {
    name(17, 'Attempt to fetch leader info after logging out');
    sendRequest(basePath, 'GET', {}, token, (result) => {
        if (result.status !== httpStatus.unauthorized) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('received unauthorized HTTP status code');
        }

        next(cleanup);
    });
}

function cleanup() {
    // No cleanup necessary for this suite
    finish();
    clearCache();
    process.exit();
}

init(() => {
    start(17);
    login();
});
