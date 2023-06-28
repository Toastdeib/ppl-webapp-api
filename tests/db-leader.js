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
import { debug, fail, finish, name, next, pass, start } from './test-logger.js';

/****************
 * TESTING DATA *
 ****************/
const leaderId = '6a9406eedec6';
const noDuoLeaderId = '7729e38c3f7d';
const eliteId = '64750eab176f';
const baseline = {
    leaderName: 'Test Leader, the Testable',
    leaderType: 7,
    battleFormat: 7,
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

            if (result.battleFormat !== baseline.battleFormat) {
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
            next(addToClosedQueue);
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

        next(badOpenDuoQueue);
    });
}

function badOpenDuoQueue() {
    name(2, 'Attempt to open the queue in duo mode as a non-multi leader');
    db.leader.updateQueueStatus(noDuoLeaderId, true, true, (error) => {
        if (error === resultCode.duoModeNotSupported) {
            pass('failed to add with result code duoModeNotSupported');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully opened the queue');
        }

        next(openDuoQueue);
    });
}

function openDuoQueue() {
    name(3, 'Open the queue in duo mode');
    db.leader.updateQueueStatus(leaderId, true, true, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully opened the queue');
        }

        next(verifyQueueStatus1);
    });
}

function verifyQueueStatus1() {
    name(4, 'Verify queue status (after duo open)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queueOpen === false) {
            fail('queue is still flagged as closed');
        } else if (result.queue[0].linkCode !== result.queue[1].linkCode) {
            fail('first two challengers have mismatching link codes in duo mode');
        } else {
            pass('queue is flagged as open');
        }

        next(closeQueue1);
    });
}

function closeQueue1() {
    name(5, 'Close the queue');
    db.leader.updateQueueStatus(leaderId, false, false, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully closed the queue');
        }

        next(openSoloQueue);
    });
}

function openSoloQueue() {
    name(6, 'Open the queue in regular mode');
    db.leader.updateQueueStatus(leaderId, true, false, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully opened the queue');
        }

        next(verifyQueueStatus2);
    });
}

function verifyQueueStatus2() {
    name(7, 'Verify queue status (after regular open)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queueOpen === false) {
            fail('queue is still flagged as closed');
        } else if (result.queue[0].linkCode === result.queue[1].linkCode) {
            fail('first two challengers have matching link codes in regular mode');
        } else {
            pass('queue is flagged as open');
        }

        next(reopenQueue);
    });
}

function reopenQueue() {
    name(8, 'Attempt to reopen the already-open queue');
    db.leader.updateQueueStatus(leaderId, true, false, (error) => {
        if (error === resultCode.queueAlreadyOpen) {
            pass('failed to open with result code queueAlreadyOpen');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully opened the queue');
        }

        next(addExistingChallenger);
    });
}

function addExistingChallenger() {
    name(9, 'Attempt to add a challenger who is already in queue');
    db.queue.enqueue(leaderId, challengerIds.hold, leaderType.casual, battleFormat.singles, (error) => {
        if (error === resultCode.alreadyInQueue) {
            pass('failed to add with result code alreadyInQueue');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully added a repeat challenger to the queue');
        }

        next(addNewChallenger);
    });

}

function addNewChallenger() {
    name(10, 'Add a new challenger to the queue');
    db.queue.enqueue(leaderId, challengerIds.add, leaderType.casual, battleFormat.singles, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully added a new challenger to the queue');
        }

        next(verifyQueue1);
    });
}

function verifyQueue1() {
    name(11, 'Verify queue length and order (after add)');
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

        next(holdChallenger1);
    });
}

function holdChallenger1() {
    name(12, 'Place a challenger on hold');
    db.queue.hold(leaderId, challengerIds.hold, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully placed a challenger on hold');
        }

        next(verifyQueue2);
    });
}

function verifyQueue2() {
    name(13, 'Verify queue length (after first hold)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.hold.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.hold.length}`);
        } else {
            pass('queue count was correct');
        }

        next(unholdChallenger1);
    });
}

function unholdChallenger1() {
    name(14, 'Return a challenger from hold at the back of the queue');
    db.queue.unhold(leaderId, challengerIds.hold, false, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully returned a challenger from hold');
        }

        next(verifyQueue3);
    });
}

function verifyQueue3() {
    name(15, 'Verify queue length and order (after first unhold)');
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

        next(holdChallenger2);
    });
}

function holdChallenger2() {
    name(16, 'Place a challenger on hold');
    db.queue.hold(leaderId, challengerIds.hold, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully placed a challenger on hold');
        }

        next(verifyQueue4);
    });
}

