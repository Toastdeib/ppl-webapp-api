/********************************************************
 *             LEADER DATA LOADING UTILITY              *
 *                                                      *
 * This module is a convenience for populating the      *
 * ppl_webapp_leaders table with data for a new PPL     *
 * event. It works off of a .tsv file and takes several *
 * parameters, explained in detail in the README file.  *
 *                                                      *
 * To prevent logs from being created, this should be   *
 * run via the reset.sh script, which sets an           *
 * environment variable to use debug logging like the   *
 * test suites do instead of writing to file.           *
 ********************************************************/
import config from '../config/config.js';
import crypto from 'crypto';
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

const EXPECTED_ARG_COUNT = 5;
const TSV_WIDTH = 6;
const ID_HEX_SIZE = 6;

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

function generateHex(length) {
    return crypto.randomBytes(length).toString('hex');
}

function sanitizeStringValue(value) {
    if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substr(1, value.length - 2);
    }

    return value.replace('\\"', '"');
}

async function populateLeaderData() {
    if (process.argv.length !== EXPECTED_ARG_COUNT) {
        logger.api.error('Invalid invocation; expected three parameters');
        return;
    }

    const file = process.argv[2].toLowerCase().trim();
    const suffix = process.argv[3].toLowerCase().trim();
    const supportsQueueState = process.argv[4].toLowerCase().trim() === 'true';

    try {
        // Expected .tsv file structure: leader name, leader type, battle format, badge name, bio, tagline
        // Leader type and battle format should already be populated as their bitmask values in the .tsv
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        logger.api.info(`Importing ${lines.length} leader(s)`);
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length !== TSV_WIDTH) {
                logger.api.error(`Failed to parse a line: ${line}`);
                continue;
            }

            const id = generateHex(ID_HEX_SIZE);
            await saveAsync(`INSERT INTO ppl_webapp_leaders${suffix} (id, leader_name, leader_type, battle_format, badge_name, leader_bio, leader_tagline, queue_open) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, sanitizeStringValue(parts[0]), Number(parts[1]), Number(parts[2]), sanitizeStringValue(parts[3]), sanitizeStringValue(parts[4]), sanitizeStringValue(parts[5]), supportsQueueState ? 0 : 1]);
            logger.api.info(`Loaded data for ${sanitizeStringValue(parts[0])}, id=${id}`);
        }
    } catch (e) {
        logger.api.error(e);
        return;
    }
}

populateLeaderData();
