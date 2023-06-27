/**********************************************************
 *           TEST SUITE FOR LEADER DB FUNCTIONS           *
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
 * TEST_RUN=true TABLE_SUFFIX=_test node db-leader.js     *
 **********************************************************/
if (process.env.TEST_RUN !== 'true' || !process.env.TABLE_SUFFIX) {
    console.log('Environment variables are missing. Proper usage: TEST_RUN=true TABLE_SUFFIX=_test node db-leader.js');
    process.exit();
}

import db from '../db/db.js';
import { battleFormat, leaderType, matchStatus, resultCode } from '../util/constants.js';
import { debug, fail, finish, name, pass, start } from './test-logger.js';

/****************
 * TESTING DATA *
 ****************/
const leaderId = '6a9406eedec6';
const eliteId = '64750eab176f';
const baseline = {
    leaderName: 'Test Leader, the Testable',
    leaderType: 7,
    badgeName: 'Test Badge',
    queueOpen: false,
    twitchEnabled: true,
    winCount: 2, // 1 loss, 1 ash
    lossCount: 2, // 1 win, 1 gary
    badgesAwarded: 2, // 1 win, 1 ash
    queue: { '79235b4e0fec1b40': 0, '8b7a46b38cf6321f': 1 },
    onHold: [ 'c80f226aeb5ec8ae' ]
};
const challengerIds = {
    add: '5ae3d0f7ea736bda',
    hold: '79235b4e0fec1b40',
    elite: 'efaa0cdd1cbd165b'
};
const queueStats = {
    add: {
        length: 3,
        position: 2
    },
    hold: {
        length: 2
    },
    unholdBack: {
        length: 3,
        position: 2
    },
    unholdFront: {
        length: 3,
        position: 0
    },
    remove: {
        length: 2
    },
    win: {
        length: 1
    }
};

/******************
 * TEST FUNCTIONS *
 ******************/
function verifyBaseline() {
    name(0, 'Verify leader info baseline');
    db.leader.getInfo(leaderId, (error, result) => {
        let baselineValid = true;
        if (error) {
            fail(`unable to verify baseline, aborting test run, error=${error}`);
            process.exit();
        } else {
            // Data to verify: leaderName, leaderType, badgeName, winCount, lossCount, badgesAwarded, queue (length, IDs), hold (length, IDs)
            if (result.leaderName !== baseline.leaderName) {
                baselineValid = false;
            }

            if (result.leaderType !== baseline.leaderType) {
                baselineValid = false;
            }

            if (result.badgeName !== baseline.badgeName) {
                baselineValid = false;
            }

            if (result.queueOpen !== baseline.queueOpen) {
                baselineValid = false;
            }

            if (result.twitchEnabled !== baseline.twitchEnabled) {
                baselineValid = false;
            }

            if (result.winCount !== baseline.winCount) {
                baselineValid = false;
            }

            if (result.lossCount !== baseline.lossCount) {
                baselineValid = false;
            }

            if (result.badgesAwarded !== baseline.badgesAwarded) {
                baselineValid = false;
            }

            const queueKeys = Object.keys(baseline.queue);
            if (result.queue.length !== queueKeys.length) {
                baselineValid = false;
            }

            for (const queue of result.queue) {
                if (queueKeys.indexOf(queue.challengerId) === -1 || baseline.queue[queue.challengerId] !== queue.position) {
                    baselineValid = false;
                }
            }

            if (result.onHold.length !== baseline.onHold.length) {
                baselineValid = false;
            }

            for (const hold of result.onHold) {
                if (baseline.onHold.indexOf(hold.challengerId) === -1) {
                    baselineValid = false;
                }
            }
        }

        if (baselineValid) {
            debug('Baseline is valid, beginning test run');
            addToClosedQueue();
        } else {
            debug('One or more baseline checks were incorrect, aborting test run, please verify db integrity and try again');
            process.exit();
        }
    });
}

function addToClosedQueue() {
    name(1, 'Attempt to add a challenger to a closed queue');
    db.queue.enqueue(leaderId, challengerIds.add, leaderType.casual, battleFormat.singles, (error) => {
        if (error === resultCode.queueIsClosed) {
            pass('failed to add with result code queueIsClosed');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully added to a closed queue');
        }

        openQueue();
    });
}

