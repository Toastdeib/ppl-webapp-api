/**********************************************************
 *         TEST SUITE FOR CHALLENGER DB FUNCTIONS         *
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
 * TEST_RUN=true TABLE_SUFFIX=_test node db-challenger.js *
 **********************************************************/
if (process.env.TEST_RUN !== 'true' || !process.env.TABLE_SUFFIX) {
    console.log('Environment variables are missing. Proper usage: TEST_RUN=true TABLE_SUFFIX=_test node db-challenger.js');
    process.exit();
}

const db = require('../db-async.js');
const constants = require('../constants.js');
const test = require('./test-logger.js');

/****************
 * TESTING DATA *
 ****************/
const challengerId = 'efaa0cdd1cbd165b';
const newName = 'testchallenger123';
const baseline = {
    displayName: 'testchallenger1',
    queuesEntered: { 'bc95c2fc3f1a': 0, 'd0cceeaf006a': 0 }, // TODO - change the second 0 to a 1 after fixing the db structure and rebuilding it again
    badgesEarned: [ '6a9406eedec6', '7729e38c3f7d', 'bcc6f08242fb', '7e8ab2c43c76', '1ed127c44156', '74fe35c10ba6', '68e65518c4d6', 'd08cde9beddd', 'b6857070a317', '1194829fc135', 'be90adcbbe2f' ],
    championDefeated: false
}

const leaderIds = {
    closed: 'f54af38b4829',
    joined: 'd0cceeaf006a',
    defeated: 'd08cde9beddd',
    open: 'dc43670ce8bc',
    full: '737644fef008',
    elite: 'bc95c2fc3f1a',
    champ: '5f22dc234543'
};
const leaderQueue = {
    count: 3,
    position: 0 // TODO - Make this 2 after the next db rebuild
};
const champQueue = {
    count: 2,
    position: 0
};

let successCount = 0;
let failureCount = 0;

/******************
 * TEST FUNCTIONS *
 ******************/
function verifyBaseline() {
    test.name(0, 'Verifying challenger info baseline');
    db.challenger.getInfo(challengerId, (error, result) => {
        let baselineValid = true;
        if (error) {
            test.fail(`unable to verify baseline, aborting test run, error=${error}`);
            process.exit();
        } else {
            // Data to verify: displayName, queuesEntered (length, IDs, positions), badgesEarned (length, IDs), championDefeated
            if (result.displayName !== baseline.displayName) {
                baselineValid = false;
            }

            const queueKeys = Object.keys(baseline.queuesEntered);
            if (result.queuesEntered.length !== queueKeys.length) {
                baselineValid = false;
            }

            for (queue of result.queuesEntered) {
                if (queueKeys.indexOf(queue.leaderId) === -1 || baseline.queuesEntered[queue.leaderId] !== queue.position) {
                    baselineValid = false;
                }
            }

            if (result.badgesEarned.length !== baseline.badgesEarned.length) {
                baselineValid = false;
            }

            for (badge of result.badgesEarned) {
                if (baseline.badgesEarned.indexOf(badge.leaderId) === -1) {
                    baselineValid = false;
                }
            }

            if (result.championDefeated) {
                baselineValid = false;
            }
        }

        if (baselineValid) {
            test.pass('baseline is valid');
            setDisplayName();
        } else {
            test.fail('one or more baseline checks were incorrect, aborting test run, please verify db integrity and try again');
            process.exit();
        }
    });
}

function setDisplayName() {
    test.name(1, 'Setting display name');
    db.challenger.setDisplayName(challengerId, newName, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.pass('display name updated without error');
            successCount++;
        }

        verifyDisplayName();
    });
}

function verifyDisplayName() {
    test.name(2, 'Verify display name change');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.displayName !== newName) {
            test.fail(`displayName=${result.displayName}, expected=${newName}`);
            failureCount++;
        } else {
            test.pass('updated display name was correct');
            successCount++;
        }

        getBingoBoard();
    });
}

