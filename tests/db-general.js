/**********************************************************
 *          TEST SUITE FOR GENERAL DB FUNCTIONS           *
 *                                                        *
 * These test files expect two environment variables to   *
 * be set: TEST_RUN=true and TABLE_SUFFIX=_test. The      *
 * former instructs the logger to write to console and    *
 * not the log files, and the latter causes all of the db *
 * operations to run on a set of test tables that have    *
 * been populated for this suite and shouldn't be touched *
 * outside of the tests (unless the tests themselves are  *
 * changing).                                             *
 *                                                        *
 * Usage:                                                 *
 * TEST_RUN=true TABLE_SUFFIX=_test node db-general.js    *
 **********************************************************/
if (process.env.TEST_RUN !== 'true' || !process.env.TABLE_SUFFIX) {
    console.log('Environment variables are missing. Proper usage: TEST_RUN=true TABLE_SUFFIX=_test node db-general.js');
    process.exit();
}

import db from '../db/db.js';
import { challengerErrors, leaderErrors } from '../util/errors.js';
import { debug, fail, finish, name, next, pass, start } from './test-logger.js';
import { pplEvent, resultCode } from '../util/constants.js';

/****************
 * TESTING DATA *
 ****************/
const idCounts = {
    east: {
        first: 9,
        second: 10
    },
    west: {
        first: 9,
        second: 9,
        third: 10
    },
    all: {
        challengers: {
            first: 10,
            second: 11
        },
        leaders: {
            first: 28,
            second: 28
        }
    }
};

const shortUsername = 'abc';
const longUsername = 'thisisaverylongusernamewhichexceedsthirtycharacters';
const takenUsername = 'testchallenger1';
const newUsername = 'newtestchallenger1';
const password = 'password1';
const badPassword = 'password2';
const badgesId = 'efaa0cdd1cbd165b';
const badgesCount = 11;
const queueStatuses = {
    'd08cde9beddd': true,
    'dc43670ce8bc': true,
    '737644fef008': true,
    '6a9406eedec6': false,
    '7729e38c3f7d': false,
    'bcc6f08242fb': false
};
const leaderInfo = {
    count: 28,
    id: '6a9406eedec6',
    name: 'Test Leader, the Testable',
    leaderType: 7,
    battleFormat: 7,
    badgeName: 'Test Badge',
    bio: 'Test post, please ignore.',
    tagline: 'Also test post, also please ignore.'
};
const metricsInfo = {
    count: 12, // Not the full count because leaders with no recorded match results aren't included in the payload
    id: '6a9406eedec6',
    name: 'Test Leader, the Testable',
    wins: 2,
    losses: 2,
    badgesAwarded: 2
};

let id;

/******************
 * TEST FUNCTIONS *
 ******************/
function getAllChallengersEast1() {
    name(1, 'Get all challenger IDs for east (before registration)');
    db.leader.getAllChallengers(pplEvent.east, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== idCounts.east.first) {
            fail(`expected ${idCounts.east.first} IDs, found ${result.length}`);
        } else {
            pass('challenger count for east was correct');
        }

        next(getAllChallengersWest1);
    });
}

function getAllChallengersWest1() {
    name(2, 'Get all challenger IDs for west (before registration)');
    db.leader.getAllChallengers(pplEvent.west, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== idCounts.west.first) {
            fail(`expected ${idCounts.west.first} IDs, found ${result.length}`);
        } else {
            pass('challenger count for west was correct');
        }

        next(getAllIds1);
    });
}

function getAllIds1() {
    name(3, 'Get all IDs (before registration)');
    db.getAllIds((error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.challengers.length !== idCounts.all.challengers.first) {
            fail(`expected ${idCounts.all.challengers.first} challenger IDs, found ${result.challengers.length}`);
        } else if (result.leaders.length !== idCounts.all.leaders.first) {
            fail(`expected ${idCounts.all.leaders.first} leader IDs, found ${result.leaders.length}`);
        } else {
            pass('ID counts were correct');
        }

        next(registerWithShortUsername);
    });
}

function registerWithShortUsername() {
    name(4, 'Register with a short username');
    db.auth.register(shortUsername, password, pplEvent.east, (error) => {
        if (error === resultCode.usernameTooShort) {
            pass('registration failed with usernameTooShort result code');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('registration was successful');
        }

        next(registerWithLongUsername);
    });
}

function registerWithLongUsername() {
    name(5, 'Register with a long username');
    db.auth.register(longUsername, password, pplEvent.east, (error) => {
        if (error === resultCode.usernameTooLong) {
            pass('registration failed with usernameTooLong result code');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('registration was successful');
        }

        next(registerWithTakenUsername);
    });
}