function openQueue() {
    name(2, 'Open the queue');
    db.leader.updateQueueStatus(leaderId, true, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully opened the queue');
        }

        verifyQueueStatus1();
    });
}

function verifyQueueStatus1() {
    name(3, 'Verify queue status (after open)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queueOpen === false) {
            fail('queue is still flagged as closed');
        } else {
            pass('queue is flagged as open');
        }

        reopenQueue();
    });
}

function reopenQueue() {
    name(4, 'Attempt to reopen the already-open queue');
    db.leader.updateQueueStatus(leaderId, true, (error) => {
        if (error === resultCode.queueAlreadyOpen) {
            pass('failed to open with result code queueAlreadyOpen');
        } else {
            fail('successfully opened the queue');
        }

        addExistingChallenger();
    });
}

function addExistingChallenger() {
    name(5, 'Attempt to add a challenger who is already in queue');
    db.queue.enqueue(leaderId, challengerIds.hold, leaderType.casual, battleFormat.singles, (error) => {
        if (error === resultCode.alreadyInQueue) {
            pass('failed to add with result code alreadyInQueue');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully added a repeat challenger to the queue');
        }

        addNewChallenger();
    });

}

function addNewChallenger() {
    name(6, 'Add a new challenger to the queue');
    db.queue.enqueue(leaderId, challengerIds.add, leaderType.casual, battleFormat.singles, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully added a new challenger to the queue');
        }

        verifyQueue1();
    });
}

function verifyQueue1() {
    name(7, 'Verify queue length and order (after add)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.add.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.add.length}`);
        } else {
            const match = result.queue.find(item => item.challengerId === challengerIds.add);
            if (match.position !== queueStats.add.position) {
                fail(`new challenger queue position=${match.position}, expected=${queueStats.add.position}`);
            } else {
                pass('queue count and position of the new challenger were correct');
            }
        }

        holdChallenger1();
    });
}

function holdChallenger1() {
    name(8, 'Place a challenger on hold');
    db.queue.hold(leaderId, challengerIds.hold, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully placed a challenger on hold');
        }

        verifyQueue2();
    });
}

function verifyQueue2() {
    name(9, 'Verify queue length (after first hold)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.hold.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.hold.length}`);
        } else {
            pass('queue count was correct');
        }

        unholdChallenger1();
    });
}

function unholdChallenger1() {
    name(10, 'Return a challenger from hold at the back of the queue');
    db.queue.unhold(leaderId, challengerIds.hold, false, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully returned a challenger from hold');
        }

        verifyQueue3();
    });
}

function verifyQueue3() {
    name(11, 'Verify queue length and order (after first unhold)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.unholdBack.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.unholdBack.length}`);
        } else {
            const match = result.queue.find(item => item.challengerId === challengerIds.hold);
            if (match.position !== queueStats.unholdBack.position) {
                fail(`unheld challenger queue position=${match.position}, expected=${queueStats.unholdBack.position}`);
            } else {
                pass('queue count and position of the unheld challenger were correct');
            }
        }

        holdChallenger2();
    });
}

function holdChallenger2() {
    name(12, 'Place a challenger on hold');
    db.queue.hold(leaderId, challengerIds.hold, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully placed a challenger on hold');
        }

        verifyQueue4();
    });
}

function verifyQueue4() {
    name(13, 'Verify queue length (after second hold)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.hold.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.hold.length}`);
        } else {
            pass('queue count was correct');
        }

        unholdChallenger2();
    });
}

function unholdChallenger2() {
    name(14, 'Return a challenger from hold at the front of the queue');
    db.queue.unhold(leaderId, challengerIds.hold, true, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully returned a challenger from hold');
        }

        verifyQueue5();
    });
}

function verifyQueue5() {
    name(15, 'Verify queue length and order (after second unhold)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.unholdFront.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.unholdFront.length}`);
        } else {
            const match = result.queue.find(item => item.challengerId === challengerIds.hold);
            if (match.position !== queueStats.unholdFront.position) {
                fail(`unheld challenger queue position=${match.position}, expected=${queueStats.unholdFront.position}`);
            } else {
                pass('queue count and position of the unheld challenger were correct');
            }
        }

        dequeueChallenger();
    });
}

