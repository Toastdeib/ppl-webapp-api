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

import db from '../db/db.js';
import { battleFormat, leaderType, matchStatus, resultCode } from '../util/constants.js';
import { debug, fail, finish, name, next, pass, start } from './test-logger.js';

/****************
 * TESTING DATA *
 ****************/
const challengerId = 'efaa0cdd1cbd165b';
const newName = 'testchallenger123';
const baseline = {
    displayName: 'testchallenger1',
    winCount: 9,
    lossCount: 2,
    queuesEntered: { 'bc95c2fc3f1a': 0, 'd0cceeaf006a': 1, '987597dc6aa2': 0 },
    badgesEarned: [ '6a9406eedec6', '7729e38c3f7d', 'bcc6f08242fb', '7e8ab2c43c76', '1ed127c44156', '74fe35c10ba6', '68e65518c4d6', 'd08cde9beddd', 'b6857070a317', '1194829fc135', 'be90adcbbe2f' ],
    championDefeated: false
};

const leaderIds = {
    closed: 'f54af38b4829',
    joined: 'd0cceeaf006a',
    defeated: 'd08cde9beddd',
    open: 'dc43670ce8bc',
    full: '737644fef008',
    elite: 'bc95c2fc3f1a',
    duo: '987597dc6aa2',
    champ: '5f22dc234543'
};
const leaderQueue = {
    count: 4,
    position: 2
};
const champQueue = {
    count: 3,
    position: 0
};
const multiLinkCode = 'No doubles partner';

const queueInfo = {
    initial: [ '79235b4e0fec1b40', '8b7a46b38cf6321f' ],
    join: [ '79235b4e0fec1b40', '8b7a46b38cf6321f', 'efaa0cdd1cbd165b' ],
    win: [ '79235b4e0fec1b40', '8b7a46b38cf6321f' ]
};

/******************
 * TEST FUNCTIONS *
 ******************/
function verifyBaseline() {
    name(0, 'Verify challenger info baseline');
    db.challenger.getInfo(challengerId, (error, result) => {
        let baselineValid = true;
        if (error) {
            fail(`unable to verify baseline, aborting test run, error=${error}`);
            process.exit();
        } else {
            // Data to verify: displayName, winCount, lossCount, queuesEntered (length, IDs, positions), badgesEarned (length, IDs), championDefeated
            if (result.displayName !== baseline.displayName) {
                baselineValid = false;
            }

            if (result.winCount !== baseline.winCount) {
                baselineValid = false;
            }

            if (result.lossCount !== baseline.lossCount) {
                baselineValid = false;
            }

            const queueKeys = Object.keys(baseline.queuesEntered);
            if (result.queuesEntered.length !== queueKeys.length) {
                baselineValid = false;
            }

            for (const queue of result.queuesEntered) {
                if (queueKeys.indexOf(queue.leaderId) === -1 || baseline.queuesEntered[queue.leaderId] !== queue.position) {
                    baselineValid = false;
                }

                if ((queue.leaderId === leaderIds.duo) !== (queue.linkCode === multiLinkCode)) {
                    // Link code should be 'No doubles partner' for the multi-battle leader and normal for others
                    baselineValid = false;
                }
            }

            if (result.badgesEarned.length !== baseline.badgesEarned.length) {
                baselineValid = false;
            }

            for (const badge of result.badgesEarned) {
                if (baseline.badgesEarned.indexOf(badge.leaderId) === -1) {
                    baselineValid = false;
                }
            }

            if (result.championDefeated) {
                baselineValid = false;
            }
        }

        if (baselineValid) {
            debug('Baseline is valid, beginning test run');
            next(setDisplayName);
        } else {
            debug('One or more baseline checks were incorrect, aborting test run, please verify db integrity and try again');
            process.exit();
        }
    });
}

function setDisplayName() {
    name(1, 'Set display name');
    db.challenger.setDisplayName(challengerId, newName, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('display name updated without error');
        }

        next(verifyDisplayName);
    });
}

function verifyDisplayName() {
    name(2, 'Verify display name change');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.displayName !== newName) {
            fail(`displayName=${result.displayName}, expected=${newName}`);
        } else {
            pass('updated display name was correct');
        }

        next(getBingoBoard);
    });
}

function getBingoBoard() {
    name(3, 'Verify bingo board integrity');
    db.challenger.getBingoBoard(challengerId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.bingoBoard.length === 0) {
            fail('empty board was returned');
        } else {
            pass('bingo board inflated successfully');
        }

        next(verifyQueueIds1);
    });
}

function verifyQueueIds1() {
    name(4, 'Verify IDs in queue before joining');
    db.queue.getIdsInQueue(leaderIds.open, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== queueInfo.initial.length) {
            fail(`result.length=${result.length}, expected=${queueInfo.initial.length}`);
        } else {
            let match = true;
            for (let i = 0; i < result.length; i++) {
                if (result[i] !== queueInfo.initial[i]) {
                    match = false;
                    break;
                }
            }

            if (!match) {
                fail('IDs were not in the expected order');
            } else {
                pass('IDs in queue were correct');
            }
        }

        next(joinClosedQueue);
    });
}