function registerWithTakenUsername() {
    name(6, 'Register with a taken username');
    db.auth.register(takenUsername, password, pplEvent.east, (error) => {
        if (error === resultCode.usernameTaken) {
            pass('registration failed with usernameTaken result code');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('registration was successful');
        }

        next(registerWithNewUsername);
    });
}

function registerWithNewUsername() {
    name(7, 'Register with a new username');
    db.auth.register(newUsername, password, pplEvent.east, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('registration was successful');
            id = result.id;
        }

        next(loginWithGoodCredentials);
    });
}

function loginWithGoodCredentials() {
    name(8, 'Login with valid credentials');
    db.auth.login(newUsername, password, pplEvent.east, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.id !== id) {
            fail(`id mismatch, actual=${result.id}, expected=${id}`);
        } else {
            pass('login was successful');
        }

        next(loginWithBadCredentials);
    });
}

function loginWithBadCredentials() {
    name(9, 'Login with invalid credentials');
    db.auth.login(newUsername, badPassword, pplEvent.east, (error) => {
        if (error === resultCode.badCredentials) {
            pass('login failed with badCredentials result code');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('login was successful');
        }

        next(getAllChallengersEast2);
    });
}

function getAllChallengersEast2() {
    name(10, 'Get all challenger IDs for east (after registration)');
    db.leader.getAllChallengers(pplEvent.east, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== idCounts.east.second) {
            fail(`expected ${idCounts.east.second} IDs, found ${result.length}`);
        } else {
            pass('challenger count for east was correct');
        }

        next(getAllChallengersWest2);
    });
}

function getAllChallengersWest2() {
    name(11, 'Get all challenger IDs for west (after registration)');
    db.leader.getAllChallengers(pplEvent.west, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== idCounts.west.second) {
            fail(`expected ${idCounts.west.second} IDs, found ${result.length}`);
        } else {
            pass('challenger count for west was correct');
        }

        next(getAllIds2);
    });
}

function getAllIds2() {
    name(12, 'Get all IDs (after registration)');
    db.getAllIds((error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.challengers.length !== idCounts.all.challengers.second) {
            fail(`expected ${idCounts.all.challengers.second} challenger IDs, found ${result.challengers.length}`);
        } else if (result.leaders.length !== idCounts.all.leaders.second) {
            fail(`expected ${idCounts.all.leaders.second} leader IDs, found ${result.leaders.length}`);
        } else {
            pass('ID counts were correct');
        }

        next(loginForWest);
    });
}

function loginForWest() {
    name(13, 'Login for west');
    db.auth.login(newUsername, password, pplEvent.west, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.id !== id) {
            fail(`id mismatch, actual=${result.id}, expected=${id}`);
        } else {
            pass('login was successful');
        }

        next(getAllChallengersWest3);
    });
}

function getAllChallengersWest3() {
    name(14, 'Get all challenger IDs for west (after second login)');
    db.leader.getAllChallengers(pplEvent.west, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== idCounts.west.third) {
            fail(`expected ${idCounts.west.third} IDs, found ${result.length}`);
        } else {
            pass('challenger count for west was correct');
        }

        next(getBadges1);
    });
}

function getBadges1() {
    name(15, 'Get all badges for the new challenger');
    db.getBadges(id, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.displayName !== newUsername) {
            fail(`expected displayName=${newUsername}, actual=${result.displayName}`);
        } else if (result.badgesEarned.length !== 0) {
            fail(`new challenger had ${result.badgesEarned.length} badges`);
        } else {
            pass('new challenger had 0 badges');
        }

        next(getBadges2);
    });
}

function getBadges2() {
    name(16, 'Get all badges for an existing challenger');
    db.getBadges(badgesId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.displayName !== takenUsername) {
            fail(`expected displayName=${takenUsername}, actual=${result.displayName}`);
        } else if (result.badgesEarned.length !== badgesCount) {
            fail(`new challenger had ${result.badgesEarned.length} badges`);
        } else {
            pass(`new challenger had ${badgesCount} badges`);
        }

        next(getOpenQueues);
    });
}

function getOpenQueues() {
    name(17, 'Get and validate a list of open leader queues');
    db.getOpenQueues((error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            let mismatches = 0;
            for (const key of Object.keys(queueStatuses)) {
                if (queueStatuses[key] !== result[key]) {
                    mismatches++;
                }
            }

            if (mismatches > 0) {
                fail(`${mismatches} leader(s) had queue statuses that didn't match the expected values`);
            } else {
                pass('all checked queue statuses matched the expected values');
            }
        }

        next(getAllLeaderData);
    });
}

