const logger = require('../logger.js');

let startTime;
let successCount = 0;
let failureCount = 0;

module.exports = {
    start: () => {
        startTime = new Date();
    },
    name: (number, name) => {
        logger.api.debug(`\x1b[36mTEST ${number}\x1b[0m: ${name}`);
    },
    pass: (msg) => {
        logger.api.info(`\x1b[32mTest passed\x1b[0m; ${msg}`);
        successCount++;
    },
    fail: (msg) => {
        logger.api.error(`\x1b[31mTest failed\x1b[0m; ${msg}`);
        failureCount++;
    },
    finish: () => {
        logger.api.debug(`Test run completed in \x1b[36m${new Date() - startTime}ms\x1b[0m with \x1b[32m${successCount}\x1b[0m successful tests and \x1b[31m${failureCount}\x1b[0m failing tests`);
    },
    debug: (msg) => {
        logger.api.debug(msg);
    }
}
