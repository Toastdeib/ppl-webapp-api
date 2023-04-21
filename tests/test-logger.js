const logger = require('../logger.js');

module.exports = {
    name: (number, name) => {
        logger.api.debug(`\x1b[36mTEST ${number}\x1b[0m: ${name}`);
    },
    pass: (msg) => {
        logger.api.info(`\x1b[32mTest passed\x1b[0m; ${msg}`);
    },
    fail: (msg) => {
        logger.api.error(`\x1b[31mTest failed\x1b[0m; ${msg}`);
    },
    complete: (duration, successes, failures) => {
        logger.api.debug(`Test run completed in \x1b[36m${duration}ms\x1b[0m with \x1b[32m${successes}\x1b[0m successful tests and \x1b[31m${failures}\x1b[0m failing tests`);
    },
    debug: (msg) => {
        logger.api.debug(msg);
    }
}