function getAllLeaderData() {
    name(18, 'Get and validate leader data');
    db.getAllLeaderData((error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (Object.keys(result).length !== leaderInfo.count) {
            fail(`leader count=${Object.keys(result).length}, expected=${leaderInfo.count}`);
        } else if (result[leaderInfo.id].name !== leaderInfo.name) {
            fail(`name=${result[leaderInfo.id].name}, expected=${leaderInfo.name}`);
        } else if (result[leaderInfo.id].leaderType !== leaderInfo.leaderType) {
            fail(`leaderType=${result[leaderInfo.id].leaderType}, expected=${leaderInfo.leaderType}`);
        } else if (result[leaderInfo.id].battleFormat !== leaderInfo.battleFormat) {
            fail(`battleFormat=${result[leaderInfo.id].battleFormat}, expected=${leaderInfo.battleFormat}`);
        } else if (result[leaderInfo.id].badgeName !== leaderInfo.badgeName) {
            fail(`badgeName=${result[leaderInfo.id].badgeName}, expected=${leaderInfo.badgeName}`);
        } else if (result[leaderInfo.id].bio !== leaderInfo.bio) {
            fail(`bio=${result[leaderInfo.id].bio}, expected=${leaderInfo.bio}`);
        } else if (result[leaderInfo.id].tagline !== leaderInfo.tagline) {
            fail(`tagline=${result[leaderInfo.id].tagline}, expected=${leaderInfo.tagline}`);
        } else {
            pass('leader data was correct');
        }

        next(getLeaderMetrics);
    });
}

function getLeaderMetrics() {
    name(19, 'Get and validate leader metrics');
    db.leader.metrics((error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (Object.keys(result).length !== metricsInfo.count) {
            fail(`leader count=${Object.keys(result).length}, expected=${metricsInfo.count}`);
        } else if (result[metricsInfo.id].name !== metricsInfo.name) {
            fail(`name=${result[metricsInfo.id].name}, expected=${metricsInfo.name}`);
        } else if (result[metricsInfo.id].wins !== metricsInfo.wins) {
            fail(`wins=${result[metricsInfo.id].wins}, expected=${metricsInfo.wins}`);
        } else if (result[metricsInfo.id].losses !== metricsInfo.losses) {
            fail(`losses=${result[metricsInfo.id].losses}, expected=${metricsInfo.losses}`);
        } else if (result[metricsInfo.id].badgesAwarded !== metricsInfo.badgesAwarded) {
            fail(`badgesAwarded=${result[metricsInfo.id].badgesAwarded}, expected=${metricsInfo.badgesAwarded}`);
        } else {
            pass('metrics data was correct');
        }

        next(validateChallengerErrorMessages);
    });
}

function validateChallengerErrorMessages() {
    name(20, 'Validate that all result codes are covered in the challenger error messages module');
    const missingCodes = [];
    for (const key of Object.keys(resultCode)) {
        if (!resultCode[key]) {
            continue;
        }

        if (!challengerErrors[resultCode[key]]) {
            missingCodes.push(key);
        }
    }

    if (missingCodes.length > 0) {
        fail(`challenger errors are missing the following codes: ${missingCodes.join(', ')}`);
    } else {
        pass('challenger errors cover all existing codes');
    }

    next(validateLeaderErrorMessages);
}

function validateLeaderErrorMessages() {
    name(21, 'Validate that all result codes are covered in the leader error messages module');
    const missingCodes = [];
    for (const key of Object.keys(resultCode)) {
        if (!resultCode[key]) {
            continue;
        }

        if (!leaderErrors[resultCode[key]]) {
            missingCodes.push(key);
        }
    }

    if (missingCodes.length > 0) {
        fail(`leader errors are missing the following codes: ${missingCodes.join(', ')}`);
    } else {
        pass('leader errors cover all existing codes');
    }

    next(cleanup);
}

function cleanup() {
    finish();
    if (id) {
        debug('Cleaning up db modifications');
        db.debugSave(`DELETE FROM ${db.tables.logins} WHERE id = ?`, [id], (rowCount) => {
            if (rowCount === 0) {
                debug('Cleanup failed to find a login row to delete, please validate the db manually');
                process.exit();
            }

            debug('Deleted login row');
            db.debugSave(`DELETE FROM ${db.tables.challengers} WHERE id = ?`, [id], (rowCount) => {
                if (rowCount === 0) {
                    debug('Cleanup failed to find a challenger row to delete, please validate the db manually');
                    process.exit();
                }

                debug('Deleted challenger row');
                process.exit();
            });
        });
    } else {
        debug('No db modifications to clean up');
        process.exit();
    }
}

/******************
 * TEST EXECUTION *
 ******************/
db.dbReady.then(() => {
    start(21);
    getAllChallengersEast1();
});
