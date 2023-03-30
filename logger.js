const winston = require('winston');
require('winston-daily-rotate-file');
const config = require('./config.js');

module.exports = {
    api: winston.createLogger({
        level: 'debug',
        format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.json()),
        transports: [
            new winston.transports.DailyRotateFile({ filename: 'logs/api-error-%DATE%.log', level: 'error', maxFiles: '14d' }),
            new winston.transports.DailyRotateFile({ filename: 'logs/api-combined-%DATE%.log', level: 'info', maxFiles: '14d' }),
            new winston.transports.Console({ format: winston.format.simple() })
        ]
    }),
    client: winston.createLogger({
        format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.json()),
        transports: [
            new winston.transports.DailyRotateFile({ filename: 'logs/client-error-%DATE%.log', level: 'error', maxFiles: '14d' }),
            new winston.transports.DailyRotateFile({ filename: 'logs/client-combined-%DATE%.log', level: 'info', maxFiles: '14d' }),
        ]
    })
};
