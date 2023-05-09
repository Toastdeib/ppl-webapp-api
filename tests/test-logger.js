import logger from '../logger.js';

let startTime;
let testCount;
let successCount = 0;
let failureCount = 0;

export function name(number, name) {
    logger.api.debug(`\x1b[36mTEST ${number}\x1b[0m: ${name}`);
}

export function pass(msg) {
    logger.api.info(`\x1b[32mTest passed\x1b[0m; ${msg}`);
    successCount++;
    testCount--;
}

export function fail(msg) {
    logger.api.error(`\x1b[31mTest failed\x1b[0m; ${msg}`);
    failureCount++;
    testCount--;
}

export function start(count) {
    startTime = new Date();
    testCount = count;
}

export function finish() {
    logger.api.debug(`Test run completed in \x1b[36m${new Date() - startTime}ms\x1b[0m with \x1b[32m${successCount}\x1b[0m successful tests, \x1b[31m${failureCount}\x1b[0m failing tests, and \x1b[33m${testCount}\x1b[0m skipped tests`);
}

export function debug(msg) {
    logger.api.debug(msg);
}
