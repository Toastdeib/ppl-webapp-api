/********************************************************
 *                DATABASE RESET UTILITY                *
 *                                                      *
 * This module is a convenience for rebuilding the test *
 * database to the baseline defind in baseline.sql. It  *
 * runs each query in the baseline file in order,       *
 * printing a status indicator as it goes and the total *
 * runtime upon completion.                             *
 *                                                      *
 * To prevent logs from being created, this should be   *
 * run via the reset.sh script, which sets an           *
 * environment variable to use debug logging like the   *
 * test suites do instead of writing to file.           *
 ********************************************************/
import config from '../config/config.js';
import fs from 'fs';
import logger from '../util/logger.js';
import sql from 'mysql';

const sqlDb = sql.createPool({
    host: config.mysqlHost,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    database: config.mysqlDatabase,
    connectionLimit: 5
});

const BAR_SEGMENTS = 50;

function saveAsync(query, params) {
    return new Promise((resolve) => {
        sqlDb.query(query, params, (error, result) => {
            if (error) {
                logger.api.error('Database write failed');
                logger.api.error(error);
                resolve({ status: 1, rowCount: [] });
            } else {
                resolve({ status: 0, rowCount: result.affectedRows });
            }
        });
    });
}

async function repopulateDb() {
    const lines = fs.readFileSync('../tests/baseline.sql', 'utf8').split('\n')
        .filter(line => line.indexOf('INSERT INTO') === 0 || line.indexOf('DELETE FROM') === 0);
    logger.api.debug(`Rebuilding test db from ${lines.length} statements...`);
    console.log('0%                                            100%');

    const now = new Date();
    const factor = lines.length / BAR_SEGMENTS;
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

    console.log();
    logger.api.debug(`Test db rebuild complete in \x1b[36m${new Date() - now}ms\x1b[0m`);
    process.exit();
}

repopulateDb();
