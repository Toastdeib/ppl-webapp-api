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

import db from '../db.js';
import { resultCode } from '../constants.js';
import { debug, fail, finish, name, pass, start } from './test-logger.js';

/****************
 * TESTING DATA *
 ****************/
const idCounts = {
    east: {
        first: 7,
        second: 8
    },
    west: {
        first: 7,
        second: 7,
        third: 8
    },
    all: {
        challengers: {
            first: 8,
            second: 9
        },
        leaders: {
            first: 28,
            second: 28
        }
    }
};
const takenUsername = 'testchallenger1';
const newUsername = 'newtestchallenger1';
const password = 'password1';
const badPassword = 'password2';
const badgesId = 'efaa0cdd1cbd165b';

let id;

/******************
 * TEST FUNCTIONS *
 ******************/
function getAllChallengersEast1() {
    name(1, 'Get all challenger IDs for east (before registration)');
    db.leader.getAllChallengers('east', (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== idCounts.east.first) {
            fail(`expected ${idCounts.east.first} IDs, found ${result.length}`);
        } else {
            pass('challenger count for east was correct');
        }

        getAllChallengersWest1();
    });
}

function getAllChallengersWest1() {
    name(2, 'Get all challenger IDs for west (before registration)');
    db.leader.getAllChallengers('west', (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== idCounts.west.first) {
            fail(`expected ${idCounts.west.first} IDs, found ${result.length}`);
        } else {
            pass('challenger count for west was correct');
        }

        getAllIds1();
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

        registerWithTakenUsername();
    });
}

function registerWithTakenUsername() {
    name(4, 'Register with a taken username');
    db.auth.register(takenUsername, password, 'east', (error) => {
        if (error === resultCode.usernameTaken) {
            pass('registration failed with usernameTaken result code');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('registration was successful');
        }

        registerWithNewUsername();
    });
}

function registerWithNewUsername() {
    name(5, 'Register with a new username');
    db.auth.register(newUsername, password, 'east', (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('registration was successful');
            id = result.id;
        }

        loginWithGoodCredentials();
    });
}

function loginWithGoodCredentials() {
    name(6, 'Login with valid credentials');
    db.auth.login(newUsername, password, 'east', (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.id !== id) {
            fail(`id mismatch, actual=${result.id}, expected=${id}`);
        } else {
            pass('login was successful');
        }

        loginWithBadCredentials();
    });
}

function loginWithBadCredentials() {
    name(7, 'Login with invalid credentials');
    db.auth.login(newUsername, badPassword, 'east', (error) => {
        if (error === resultCode.badCredentials) {
            pass('login failed with badCredentials result code');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('login was successful');
        }

        getAllChallengersEast2();
    });
}

function getAllChallengersEast2() {
    name(8, 'Get all challenger IDs for east (after registration)');
    db.leader.getAllChallengers('east', (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== idCounts.east.second) {
            fail(`expected ${idCounts.east.second} IDs, found ${result.length}`);
        } else {
            pass('challenger count for east was correct');
        }

        getAllChallengersWest2();
    });
}

function getAllChallengersWest2() {
    name(9, 'Get all challenger IDs for west (after registration)');
    db.leader.getAllChallengers('west', (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== idCounts.west.second) {
            fail(`expected ${idCounts.west.second} IDs, found ${result.length}`);
        } else {
            pass('challenger count for west was correct');
        }

        getAllIds2();
    });
}

function getAllIds2() {
    name(10, 'Get all IDs (after registration)');
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

        loginForWest();
    });
}

function loginForWest() {
    name(11, 'Login for west');
    db.auth.login(newUsername, password, 'west', (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.id !== id) {
            fail(`id mismatch, actual=${result.id}, expected=${id}`);
        } else {
            pass('login was successful');
        }

        getAllChallengersWest3();
    });
}

function getAllChallengersWest3() {
    name(12, 'Get all challenger IDs for west (after second login)');
    db.leader.getAllChallengers('west', (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== idCounts.west.third) {
            fail(`expected ${idCounts.west.third} IDs, found ${result.length}`);
        } else {
            pass('challenger count for west was correct');
        }

        getBadges1();
    });
}

function getBadges1() {
    name(13, 'Get all badges for the new challenger');
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

        getBadges2();
    });
}

function getBadges2() {
    name(14, 'Get all badges for an existing challenger');
    db.getBadges(badgesId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.displayName !== takenUsername) {
            fail(`expected displayName=${takenUsername}, actual=${result.displayName}`);
        } else if (result.badgesEarned.length !== 11) {
            fail(`new challenger had ${result.badgesEarned.length} badges`);
        } else {
            pass('new challenger had 11 badges');
        }

        cleanup();
    });
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
    start(14);
    getAllChallengersEast1();
});

// Additional cases to cover:
//   - Leader metrics (length, values)