function verifyQueue4() {
    name(17, 'Verify queue length (after second hold)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.hold.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.hold.length}`);
        } else {
            pass('queue count was correct');
        }

        next(unholdChallenger2);
    });
}

function unholdChallenger2() {
    name(18, 'Return a challenger from hold at the front of the queue');
    db.queue.unhold(leaderId, challengerIds.hold, true, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully returned a challenger from hold');
        }

        next(verifyQueue5);
    });
}

function verifyQueue5() {
    name(19, 'Verify queue length and order (after second unhold)');
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

        next(dequeueChallenger);
    });
}

function dequeueChallenger() {
    name(20, 'Remove a challenger from the queue');
    db.queue.dequeue(leaderId, challengerIds.add, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully removed a challenger from the queue');
        }

        next(verifyQueue6);
    });
}

function verifyQueue6() {
    name(21, 'Verify queue length (after removal)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.remove.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.remove.length}`);
        } else {
            pass('queue count was correct');
        }

        next(reportWin);
    });
}

function reportWin() {
    name(22, 'Report a challenger win');
    db.leader.reportResult(leaderId, [challengerIds.hold], true, true, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('match result reported successfully');
        }

        next(verifyQueue7);
    });
}

function verifyQueue7() {
    name(23, 'Verify queue length (after win reported)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queue.length !== queueStats.win.length) {
            fail(`queue count=${result.queue.length}, expected=${queueStats.win.length}`);
        } else {
            pass('queue count was correct');
        }

        next(badDequeue);
    });
}

function badDequeue() {
    name(24, 'Attempt to remove a challenger who isn\'t in queue from the queue');
    db.queue.dequeue(leaderId, challengerIds.add, (error) => {
        if (error === resultCode.notInQueue) {
            pass('failed to remove with result code notInQueue');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully removed a challenger from the queue');
        }

        next(badHold);
    });
}

function badHold() {
    name(25, 'Attempt to place a challenger who isn\'t in queue on hold');
    db.queue.hold(leaderId, challengerIds.add, (error) => {
        if (error === resultCode.notInQueue) {
            pass('failed to hold with result code notInQueue');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully placed a challenger on hold');
        }

        next(badUnhold);
    });
}

function badUnhold() {
    name(26, 'Attempt to return a challenger who isn\'t on hold from hold');
    db.queue.unhold(leaderId, challengerIds.add, true, (error) => {
        if (error === resultCode.notInQueue) {
            pass('failed to unhold with result code notInQueue');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully returned a challenger from hold');
        }

        next(closeQueue2);
    });
}

function closeQueue2() {
    name(27, 'Close the queue');
    db.leader.updateQueueStatus(leaderId, false, false, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully closed the queue');
        }

        next(recloseQueue);
    });
}

function recloseQueue() {
    name(28, 'Attempt to reclose the already-closed queue');
    db.leader.updateQueueStatus(leaderId, false, false, (error) => {
        if (error === resultCode.queueAlreadyClosed) {
            pass('failed to open with result code queueAlreadyClosed');
        } else {
            fail('successfully closed the queue');
        }

        next(verifyQueueStatus3);
    });
}

function verifyQueueStatus3() {
    name(29, 'Verify queue status (after close)');
    db.leader.getInfo(leaderId, (error, result) => {
        if (error) {
            fail(`error=${error}`);
        } else if (result.queueOpen === true) {
            fail('queue is still flagged as open');
        } else {
            pass('queue is flagged as closed');
        }

        next(addWithoutEnoughBadges);
    });
}

function addWithoutEnoughBadges() {
    name(30, 'Attempt to add a challenger with fewer than 8 badges to an elite queue');
    db.queue.enqueue(eliteId, challengerIds.add, leaderType.elite, battleFormat.singles, (error) => {
        if (error === resultCode.notEnoughBadges) {
            pass('failed to add with result code notEnoughBadges');
        } else if (error) {
            fail(`error=${error}`);
        } else {
            fail('successfully added to an elite queue');
        }

        next(addWithEnoughBadges);
    });
}

function addWithEnoughBadges() {
    name(31, 'Add a challenger to an elite queue');
    db.queue.enqueue(eliteId, challengerIds.elite, leaderType.elite, battleFormat.singles, (error) => {
        if (error) {
            fail(`error=${error}`);
        } else {
            pass('successfully added a new challenger to the queue');
        }

        next(cleanup);
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
    start(31);
    verifyBaseline();
});