function getBingoBoard() {
    test.name(3, 'Verify bingo board integrity');
    db.challenger.getBingoBoard(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.bingoBoard.length === 0) {
            test.fail(`empty board was returned`);
            failureCount++;
        } else {
            test.pass('bingo board inflated successfully');
            successCount++;
        }

        //joinClosedQueue(); // TODO - Readd this to the chain once the functionality is implemented
        joinJoinedQueue();
    });
}

function joinClosedQueue() {
    // TODO - This test will be broken until we actually implement queue open/close logic
    test.name(4, 'Attempt to join a closed leader queue');
    db.queue.enqueue(leaderIds.closed, challengerId, (error, result) => {
        if (error === constants.resultCode.queueIsClosed) {
            test.pass('failed to join with result code queueIsClosed');
            successCount++;
        } else if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.fail('successfully joined a closed queue');
            failureCount++;
        }

        joinJoinedQueue();
    });
}

function joinJoinedQueue() {
    test.name(5, 'Attempt to join a queue the challenger is already in');
    db.queue.enqueue(leaderIds.joined, challengerId, (error, result) => {
        if (error === constants.resultCode.alreadyInQueue) {
            test.pass('failed to join with result code alreadyInQueue');
            successCount++;
        } else if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.fail('successfully joined a queue the challenger is already in');
            failureCount++;
        }

        joinDefeatedQueue();
    });
}

function joinDefeatedQueue() {
    test.name(6, 'Attempt to join the queue for a previously defeated leader');
    db.queue.enqueue(leaderIds.defeated, challengerId, (error, result) => {
        if (error === constants.resultCode.alreadyWon) {
            test.pass('failed to join with result code alreadyWon');
            successCount++;
        } else if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.fail('successfully joined a defeated leader\'s queue');
            failureCount++;
        }

        joinOpenQueue();
    });
}

function joinOpenQueue() {
    test.name(7, 'Attempt to join an open leader queue');
    db.queue.enqueue(leaderIds.open, challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.pass('successfully joined an open queue');
            successCount++;
        }

        verifyNewQueue1();
    });
}

function verifyNewQueue1() {
    test.name(8, 'Verify queue count and position in the new queue');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.queuesEntered.length !== leaderQueue.count) {
            test.fail(`queue count=${result.queuesEntered.length}, expected=${leaderQueue.count}`);
            failureCount++;
        } else {
            const queue = result.queuesEntered.find(item => item.leaderId === leaderIds.open);
            if (queue.position !== leaderQueue.position) {
                test.fail(`queue position=${queue.position}, expected=${leaderQueue.position}`);
                failureCount++;
            } else {
                test.pass('queue count and position were correct');
                successCount++;
            }
        }

        joinFullQueue();
    });
}

function joinFullQueue() {
    test.name(9, 'Attempt to join the queue while in the maximum allowed number');
    db.queue.enqueue(leaderIds.full, challengerId, (error, result) => {
        if (error === constants.resultCode.tooManyChallenges) {
            test.pass('failed to join with result code tooManyChallenges');
            successCount++;
        } else if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.fail('successfully joined a queue while already in the maximum allowed number');
            failureCount++;
        }

        //joinRestrictedQueue(); // TODO - Readd this to the chain once the functionality is implemented
        recordLeaderWin();
    });
}

function joinRestrictedQueue() {
    // TODO - This test will be broken until we implement the logic
    test.name(10, 'Attempt to join the champ queue without enough emblems');
    db.queue.enqueue(leaderIds.champ, challengerId, (error, result) => {
        if (error === constants.resultCode.notEnoughBadges) {
            test.pass('failed to join with result code notEnoughBadges');
            successCount++;
        } else if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.fail('successfully joined the champ queue without enough emblems');
            failureCount++;
        }

        recordLeaderWin();
    });
}

function recordLeaderWin() {
    test.name(11, 'Record a win against a leader');
    db.leader.reportResult(leaderIds.open, challengerId, true, true, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.pass('match result recorded successfully');
            successCount++;
        }

        verifyBadgeCount1();
    });
}

