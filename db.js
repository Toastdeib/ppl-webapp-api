const sql = require('mysql');
const config = require('./config.js');

const TABLE_SUFFIX = '';
const CHALLENGERS_TABLE = 'ppl_webapp_challengers' + TABLE_SUFFIX;
const LEADERS_TABLE = 'ppl_webapp_leaders' + TABLE_SUFFIX;
const MATCHES_TABLE = 'ppl_webapp_matches' + TABLE_SUFFIX;

/* TABLE SCHEMA *
 * ppl_webapp_challengers
 * - id: VARCHAR(16)
 * - display_name: VARCHAR(40)
 *
 * ppl_webapp_leaders
 * - id: VARCHAR(16)
 * - leader_name: VARCHAR(80)
 * - badge_name: VARCHAR(40)
 *
 * ppl_webapp_matches
 * - match_id: INT
 * - leader_id: VARCHAR(16)
 * - challenger_id: VARCHAR(16)
 * - status: TINYINT
 * - timestamp: TIMESTAMP
 */

const db = sql.createPool({
    host: config.mysqlHost,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    database: config.mysqlDatabase,
    connectionLimit: 5
});

const resultCode = {
    success: 0,
    dbFailure: 1,
    notFound: 2
};


const leaderType = {
    casual: 0,
    veteran: 1,
    elite: 2,
    champion: 3
};

const matchStatus = {
    inQueue: 0,
    onHold: 1,
    loss: 2, // Challenger loss
    win: 3 // Challenger win
};

function fetch(query, params, callback) {
    db.query(query, params, (error, result) => {
        if (error) {
            console.log('Database fetch failed');
            console.log(error);
            callback(resultCode.dbFailure, []);
            return;
        }

        callback(resultCode.success, result);
    });
}

function save(query, params, callback) {
    db.query(query, params, (error, result) => {
        if (error) {
            console.log('Error: save failed');
            console.log(error);
            callback(resultCode.dbFailure);
            return;
        }

        callback(resultCode.success, result.affectedRows);
    });
}

// Challenger functions
function getChallengerInfo(id, callback) {
    fetch(`SELECT display_name FROM ${CHALLENGERS_TABLE} WHERE id = ?`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length === 0) {
            callback(resultCode.notFound);
        } else {
            callback(resultCode.success, {
                displayName: rows[0].display_name,
                queuesEntered: [
                    { leaderId: '3159a3e6b9025da1', position: 0 },
                    { leaderId: 'd33861cc13ade093', position: 3 },
                    { leaderId: 'f0b55294458f63f9', position: 1 }
                ],
                badgesEarned: [
                    '8edaf38672845ab5',
                    'ea78dab8a9f0316e'
                ]
            });
        }
    });
}

function getBadges(id, callback) {
    fetch(`SELECT l.id, l.badge_name FROM ${MATCHES_TABLE} AS m INNER JOIN ${LEADERS_TABLE} AS l ON l.id = m.leader_id WHERE m.challenger_id = ? AND m.status = 3`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else {
            const result = {
                badges: []
            };

            rows.forEach(row => {
                result.badges.push({ leaderId: row.id, badgeName: row.badge_name });
            });

            callback(resultCode.success, result);
        }
    });
}

function getChallengerQueues(id, callback) {
    fetch(`SELECT ...`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else {
            // TODO
        }
    });
}

function setDisplayName(id, name, callback) {
    save(`UPDATE ${CHALLENGERS_TABLE} SET display_name = ? WHERE id = ?`, [name, id], (error, rowCount) => {
        if (error) {
            callback(error);
        } else if (rowCount === 0) {
            callback(resultCode.notFound);
        } else {
            callback(resultCode.success);
        }
    });
}

// Leader functions
function getLeaderInfo(id, callback) {
    fetch(`SELECT leader_name, badge_name FROM ${LEADERS_TABLE} WHERE id = ?`, [id], (error, rows) => {
        if (error) {
            callback(error);
        } else if (rows.length === 0) {
            callback(resultCode.notFound);
        } else {
            callback(resultCode.success, { 
                leaderName: rows[0].leader_name,
                badgeName: rows[0].badge_name,
                queue: [
                    { challengerId: '9ea7e0b018fd9660', position: 0 },
                    { challengerid: '6c1be95794a0325a', position: 1 },
                    { challengerid: 'eef41e425b31ed38', position: 2 }
                ],
                onhold: [
                    'c0e1dac50d375554',
                    'f772ddb47f828d41'
                ]
            });
        }
    });
}

function enqueue(id, challengerId, callback) {
    callback(resultcode.success);
    /*
    save(`INSERT INTO ${MATCHES_TABLE} (leader_id, challenger_id, status, timestamp) VALUES (?, ?, ?, CURRENT_TIMESTAMP())`, [id, challengerId, matchStatus.inQueue], (error, rowCount) => {

    });
    */
}

function dequeue(id, challengerId, challengerWin, callback) {
    callback(resultcode.success);
}

function hold(id, challengerId, callback) {
    callback(resultcode.success);
}

function unhold(id, challengerId, placeAtFront, callback) {
    callback(resultcode.success);
}

module.exports = {
    challenger: {
        getInfo: getChallengerInfo,
        setDisplayName: setDisplayName
    },
    leader: {
        getInfo: getLeaderInfo,
        enqueue: enqueue,
        dequeue: dequeue,
        hold: hold,
        unhold: unhold
    },
    resultCode: resultCode,
    leaderType: leaderType,
    matchStatus: matchStatus
};
