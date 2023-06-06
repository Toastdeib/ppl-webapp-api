/********************************************************
 *                DATABASE RESET UTILITY                *
 *                                                      *
 * This module is a convenience for rebuilding the test *
 * database to the baseline defind in baseline.sql. It  *
 * runs each query in the baseline file in order,       *
 * printing a status indicator as it goes and the total *
 * runtime upon completion.                             *
 *                                                      *
 * Usage:                                               *
 * node db-reset.js                                     *
 ********************************************************/
import config from '../config/config.js';
import fs from 'fs';
import sql from 'mysql';

const sqlDb = sql.createPool({
    host: config.mysqlHost,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    database: config.mysqlDatabase,
    connectionLimit: 5
});

function saveAsync(query, params) {
    return new Promise((resolve) => {
        sqlDb.query(query, params, (error, result) => {
            if (error) {
                console.log('Database write failed');
                console.log(error);
                resolve({ status: 1, rowCount: [] });
            } else {
                resolve({ status: 0, rowCount: result.affectedRows });
            }
        });
    });
}

async function repopulateDb() {
    const lines = fs.readFileSync('baseline.sql', 'utf8').split('\n')
        .filter(line => line.indexOf('INSERT INTO') === 0 || line.indexOf('DELETE FROM') === 0);
    console.log(`Rebuliding test db from ${lines.length} statements...`);
    console.log('0%                                            100%');

    const now = new Date();
    const factor = lines.length / 50;
    let lastWhole = 0;
    let count = 0;
    for (const line of lines) {
        await saveAsync(line);
        const progress = Math.floor(++count / factor);
        if (progress > lastWhole) {
            process.stdout.write('█');
            lastWhole = progress;
        }
    }

    console.log(`\nTest db rebuild complete in \x1b[36m${new Date() - now}ms\x1b[0m`);
    process.exit();
}

repopulateDb();
