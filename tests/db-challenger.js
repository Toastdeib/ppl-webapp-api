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

const db = require('../db.js');
const constants = require('../constants.js');
const test = require('./test-logger.js');

/****************
 * TESTING DATA *
 ****************/
const challengerId = 'efaa0cdd1cbd165b';
const newName = 'testchallenger123';
const baseline = {
    displayName: 'testchallenger1',
    queuesEntered: { 'bc95c2fc3f1a': 0, 'd0cceeaf006a': 1 },
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
    position: 2
};
const champQueue = {
    count: 2,
    position: 0
};

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
            test.debug('Baseline is valid, beginning test run');
            setDisplayName();
        } else {
            test.debug('One or more baseline checks were incorrect, aborting test run, please verify db integrity and try again');
            process.exit();
        }
    });
}

function setDisplayName() {
    test.name(1, 'Setting display name');
    db.challenger.setDisplayName(challengerId, newName, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('display name updated without error');
        }

        verifyDisplayName();
    });
}

function verifyDisplayName() {
    test.name(2, 'Verify display name change');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.displayName !== newName) {
            test.fail(`displayName=${result.displayName}, expected=${newName}`);
        } else {
            test.pass('updated display name was correct');
        }

        getBingoBoard();
    });
}

function getBingoBoard() {
    test.name(3, 'Verify bingo board integrity');
    db.challenger.getBingoBoard(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.bingoBoard.length === 0) {
            test.fail(`empty board was returned`);
        } else {
            test.pass('bingo board inflated successfully');
        }

        joinClosedQueue();
    });
}

function joinClosedQueue() {
    test.name(4, 'Attempt to join a closed leader queue');
    db.queue.enqueue(leaderIds.closed, challengerId, constants.leaderType.veteran, (error, result) => {
        if (error === constants.resultCode.queueIsClosed) {
            test.pass('failed to join with result code queueIsClosed');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully joined a closed queue');
        }

        joinJoinedQueue();
    });
}

function joinJoinedQueue() {
    test.name(5, 'Attempt to join a queue the challenger is already in');
    db.queue.enqueue(leaderIds.joined, challengerId, constants.leaderType.veteran, (error, result) => {
        if (error === constants.resultCode.alreadyInQueue) {
            test.pass('failed to join with result code alreadyInQueue');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully joined a queue the challenger is already in');
        }

        joinDefeatedQueue();
    });
}

function joinDefeatedQueue() {
    test.name(6, 'Attempt to join the queue for a previously defeated leader');
    db.queue.enqueue(leaderIds.defeated, challengerId, constants.leaderType.veteran, (error, result) => {
        if (error === constants.resultCode.alreadyWon) {
            test.pass('failed to join with result code alreadyWon');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully joined a defeated leader\'s queue');
        }

        joinUnsupportedQueue();
    });
}

function joinUnsupportedQueue() {
    test.name(7, 'Attempt to join a queue with an unsupported battle difficulty');
    db.queue.enqueue(leaderIds.open, challengerId, constants.leaderType.veteran, (error, result) => {
        if (error === constants.resultCode.unsupportedDifficulty) {
            test.pass('failed to join with result code unsupportedDifficulty');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully joined a queue with an unsupported battle difficulty');
        }

        joinOpenQueue();
    });
}

function joinOpenQueue() {
    test.name(8, 'Attempt to join an open leader queue');
    db.queue.enqueue(leaderIds.open, challengerId, constants.leaderType.casual, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully joined an open queue');
        }

        verifyNewQueue1();
    });
}

function verifyNewQueue1() {
    test.name(9, 'Verify queue count and position in the new queue');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queuesEntered.length !== leaderQueue.count) {
            test.fail(`queue count=${result.queuesEntered.length}, expected=${leaderQueue.count}`);
        } else {
            const queue = result.queuesEntered.find(item => item.leaderId === leaderIds.open);
            if (queue.position !== leaderQueue.position) {
                test.fail(`queue position=${queue.position}, expected=${leaderQueue.position}`);
            } else {
                test.pass('queue count and position were correct');
            }
        }

        joinFullQueue();
    });
}

