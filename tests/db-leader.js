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

const db = require('../db.js');
const constants = require('../constants.js');
const test = require('./test-logger.js');

/****************
 * TESTING DATA *
 ****************/
const leaderId = '6a9406eedec6';
const eliteId = '64750eab176f'
const baseline = {
    leaderName: 'Test Leader, the Testable',
    leaderType: 7,
    badgeName: 'Test Badge',
    queueOpen: false,
    winCount: 2, // 1 loss, 1 ash
    lossCount: 2, // 1 win, 1 gary
    badgesAwarded: 2, // 1 win, 1 ash
    queue: { '79235b4e0fec1b40': 0, '8b7a46b38cf6321f': 1 },
    onHold: [ 'c80f226aeb5ec8ae' ]
}
const challengerIds = {
    add: '5ae3d0f7ea736bda',
    hold: '79235b4e0fec1b40',
    elite: 'efaa0cdd1cbd165b'
}
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
}

/******************
 * TEST FUNCTIONS *
 ******************/
function verifyBaseline() {
    test.name(0, 'Verifying leader info baseline');
    db.leader.getInfo(leaderId, (error, result) => {
        let baselineValid = true;
        if (error) {
            test.fail(`unable to verify baseline, aborting test run, error=${error}`);
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

            for (queue of result.queue) {
                if (queueKeys.indexOf(queue.challengerId) === -1 || baseline.queue[queue.challengerId] !== queue.position) {
                    baselineValid = false;
                }
            }

            if (result.onHold.length !== baseline.onHold.length) {
                baselineValid = false;
            }

            for (hold of result.onHold) {
                if (baseline.onHold.indexOf(hold.challengerId) === -1) {
                    baselineValid = false;
                }
            }
        }

        if (baselineValid) {
            test.debug('Baseline is valid, beginning test run');
            addToClosedQueue();
        } else {
            test.debug('One or more baseline checks were incorrect, aborting test run, please verify db integrity and try again');
            process.exit();
        }
    });
}

function addToClosedQueue() {
    test.name(1, 'Attempt to add a challenger to a closed queue');
    db.queue.enqueue(leaderId, challengerIds.add, (error, result) => {
        if (error === constants.resultCode.queueIsClosed) {
            test.pass('failed to add with result code queueIsClosed');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully added to a closed queue');
        }

        openQueue();
    });
}

function openQueue() {
    test.name(2, 'Open the queue');
    db.leader.updateQueueStatus(leaderId, true, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully opened the queue');
        }

        verifyQueueStatus1();
    });
}

function verifyQueueStatus1() {
    test.name(3, 'Verify queue status (after open)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queueOpen === false) {
            test.fail('queue is still flagged as closed');
        } else {
            test.pass('queue is flagged as open');
        }

        addExistingChallenger();
    });
}

function addExistingChallenger() {
    test.name(4, 'Attempt to add a challenger who is already in queue');
    db.queue.enqueue(leaderId, challengerIds.hold, (error, result) => {
        if (error === constants.resultCode.alreadyInQueue) {
            test.pass('failed to add with result code alreadyInQueue');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully added a repeat challenger to the queue');
        }

        addNewChallenger();
    });

}

function addNewChallenger() {
    test.name(5, 'Add a new challenger to the queue');
    db.queue.enqueue(leaderId, challengerIds.add, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully added a new challenger to the queue');
        }

        verifyQueue1();
    });
}

function verifyQueue1() {
    test.name(6, 'Verify queue length and order (after add)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.add.length) {
            test.fail(`queue count=${result.queue.length}, expected=${queueStats.add.length}`);
        } else {
            const match = result.queue.find(item => item.challengerId === challengerIds.add);
            if (match.position !== queueStats.add.position) {
                test.fail(`new challenger queue position=${match.position}, expected=${queueStats.add.position}`);
            } else {
                test.pass('queue count and position of the new challenger were correct');
            }
        }

        holdChallenger1();
    });
}

function holdChallenger1() {
    test.name(7, 'Place a challenger on hold');
    db.queue.hold(leaderId, challengerIds.hold, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully placed a challenger on hold');
        }

        verifyQueue2();
    });
}

function verifyQueue2() {
    test.name(8, 'Verify queue length (after first hold)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.hold.length) {
            test.fail(`queue count=${result.queue.length}, expected=${queueStats.hold.length}`);
        } else {
            test.pass('queue count was correct');
        }

        unholdChallenger1();
    });
}

function unholdChallenger1() {
    test.name(9, 'Return a challenger from hold at the back of the queue');
    db.queue.unhold(leaderId, challengerIds.hold, false, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully returned a challenger from hold');
        }

        verifyQueue3();
    });
}

function verifyQueue3() {
    test.name(10, 'Verify queue length and order (after first unhold)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.unholdBack.length) {
            test.fail(`queue count=${result.queue.length}, expected=${queueStats.unholdBack.length}`);
        } else {
            const match = result.queue.find(item => item.challengerId === challengerIds.hold);
            if (match.position !== queueStats.unholdBack.position) {
                test.fail(`unheld challenger queue position=${match.position}, expected=${queueStats.unholdBack.position}`);
            } else {
                test.pass('queue count and position of the unheld challenger were correct');
            }
        }

        holdChallenger2();
    });
}

function holdChallenger2() {
    test.name(11, 'Place a challenger on hold');
    db.queue.hold(leaderId, challengerIds.hold, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully placed a challenger on hold');
        }

        verifyQueue4();
    });
}

