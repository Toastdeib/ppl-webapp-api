const winston = require('winston');
require('winston-daily-rotate-file');
const config = require('./config.js');

const testRunLogger = {
    debug: (msg) => {
        console.log(`\x1b[36mD>\x1b[0m ${msg}`);
    },
    info: (msg) => {
        console.log(`\x1b[32mI>\x1b[0m ${msg}`);
    },
    warn: (msg) => {
        console.log(`\x1b[33mW>\x1b[0m ${msg}`);
    },
    error: (msg) => {
        console.log(`\x1b[31mE>\x1b[0m ${msg}`);
    },
}

const apiLogger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.json()),
    transports: [
        new winston.transports.DailyRotateFile({ filename: 'logs/api-error-%DATE%.log', level: 'error', maxFiles: '14d' }),
        new winston.transports.DailyRotateFile({ filename: 'logs/api-combined-%DATE%.log', level: 'info', maxFiles: '14d' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

const clientLogger = winston.createLogger({
    format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.json()),
    transports: [
        new winston.transports.DailyRotateFile({ filename: 'logs/client-error-%DATE%.log', level: 'error', maxFiles: '14d' }),
        new winston.transports.DailyRotateFile({ filename: 'logs/client-combined-%DATE%.log', level: 'info', maxFiles: '14d' }),
    ]
});

module.exports = {
    api: process.env.TEST_RUN === 'true' ? testRunLogger : apiLogger,
    client: clientLogger
};
