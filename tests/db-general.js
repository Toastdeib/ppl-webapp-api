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

const db = require('../db-async.js');
const constants = require('../constants.js');
const test = require('./test-logger.js');

/****************
 * TESTING DATA *
 ****************/
const idCounts = {
    east: {
        first: 5,
        second: 6
    },
    west: {
        first: 5,
        second: 5,
        third: 6
    },
    all: {
        challengers: {
            first: 5,
            second: 6
        },
        leaders: {
            first: 27,
            second: 27
        }
    }
};
const takenUsername = 'testchallenger1';
const newUsername = 'newtestchallenger1';
const password = 'password1';
const badPassword = 'password2';

let id;
let successCount = 0;
let failureCount = 0;

/******************
 * TEST FUNCTIONS *
 ******************/
function getAllChallengersEast1() {
    test.name(1, 'Get all challenger IDs for east (before registration)');
    db.leader.getAllChallengers('east', (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.length !== idCounts.east.first) {
            test.fail(`expected ${idCounts.east.first} IDs, found ${result.length}`);
            failureCount++;
        } else {
            test.pass('challenger count for east was correct');
            successCount++;
        }

        getAllChallengersWest1();
    });
}

function getAllChallengersWest1() {
    test.name(2, 'Get all challenger IDs for west (before registration)');
    db.leader.getAllChallengers('west', (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.length !== idCounts.west.first) {
            test.fail(`expected ${idCounts.west.first} IDs, found ${result.length}`);
            failureCount++;
        } else {
            test.pass('challenger count for west was correct');
            successCount++;
        }

        getAllIds1();
    });
}

function getAllIds1() {
    test.name(3, 'Get all IDs (before registration)');
    db.getAllIds((error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.challengers.length !== idCounts.all.challengers.first) {
            test.fail(`expected ${idCounts.all.challengers.first} challenger IDs, found ${result.challengers.length}`);
            failureCount++;
        } else if (result.leaders.length !== idCounts.all.leaders.first) {
            test.fail(`expected ${idCounts.all.leaders.first} leader IDs, found ${result.leaders.length}`);
            failureCount++;
        } else {
            test.pass('ID counts were correct');
            successCount++;
        }

        registerWithTakenUsername();
    });
}

function registerWithTakenUsername() {
    test.name(4, 'Register with a taken username');
    db.auth.register(takenUsername, password, 'east', (error, result) => {
        if (error === constants.resultCode.usernameTaken) {
            test.pass('registration failed with usernameTaken result code');
            successCount++;
        } else if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.fail('registration was successful');
            failureCount++;
        }

        registerWithNewUsername();
    });
}

function registerWithNewUsername() {
    test.name(5, 'Register with a new username');
    db.auth.register(newUsername, password, 'east', (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.pass('registration was successful');
            successCount++;
            id = result.id;
        }

        loginWithGoodCredentials();
    });
}

function loginWithGoodCredentials() {
    test.name(6, 'Login with valid credentials');
    db.auth.login(newUsername, password, 'east', (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.id !== id) {
            test.fail(`id mismatch, actual=${result.id}, expected=${id}`);
            failureCount++;
        } else {
            test.pass('login was successful');
            successCount++;
        }

        loginWithBadCredentials();
    });
}

function loginWithBadCredentials() {
    test.name(7, 'Login with invalid credentials');
    db.auth.login(newUsername, badPassword, 'east', (error, result) => {
        if (error === constants.resultCode.badCredentials) {
            test.pass('login failed with badCredentials result code');
            successCount++;
        } else if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.fail('login was successful');
            failureCount++;
        }

        getAllChallengersEast2();
    });
}

function getAllChallengersEast2() {
    test.name(8, 'Get all challenger IDs for east (after registration)');
    db.leader.getAllChallengers('east', (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.length !== idCounts.east.second) {
            test.fail(`expected ${idCounts.east.second} IDs, found ${result.length}`);
            failureCount++;
        } else {
            test.pass('challenger count for east was correct');
            successCount++;
        }

        getAllChallengersWest2();
    });
}

function getAllChallengersWest2() {
    test.name(9, 'Get all challenger IDs for west (after registration)');
    db.leader.getAllChallengers('west', (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.length !== idCounts.west.second) {
            test.fail(`expected ${idCounts.west.second} IDs, found ${result.length}`);
            failureCount++;
        } else {
            test.pass('challenger count for west was correct');
            successCount++;
        }

        getAllIds2();
    });
}

function getAllIds2() {
    test.name(10, 'Get all IDs (after registration)');
    db.getAllIds((error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.challengers.length !== idCounts.all.challengers.second) {
            test.fail(`expected ${idCounts.all.challengers.second} challenger IDs, found ${result.challengers.length}`);
            failureCount++;
        } else if (result.leaders.length !== idCounts.all.leaders.second) {
            test.fail(`expected ${idCounts.all.leaders.second} leader IDs, found ${result.leaders.length}`);
            failureCount++;
        } else {
            test.pass('ID counts were correct');
            successCount++;
        }

        loginForWest();
    });
}

function loginForWest() {
    test.name(11, 'Login for west');
    db.auth.login(newUsername, password, 'west', (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.id !== id) {
            test.fail(`id mismatch, actual=${result.id}, expected=${id}`);
            failureCount++;
        } else {
            test.pass('login was successful');
            successCount++;
        }

        getAllChallengersWest3();
    });
}

function getAllChallengersWest3() {
    test.name(12, 'Get all challenger IDs for west (after second login)');
    db.leader.getAllChallengers('west', (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.length !== idCounts.west.third) {
            test.fail(`expected ${idCounts.west.third} IDs, found ${result.length}`);
            failureCount++;
        } else {
            test.pass('challenger count for west was correct');
            successCount++;
        }

        cleanup();
    });
}

function cleanup() {
    test.complete(new Date() - start, successCount, failureCount);
    if (id) {
        test.debug('Cleaning up db modifications');
        db.debugSave(`DELETE FROM ${db.tables.logins} WHERE id = ?`, [id], (rowCount) => {
            if (rowCount === 0) {
                test.debug('Cleanup failed to find a login row to delete, please validate the db manually');
                process.exit();
            }

            test.debug('Cleaned up login row');
            db.debugSave(`DELETE FROM ${db.tables.challengers} WHERE id = ?`, [id], (rowCount) => {
                if (rowCount === 0) {
                    test.debug('Cleanup failed to find a challenger row to delete, please validate the db manually');
                    process.exit();
                }

                test.debug('Cleaned up challenger row');
                process.exit();
            });
        });
    } else {
        test.debug('No db modifications to clean up');
        process.exit();
    }
}

/******************
 * TEST EXECUTION *
 ******************/
let start;
db.dbReady.then(() => {
    start = new Date();
    getAllChallengersEast1();
});

// Additional cases to cover:
//   - Leader metrics (length, values)