function verifyQueue4() {
    test.name(12, 'Verify queue length (after second hold)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.hold.length) {
            test.fail(`queue count=${result.queue.length}, expected=${queueStats.hold.length}`);
        } else {
            test.pass('queue count was correct');
        }

        unholdChallenger2();
    });
}

function unholdChallenger2() {
    test.name(13, 'Return a challenger from hold at the front of the queue');
    db.queue.unhold(leaderId, challengerIds.hold, true, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully returned a challenger from hold');
        }

        verifyQueue5();
    });
}

function verifyQueue5() {
    test.name(14, 'Verify queue length and order (after second unhold)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.unholdFront.length) {
            test.fail(`queue count=${result.queue.length}, expected=${queueStats.unholdFront.length}`);
        } else {
            const match = result.queue.find(item => item.challengerId === challengerIds.hold);
            if (match.position !== queueStats.unholdFront.position) {
                test.fail(`unheld challenger queue position=${match.position}, expected=${queueStats.unholdFront.position}`);
            } else {
                test.pass('queue count and position of the unheld challenger were correct');
            }
        }

        dequeueChallenger();
    });
}

function dequeueChallenger() {
    test.name(15, 'Remove a challenger from the queue');
    db.queue.dequeue(leaderId, challengerIds.add, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully removed a challenger from the queue');
        }

        verifyQueue6();
    });
}

function verifyQueue6() {
    test.name(16, 'Verify queue length (after removal)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.remove.length) {
            test.fail(`queue count=${result.queue.length}, expected=${queueStats.remove.length}`);
        } else {
            test.pass('queue count was correct');
        }

        reportWin();
    });
}

function reportWin() {
    test.name(17, 'Report a challenger win');
    db.leader.reportResult(leaderId, challengerIds.hold, true, true, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('match result reported successfully');
        }

        verifyQueue7();
    });
}

function verifyQueue7() {
    test.name(18, 'Verify queue length (after win reported)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.win.length) {
            test.fail(`queue count=${result.queue.length}, expected=${queueStats.win.length}`);
        } else {
            test.pass('queue count was correct');
        }

        badDequeue();
    });
}

function badDequeue() {
    test.name(19, 'Attempt to remove a challenger who isn\'t in queue from the queue');
    db.queue.dequeue(leaderId, challengerIds.add, (error, result) => {
        if (error === constants.resultCode.notInQueue) {
            test.pass('failed to remove with result code notInQueue');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully removed a challenger from the queue');
        }

        badHold();
    });
}

function badHold() {
    test.name(20, 'Attempt to place a challenger who isn\'t in queue on hold');
    db.queue.hold(leaderId, challengerIds.add, (error, result) => {
        if (error === constants.resultCode.notInQueue) {
            test.pass('failed to hold with result code notInQueue');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully placed a challenger on hold');
        }

        badUnhold();
    });
}

function badUnhold() {
    test.name(21, 'Attempt to return a challenger who isn\'t on hold from hold');
    db.queue.unhold(leaderId, challengerIds.add, true, (error, result) => {
        if (error === constants.resultCode.notInQueue) {
            test.pass('failed to unhold with result code notInQueue');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully returned a challenger from hold');
        }

        closeQueue();
    });
}

function closeQueue() {
    test.name(22, 'Close the queue');
    db.leader.updateQueueStatus(leaderId, false, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully closed the queue');
        }

        verifyQueueStatus2();
    });
}

function verifyQueueStatus2() {
    test.name(23, 'Verify queue status (after close)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else if (result.queueOpen === true) {
            test.fail('queue is still flagged as open');
        } else {
            test.pass('queue is flagged as closed');
        }

        addWithoutEnoughBadges();
    });
}

function addWithoutEnoughBadges() {
    test.name(24, 'Attempt to add a challenger with fewer than 8 badges to an elite queue');
    db.queue.enqueue(eliteId, challengerIds.add, (error, result) => {
        if (error === constants.resultCode.notEnoughBadges) {
            test.pass('failed to add with result code notEnoughBadges');
        } else if (error) {
            test.fail(`error=${error}`);
        } else {
            test.fail('successfully added to an elite queue');
        }

        addWithEnoughBadges();
    });
}

function addWithEnoughBadges() {
    test.name(25, 'Add a challenger to an elite queue');
    db.queue.enqueue(eliteId, challengerIds.elite, (error, result) => {
        if (error) {
            test.fail(`error=${error}`);
        } else {
            test.pass('successfully added a new challenger to the queue');
        }

        cleanup();
    });
}

function cleanup() {
    test.finish();
    test.debug('Cleaning up db modifications');
    db.debugSave(`UPDATE ${db.tables.matches} SET status = ? WHERE challenger_id = ? AND leader_id = ?`, [constants.matchStatus.inQueue, challengerIds.hold, leaderId], (rowCount) => {
        if (rowCount === 0) {
            test.debug('Cleanup failed to revert match result, please validate the db manually');
            process.exit();
        }

        test.debug('Reverted match result');
        db.debugSave(`DELETE FROM ${db.tables.matches} WHERE challenger_id = ? AND leader_id = ?`, [challengerIds.elite, eliteId], (rowCount) => {
            if (rowCount === 0) {
                test.debug('Cleanup failed to delete new elite match, please validate the db manually');
                process.exit();
            }

            test.debug('Deleted new elite match');
            process.exit();
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
