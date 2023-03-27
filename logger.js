const winston = require('winston');
require('winston-daily-rotate-file');
const config = require('./config.js');

module.exports = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.json()),
    transports: [
        new winston.transports.DailyRotateFile({ filename: 'logs/error-%DATE%.log', level: 'error', maxFiles: '14d' }),
        new winston.transports.DailyRotateFile({ filename: 'logs/combined-%DATE%.log', level: 'info', maxFiles: '14d' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});
