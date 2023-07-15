/***********************************************************
 *          TEST SUITE FOR GENERAL API FUNCTIONS           *
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
 * TEST_RUN=true TABLE_SUFFIX=_test node api-general.js    *
 ***********************************************************/
if (process.env.TEST_RUN !== 'true' || !process.env.TABLE_SUFFIX) {
    console.log('Environment variables are missing. Proper usage: TEST_RUN=true TABLE_SUFFIX=_test node api-challenger.js');
    process.exit();
}

import { httpStatus } from '../util/constants.js';
import { clearCache, init, sendRequest } from './base-api-test.js';
import { fail, finish, name, next, pass, start } from './test-logger.js';

/****************
 * TESTING DATA *
 ****************/
const queueStatuses = {
    'd08cde9beddd': true,
    'dc43670ce8bc': true,
    '737644fef008': true,
    '6a9406eedec6': false,
    '7729e38c3f7d': false,
    'bcc6f08242fb': false
};
const challengerWithoutBadges = {
    id: '5ae3d0f7ea736bda',
    displayName: 'testchallenger7',
    badgeCount: 0
};
const challengerWithBadges = {
    id: 'efaa0cdd1cbd165b',
    displayName: 'testchallenger1',
    badgeCount: 11
};
const leaderCount = 28;
const metricsCount = 12;

/******************
 * TEST FUNCTIONS *
 ******************/
function getAppSettings() {
    name(1, 'Fetch and validate app settings');
    sendRequest('/api/v2/appsettings', 'GET', {}, {}, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.showTrainerCard === undefined) {
                fail('payload was missing showTrainerCard property');
            } else if (data.eventIsOver === undefined) {
                fail('payload was missing eventIsOver property');
            } else {
                pass('payload contained all expected properties');
            }
        }

        next(getOpenQueues);
    });
}

function getOpenQueues() {
    name(2, 'Fetch and validate a list of open leader queues');
    sendRequest('/api/v2/openqueues', 'GET', {}, {}, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            let mismatches = 0;
            for (const key of Object.keys(queueStatuses)) {
                if (queueStatuses[key] !== data[key]) {
                    mismatches++;
                }
            }

            if (mismatches > 0) {
                fail(`${mismatches} leader(s) had queue statuses that didn't match the expected values`);
            } else {
                pass('all checked queue statuses matched the expected values');
            }
        }

        next(getBadges1);
    });
}

function getBadges1() {
    name(3, 'Fetch and validate an empty badge list');
    sendRequest(`/api/v2/badges/${challengerWithoutBadges.id}`, 'GET', {}, {}, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.displayName !== challengerWithoutBadges.displayName) {
                fail(`displayName=${data.displayName}, expected=${challengerWithoutBadges.displayName}`);
            } else if (data.badgesEarned.length !== challengerWithoutBadges.badgeCount) {
                fail(`badgeCount=${data.badgesEarned.length}, expected=${challengerWithoutBadges.badgeCount}`);
            } else {
                pass('display name and badge count were correct');
            }
        }

        next(getBadges2);
    });
}

function getBadges2() {
    name(4, 'Fetch and validate a non-empty badge list');
    sendRequest(`/api/v2/badges/${challengerWithBadges.id}`, 'GET', {}, {}, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (data.displayName !== challengerWithBadges.displayName) {
                fail(`displayName=${data.displayName}, expected=${challengerWithBadges.displayName}`);
            } else if (data.badgesEarned.length !== challengerWithBadges.badgeCount) {
                fail(`badgeCount=${data.badgesEarned.length}, expected=${challengerWithBadges.badgeCount}`);
            } else {
                pass('display name and badge count were correct');
            }
        }

        next(logInfo);
    });

}

function logInfo() {
    name(5, 'Log an info-level message');
    sendRequest('/api/v2/loginfo', 'POST', { message: 'Test info log, please ignore' }, {}, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('request returned with a valid HTTP status');
        }

        next(logInfoWithoutMessage);
    });

}

function logInfoWithoutMessage() {
    name(6, 'Attempt to log an info-level message without including a message in the body');
    sendRequest('/api/v2/loginfo', 'POST', {}, {}, (result) => {
        if (result.status !== httpStatus.badRequest) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('request was rejected as a bad request');
        }

        next(logWarning);
    });

}

function logWarning() {
    name(7, 'Log a warning-level message');
    sendRequest('/api/v2/logwarning', 'POST', { message: 'Test warning log, please ignore' }, {}, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('request returned with a valid HTTP status');
        }

        next(logError);
    });

}

function logError() {
    name(8, 'Log an error-level message');
    sendRequest('/api/v2/logerror', 'POST', { message: 'Test error log, please ignore' }, {}, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('request returned with a valid HTTP status');
        }

        next(logErrorWithStackTrace);
    });

}

function logErrorWithStackTrace() {
    name(9, 'Log an error-level message and stack trace');
    sendRequest('/api/v2/logerror', 'POST', { message: 'Test error log, please ignore', stackTrace: ' at tests/api-general.js line [number]' }, {}, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            pass('request returned with a valid HTTP status');
        }

        next(getAllLeaderData);
    });

}

function getAllLeaderData() {
    name(10, 'Fetch all leader data');
    sendRequest('/api/v2/allleaderdata', 'GET', {}, {}, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (Object.keys(data).length !== leaderCount) {
                fail(`leader count=${Object.keys(data).length}, expected=${leaderCount}`);
            } else {
                pass('successfully fetched leader data');
            }
        }

        next(getLeaderMetrics);
    });
}

function getLeaderMetrics() {
    name(11, 'Fetch leader metrics');
    sendRequest('/api/v2/metrics', 'GET', {}, {}, (result) => {
        if (result.status !== httpStatus.ok) {
            fail(`received HTTP status code ${result.status}`);
        } else {
            const data = JSON.parse(result.body);
            if (Object.keys(data).length !== metricsCount) {
                fail(`leader count=${Object.keys(data).length}, expected=${metricsCount}`);
            } else {
                pass('successfully fetched leader metrics');
            }
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
    start(11);
    getAppSettings();
});