function joinClosedQueue() {
    name(5, 'Attempt to join a closed leader queue');
    db.queue.enqueue(leaderIds.closed, challengerId, leaderType.veteran, battleFormat.special, (error) => {
        if (error === resultCode.queueIsClosed) {
            pass('failed to join with result code queueIsClosed');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully joined a closed queue');
        }

        next(joinJoinedQueue);
    });
}

function joinJoinedQueue() {
    name(6, 'Attempt to join a queue the challenger is already in');
    db.queue.enqueue(leaderIds.joined, challengerId, leaderType.veteran, battleFormat.doubles, (error) => {
        if (error === resultCode.alreadyInQueue) {
            pass('failed to join with result code alreadyInQueue');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully joined a queue the challenger is already in');
        }

        next(joinDefeatedQueue);
    });
}

function joinDefeatedQueue() {
    name(7, 'Attempt to join the queue for a previously defeated leader');
    db.queue.enqueue(leaderIds.defeated, challengerId, leaderType.veteran, battleFormat.singles, (error) => {
        if (error === resultCode.alreadyWon) {
            pass('failed to join with result code alreadyWon');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully joined a defeated leader\'s queue');
        }

        next(joinUnsupportedTypeQueue);
    });
}

function joinUnsupportedTypeQueue() {
    name(8, 'Attempt to join a queue with an unsupported battle difficulty');
    db.queue.enqueue(leaderIds.open, challengerId, leaderType.veteran, battleFormat.singles, (error) => {
        if (error === resultCode.unsupportedDifficulty) {
            pass('failed to join with result code unsupportedDifficulty');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully joined a queue with an unsupported battle difficulty');
        }

        next(joinUnsupportedFormatQueue);
    });
}

function joinUnsupportedFormatQueue() {
    name(9, 'Attempt to join a queue with an unsupported battle format');
    db.queue.enqueue(leaderIds.open, challengerId, leaderType.casual, battleFormat.doubles, (error) => {
        if (error === resultCode.unsupportedFormat) {
            pass('failed to join with result code unsupportedFormat');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully joined a queue with an unsupported battle format');
        }

        next(joinOpenQueue);
    });
}

function joinOpenQueue() {
    name(10, 'Join an open leader queue');
    db.queue.enqueue(leaderIds.open, challengerId, leaderType.casual, battleFormat.singles, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully joined an open queue');
        }

        next(verifyNewQueue1);
    });
}

function verifyNewQueue1() {
    name(11, 'Verify queue count and position in the new queue');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queuesEntered.length !== leaderQueue.count) {
            fail(`queue count=${result.queuesEntered.length}, expected=${leaderQueue.count}`);
        } else {
            const queue = result.queuesEntered.find(item => item.leaderId === leaderIds.open);
            if (!queue) {
                fail(`challenger is not in queue for leaderId=${leaderIds.open}`);
            } else if (queue.position !== leaderQueue.position) {
                fail(`queue position=${queue.position}, expected=${leaderQueue.position}`);
            } else {
                pass('queue count and position were correct');
            }
        }

        next(verifyQueueIds2);
    });
}

function verifyQueueIds2() {
    name(12, 'Verify IDs in queue after joining');
    db.queue.getIdsInQueue(leaderIds.open, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== queueInfo.join.length) {
            fail(`result.length=${result.length}, expected=${queueInfo.join.length}`);
        } else {
            let match = true;
            for (let i = 0; i < result.length; i++) {
                if (result[i] !== queueInfo.join[i]) {
                    match = false;
                    break;
                }
            }

            if (!match) {
                fail('IDs were not in the expected order');
            } else {
                pass('IDs in queue were correct');
            }
        }

        next(joinFullQueue);
    });
}

function joinFullQueue() {
    name(13, 'Attempt to join the queue while in the maximum allowed number');
    db.queue.enqueue(leaderIds.full, challengerId, leaderType.casual, battleFormat.doubles, (error) => {
        if (error === resultCode.tooManyChallenges) {
            pass('failed to join with result code tooManyChallenges');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully joined a queue while already in the maximum allowed number');
        }

        next(joinRestrictedQueue);
    });
}

function joinRestrictedQueue() {
    name(14, 'Attempt to join the champ queue without enough emblems');
    db.queue.enqueue(leaderIds.champ, challengerId, leaderType.champion, battleFormat.doubles, (error) => {
        if (error === resultCode.notEnoughEmblems) {
            pass('failed to join with result code notEnoughEmblems');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully joined the champ queue without enough emblems');
        }

        next(recordLeaderWin);
    });
}