function joinFullQueue() {
    test.name(10, 'Attempt to join the queue while in the maximum allowed number');
    db.queue.enqueue(leaderIds.full, challengerId, constants.leaderType.casual, (error, result) => {
        if (error === constants.resultCode.tooManyChallenges) {
            test.pass('failed to join with result code tooManyChallenges');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully joined a queue while already in the maximum allowed number');
        }

        joinRestrictedQueue();
    });
}

function joinRestrictedQueue() {
    test.name(11, 'Attempt to join the champ queue without enough emblems');
    db.queue.enqueue(leaderIds.champ, challengerId, constants.leaderType.champion, (error, result) => {
        if (error === constants.resultCode.notEnoughBadges) {
            test.pass('failed to join with result code notEnoughBadges');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully joined the champ queue without enough emblems');
        }

        recordLeaderWin();
    });
}

function recordLeaderWin() {
    test.name(12, 'Record a win against a leader');
    db.leader.reportResult(leaderIds.open, challengerId, true, true, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.hof) {
            test.fail('match result recorded with an erroneously true hof flag');
        } else {
            test.pass('match result recorded successfully');
        }

        verifyBadgeCount1();
    });
}

function verifyBadgeCount1() {
    test.name(13, 'Verify badge count after defeating a leader');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.badgesEarned.length !== baseline.badgesEarned.length + 1) {
            test.fail(`badge count=${result.badgesEarned.length}, expected ${baseline.badgesEarned.length + 1}`);
        } else {
            test.pass('badge count was correct');
        }

        recordEliteWin();
    });
}

function recordEliteWin() {
    test.name(14, 'Record a win against an elite');
    db.leader.reportResult(leaderIds.elite, challengerId, true, true, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.hof) {
            test.fail('match result recorded with an erroneously true hof flag');
        } else {
            test.pass('match result recorded successfully');
        }

        verifyBadgeCount2();
    });
}

function verifyBadgeCount2() {
    test.name(15, 'Verify badge count after defeating an elite');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.badgesEarned.length !== baseline.badgesEarned.length + 2) {
            test.fail(`badge count=${result.badgesEarned.length}, expected ${baseline.badgesEarned.length + 2}`);
        } else {
            test.pass('badge count was correct');
        }

        joinChampQueue();
    });
}

function joinChampQueue() {
    test.name(16, 'Attempt to join the champ queue');
    db.queue.enqueue(leaderIds.champ, challengerId, constants.leaderType.champion, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully joined the champ queue');
        }

        verifyNewQueue2();
    });
}

function verifyNewQueue2() {
    test.name(17, 'Verify queue count and position in the new queue');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queuesEntered.length !== champQueue.count) {
            test.fail(`queue count=${result.queuesEntered.length}, expected=${champQueue.count}`);
        } else {
            const queue = result.queuesEntered.find(item => item.leaderId === leaderIds.champ);
            if (queue.position !== champQueue.position) {
                test.fail(`queue position=${queue.position}, expected=${champQueue.position}`);
            } else {
                test.pass('queue count and position were correct');
            }
        }

        recordChampWin();
    });
}

function recordChampWin() {
    test.name(18, 'Record a win against the champ');
    db.leader.reportResult(leaderIds.champ, challengerId, true, true, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (!result.hof) {
            test.fail('match result recorded with an erroneously false hof flag');
        } else {
            test.pass('match result recorded successfully');
        }

        verifyChampFlag();
    });
}

function verifyChampFlag() {
    test.name(19, 'Verify the championDefeated flag');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (!result.championDefeated) {
            test.fail('championDefeated flag was false');
        } else {
            test.pass('championDefeated flag was true');
        }

        cleanup();
    });
}

function cleanup() {
    test.finish();
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

            test.debug('Reverted elite match result');
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
db.dbReady.then(() => {
    test.start();
    verifyBaseline();
});