function verifyBadgeCount1() {
    test.name(12, 'Verify badge count after defeating a leader');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.badgesEarned.length !== baseline.badgesEarned.length + 1) {
            test.fail(`badge count=${result.badgesEarned.length}, expected ${baseline.badgesEarned.length + 1}`);
            failureCount++;
        } else {
            test.pass('badge count was correct');
            successCount++;
        }

        recordEliteWin();
    });
}

function recordEliteWin() {
    test.name(13, 'Record a win against an elite');
    db.leader.reportResult(leaderIds.elite, challengerId, true, true, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.pass('match result recorded successfully');
            successCount++;
        }

        verifyBadgeCount2();
    });
}

function verifyBadgeCount2() {
    test.name(14, 'Verify badge count after defeating an elite');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.badgesEarned.length !== baseline.badgesEarned.length + 2) {
            test.fail(`badge count=${result.badgesEarned.length}, expected ${baseline.badgesEarned.length + 2}`);
            failureCount++;
        } else {
            test.pass('badge count was correct');
            successCount++;
        }

        joinChampQueue();
    });
}

function joinChampQueue() {
    test.name(15, 'Attempt to join the champ queue');
    db.queue.enqueue(leaderIds.champ, challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.pass('successfully joined the champ queue');
            successCount++;
        }

        verifyNewQueue2();
    });
}

function verifyNewQueue2() {
    test.name(16, 'Verify queue count and position in the new queue');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (result.queuesEntered.length !== champQueue.count) {
            test.fail(`queue count=${result.queuesEntered.length}, expected=${champQueue.count}`);
            failureCount++;
        } else {
            const queue = result.queuesEntered.find(item => item.leaderId === leaderIds.champ);
            if (queue.position !== champQueue.position) {
                test.fail(`queue position=${queue.position}, expected=${champQueue.position}`);
                failureCount++;
            } else {
                test.pass('queue count and position were correct');
                successCount++;
            }
        }

        recordChampWin();
    });
}

function recordChampWin() {
    test.name(17, 'Record a win against the champ');
    db.leader.reportResult(leaderIds.champ, challengerId, true, true, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else {
            test.pass('match result recorded successfully');
            successCount++;
        }

        verifyChampFlag();
    });
}

function verifyChampFlag() {
    test.name(18, 'Verify the championDefeated flag');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
            failureCount++;
        } else if (!result.championDefeated) {
            test.fail('championDefeated flag was false');
            failureCount++;
        } else {
            test.pass('championDefeated flag was true');
            successCount++;
        }

        cleanup();
    });
}

function cleanup() {
    test.complete(new Date() - start, successCount, failureCount);
    test.debug('Cleaning up db modifiations');
    db.debugSave(`UPDATE ${db.tables.challengers} SET display_name = ? WHERE id = ?`, [baseline.displayName, challengerId], (rowCount) => {
        if (rowCount === 0) {
            test.debug('Cleanup failed to revert display name, please validate the db manually');
            process.exit();
        }

        test.debug('Reverted display name');
        db.debugSave(`UPDATE ${db.tables.matches} SET status = ? WHERE challenger_id = ? AND leader_id = ?`, [constants.matchStatus.inQueue, challengerId, leaderIds.elite], (rowCount) => {
            if (rowCount === 0) {
                test.debug('Cleanup failed to revert elite match result, please validate the db manually');
                process.exit();
            }

            test.debug('Elite match result reverted');
            db.debugSave(`DELETE FROM ${db.tables.matches} WHERE challenger_id = ? AND leader_id IN (?, ?)`, [challengerId, leaderIds.open, leaderIds.champ], (rowCount) => {
                if (rowCount !== 2) {
                    test.debug('Cleanup failed to delete the correct number of match results, please validate the db manually');
                    process.exit();
                }

                test.debug('Deleted two new match results');
                process.exit();
            });
        });
    });
}

/******************
 * TEST EXECUTION *
 ******************/
let start;
db.dbReady.then(() => {
    start = new Date();
    verifyBaseline();
});


/** NOTES **
 Cases to cover:

 Data to clean up:
    - Revert display name
    - Delete new leader win
    - Revert elite win (reset to status=0)
    - Delete champ win
*/
