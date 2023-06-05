/******************************************************
 *                   LOGGING MODULE                   *
 *                                                    *
 * This module defines a logger for use by all other  *
 * modules in the project. It uses the winston log    *
 * library to format and write messages to a rotating *
 * log file, which runs on a 14d expiration. It also  *
 * supports a special logging mode for the test       *
 * suites which prints log messages to the console    *
 * with color formatting for clarity, so as to avoid  *
 * clogging the real logs with dummy data.            *
 ******************************************************/
import winston from 'winston';
import 'winston-daily-rotate-file';

function dDebug(msg) {
    console.log(`\x1b[36mD>\x1b[0m ${msg}`);
}

function dInfo(msg) {
    console.log(`\x1b[32mI>\x1b[0m ${msg}`);
}

function dWarn(msg) {
    console.log(`\x1b[33mW>\x1b[0m ${msg}`);
}

function dError(msg) {
    console.log(`\x1b[31mE>\x1b[0m ${msg}`);
}

let apiLogger, clientLogger;
if (process.env.TEST_RUN === 'true') {
    apiLogger = {
        debug: dDebug,
        info: dInfo,
        warn: dWarn,
        error: dError
    };

    clientLogger = {
        debug: dDebug,
        info: dInfo,
        warn: dWarn,
        error: dError
    };
} else {
    apiLogger = winston.createLogger({
        level: 'debug',
        format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.json()),
        transports: [
            new winston.transports.DailyRotateFile({ filename: 'logs/api-error-%DATE%.log', level: 'error', maxFiles: '14d' }),
            new winston.transports.DailyRotateFile({ filename: 'logs/api-combined-%DATE%.log', level: 'info', maxFiles: '14d' }),
            new winston.transports.Console({ format: winston.format.simple() })
        ]
    });

    clientLogger = winston.createLogger({
        format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.json()),
        transports: [
            new winston.transports.DailyRotateFile({ filename: 'logs/client-error-%DATE%.log', level: 'error', maxFiles: '14d' }),
            new winston.transports.DailyRotateFile({ filename: 'logs/client-combined-%DATE%.log', level: 'info', maxFiles: '14d' })
        ]
    });
}

const logger = {
    api: apiLogger,
    client: clientLogger
};

export default logger;