function dequeueChallenger() {
    name(16, 'Remove a challenger from the queue');
    db.queue.dequeue(leaderId, challengerIds.add, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully removed a challenger from the queue');
        }

        verifyQueue6();
    });
}

function verifyQueue6() {
    name(17, 'Verify queue length (after removal)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.remove.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.remove.length}`);
        } else {
            pass('queue count was correct');
        }

        reportWin();
    });
}

function reportWin() {
    name(18, 'Report a challenger win');
    db.leader.reportResult(leaderId, challengerIds.hold, true, true, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('match result reported successfully');
        }

        verifyQueue7();
    });
}

function verifyQueue7() {
    name(19, 'Verify queue length (after win reported)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.win.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.win.length}`);
        } else {
            pass('queue count was correct');
        }

        badDequeue();
    });
}

function badDequeue() {
    name(20, 'Attempt to remove a challenger who isn\'t in queue from the queue');
    db.queue.dequeue(leaderId, challengerIds.add, (error) => {
        if (error === resultCode.notInQueue) {
            pass('failed to remove with result code notInQueue');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully removed a challenger from the queue');
        }

        badHold();
    });
}

function badHold() {
    name(21, 'Attempt to place a challenger who isn\'t in queue on hold');
    db.queue.hold(leaderId, challengerIds.add, (error) => {
        if (error === resultCode.notInQueue) {
            pass('failed to hold with result code notInQueue');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully placed a challenger on hold');
        }

        badUnhold();
    });
}

function badUnhold() {
    name(22, 'Attempt to return a challenger who isn\'t on hold from hold');
    db.queue.unhold(leaderId, challengerIds.add, true, (error) => {
        if (error === resultCode.notInQueue) {
            pass('failed to unhold with result code notInQueue');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully returned a challenger from hold');
        }

        closeQueue();
    });
}

function closeQueue() {
    name(23, 'Close the queue');
    db.leader.updateQueueStatus(leaderId, false, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully closed the queue');
        }

        recloseQueue();
    });
}

function recloseQueue() {
    name(24, 'Attempt to reclose the already-closed queue');
    db.leader.updateQueueStatus(leaderId, false, (error) => {
        if (error === resultCode.queueAlreadyClosed) {
            pass('failed to open with result code queueAlreadyClosed');
        } else {
            fail('successfully closed the queue');
        }

        verifyQueueStatus2();
    });
}

function verifyQueueStatus2() {
    name(25, 'Verify queue status (after close)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queueOpen === true) {
            fail('queue is still flagged as open');
        } else {
            pass('queue is flagged as closed');
        }

        addWithoutEnoughBadges();
    });
}

function addWithoutEnoughBadges() {
    name(26, 'Attempt to add a challenger with fewer than 8 badges to an elite queue');
    db.queue.enqueue(eliteId, challengerIds.add, leaderType.elite, battleFormat.singles, (error) => {
        if (error === resultCode.notEnoughBadges) {
            pass('failed to add with result code notEnoughBadges');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully added to an elite queue');
        }

        addWithEnoughBadges();
    });
}

function addWithEnoughBadges() {
    name(27, 'Add a challenger to an elite queue');
    db.queue.enqueue(eliteId, challengerIds.elite, leaderType.elite, battleFormat.singles, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully added a new challenger to the queue');
        }

        cleanup();
    });
}

function cleanup() {
    finish();
    debug('Cleaning up db modifications');
    db.debugSave(`UPDATE ${db.tables.matches} SET status = ? WHERE challenger_id = ? AND leader_id = ?`, [matchStatus.inQueue, challengerIds.hold, leaderId], (rowCount) => {
        if (rowCount === 0) {
            debug('Cleanup failed to revert match result, please validate the db manually');
            process.exit();
        }

        debug('Reverted match result');
        db.debugSave(`DELETE FROM ${db.tables.matches} WHERE challenger_id = ? AND leader_id = ?`, [challengerIds.elite, eliteId], (rowCount) => {
            if (rowCount === 0) {
                debug('Cleanup failed to delete new elite match, please validate the db manually');
                process.exit();
            }

            debug('Deleted new elite match');
            process.exit();
        });
    });
}

/******************
 * TEST EXECUTION *
 ******************/
db.dbReady.then(() => {
    start(27);
    verifyBaseline();
});