function recordLeaderWin() {
    name(15, 'Record a win against a leader');
    db.leader.reportResult(leaderIds.open, [challengerId], true, true, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.hof) {
            fail('match result recorded with an erroneously true hof flag');
        } else {
            pass('match result recorded successfully');
        }

        next(verifyQueueIds3);
    });
}

function verifyQueueIds3() {
    name(16, 'Verify IDs in queue after winning');
    db.queue.getIdsInQueue(leaderIds.open, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.length !== queueInfo.win.length) {
            fail(`result.length=${result.length}, expected=${queueInfo.win.length}`);
        } else {
            let match = true;
            for (let i = 0; i < result.length; i++) {
                if (result[i] !== queueInfo.win[i]) {
                    match = false;
                    break;
                }
            }

            if (!match) {
                fail('IDs were not in the expected order');
            } else {
                pass('IDs in queue were correct');
            }
        }

        next(verifyBadgeCount1);
    });
}

function verifyBadgeCount1() {
    name(17, 'Verify badge count after defeating a leader');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.badgesEarned.length !== baseline.badgesEarned.length + 1) {
            fail(`badge count=${result.badgesEarned.length}, expected ${baseline.badgesEarned.length + 1}`);
        } else if (result.winCount !== baseline.winCount + 1) {
            fail(`winCount=${result.winCount}, expected ${baseline.winCount + 1}`);
        } else {
            pass('badge count was correct');
        }

        next(recordEliteWin);
    });
}

function recordEliteWin() {
    name(18, 'Record a win against an elite');
    db.leader.reportResult(leaderIds.elite, [challengerId], true, true, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.hof) {
            fail('match result recorded with an erroneously true hof flag');
        } else {
            pass('match result recorded successfully');
        }

        next(verifyBadgeCount2);
    });
}

function verifyBadgeCount2() {
    name(19, 'Verify badge count after defeating an elite');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.badgesEarned.length !== baseline.badgesEarned.length + 2) {
            fail(`badge count=${result.badgesEarned.length}, expected ${baseline.badgesEarned.length + 2}`);
        } else if (result.winCount !== baseline.winCount + 2) {
            fail(`winCount=${result.winCount}, expected ${baseline.winCount + 2}`);
        } else {
            pass('badge count was correct');
        }

        next(joinChampQueue);
    });
}

function joinChampQueue() {
    name(20, 'Join the champ queue');
    db.queue.enqueue(leaderIds.champ, challengerId, leaderType.champion, battleFormat.doubles, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully joined the champ queue');
        }

        next(verifyNewQueue2);
    });
}

function verifyNewQueue2() {
    name(21, 'Verify queue count and position in the new queue');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queuesEntered.length !== champQueue.count) {
            fail(`queue count=${result.queuesEntered.length}, expected=${champQueue.count}`);
        } else {
            const queue = result.queuesEntered.find(item => item.leaderId === leaderIds.champ);
            if (queue.position !== champQueue.position) {
                fail(`queue position=${queue.position}, expected=${champQueue.position}`);
            } else {
                pass('queue count and position were correct');
            }
        }

        next(recordChampWin);
    });
}

function recordChampWin() {
    name(22, 'Record a win against the champ');
    db.leader.reportResult(leaderIds.champ, [challengerId], true, true, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (!result.hof) {
            fail('match result recorded with an erroneously false hof flag');
        } else {
            pass('match result recorded successfully');
        }

        next(verifyChampFlag);
    });
}

function verifyChampFlag() {
    name(23, 'Verify the championDefeated flag');
    db.challenger.getInfo(challengerId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (!result.championDefeated) {
            fail('championDefeated flag was false');
        } else {
            pass('championDefeated flag was true');
        }

        next(cleanup);
    });
}

function cleanup() {
    finish();
    debug('Cleaning up db modifiations');
    db.debugSave(`UPDATE ${db.tables.challengers} SET display_name = ? WHERE id = ?`, [baseline.displayName, challengerId], (rowCount) => {
        if (rowCount === 0) {
            debug('Cleanup failed to revert display name, please validate the db manually');
            process.exit();
        }

        debug('Reverted display name');
        db.debugSave(`UPDATE ${db.tables.matches} SET status = ? WHERE challenger_id = ? AND leader_id = ?`, [matchStatus.inQueue, challengerId, leaderIds.elite], (rowCount) => {
            if (rowCount === 0) {
                debug('Cleanup failed to revert elite match result, please validate the db manually');
                process.exit();
            }

            debug('Reverted elite match result');
            db.debugSave(`DELETE FROM ${db.tables.matches} WHERE challenger_id = ? AND leader_id IN (?, ?)`, [challengerId, leaderIds.open, leaderIds.champ], (rowCount) => {
                if (rowCount !== 2) {
                    debug('Cleanup failed to delete the correct number of match results, please validate the db manually');
                    process.exit();
                }

                debug('Deleted two new match results');
                process.exit();
            });
        });
    });
}

/******************
 * TEST EXECUTION *
 ******************/
db.dbReady.then(() => {
    start(23);
    verifyBaseline();
});
