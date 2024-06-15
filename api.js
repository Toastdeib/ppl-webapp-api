/******************************************************
 *                     API MODULE                     *
 *                                                    *
 * This module defines all of the public-facing web   *
 * API paths exposed by the server. The paths are     *
 * split up into sections for clarity - auth, leader, *
 * challenger, unauthenticated, and logging. The      *
 * module exports the express app so it can be        *
 * instantiated for actual use as well as for use in  *
 * the API test suites. It also exports the           *
 * validateSession function for use by websockets.    *
 ******************************************************/
import bodyParser from 'body-parser';
import config from './config/config.js';
import cors from 'cors';
import db from './db/db.js';
import express from 'express';
import fs from 'fs';
import http from 'http';
import logger from './util/logger.js';
import sanitize from 'sanitize-html';
import { challengerErrors, leaderErrors } from './util/errors.js';
import { getMetrics, trackRequest, trackResponse } from './util/metrics.js';
import { httpStatus, leaderType, matchStatus, platformType, pplEvent, requestType, resultCode } from './util/constants.js';
import { notifyRefreshBingo, notifyRefreshData } from './ws-server.js';

const api = express();
api.use(cors({ origin: config.corsOrigin }));
api.use(bodyParser.json());
api.set('view engine', 'pug');
api.use('/static', express.static('static', {
    setHeaders: (res) => {
        res.set('Cache-Control', 'public, max-age=604800');
    }
}));

// eslint-disable-next-line no-magic-numbers
const ONE_DAY_MILLIS = 24 * 60 * 60 * 1000;
// eslint-disable-next-line no-magic-numbers
const SESSION_EXPIRATION_MILLIS = 4 * ONE_DAY_MILLIS; // 4 days in ms
const PRUNE_INTERVAL_MILLIS = ONE_DAY_MILLIS;
const SESSION_TOKEN_HEX_LENGTH = 16;
const BATTLE_CODE_SECTION_LENGTH = 4;
const CACHE_FILE = 'cache.json';
let sessionCache;
let idCache;

const AUTH_HEADER = 'Authorization';
const PPL_EVENT_HEADER = 'PPL-Event';
const PLATFORM_HEADER = 'Platform';

const EVENT_END_DATE = new Date(config.eventEndDate);

/******************
 * Util functions *
 ******************/
function sendJsonResponse(statusCode, body, res, correlationId) {
    trackResponse(statusCode, correlationId);
    res.status(statusCode).json(body);
}

function handleDbError(errorList, code, res, correlationId) {
    const error = errorList[code];
    if (!error) {
        logger.api.error(`No error data found for code=${code}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'An unexpected error occurred, please try again.', code: code }, res, correlationId);
        return;
    }

    logger.api.info(error.logMessage);
    sendJsonResponse(error.statusCode, { error: error.userMessage, code: code }, res, correlationId);
}

function getChallengerInfo(req, res, correlationId) {
    logger.api.info(`Returning challenger info for loginId=${req.params.id}`);
    db.challenger.getInfo(req.params.id, (error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            sendJsonResponse(httpStatus.ok, {
                id: req.params.id,
                ...result
            }, res, correlationId);
        }
    });
}

function getLeaderInfo(req, res, notify, correlationId) {
    logger.api.info(`Returning leader info for loginId=${req.params.id}, leaderId=${req.leaderId} with notify=${notify}`);
    db.leader.getInfo(req.leaderId, (error, result) => {
        if (error) {
            handleDbError(leaderErrors, error, res, correlationId);
        } else {
            if (notify) {
                for (const item of result.queue) {
                    notifyRefreshData(item.challengerId);
                }
            }

            sendJsonResponse(httpStatus.ok, {
                loginId: req.params.id,
                leaderId: req.leaderId,
                ...result
            }, res, correlationId);
        }
    });
}

function reportMatchResult(challengerIds, req, res, correlationId) {
    const challengerWin = !!req.body.challengerWin;
    const badgeAwarded = !!req.body.badgeAwarded;
    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} reporting match result ${challengerWin}, badge awarded ${badgeAwarded} for challengerIds=${challengerIds.join(', ')}`);
    db.leader.reportResult(req.leaderId, challengerIds, challengerWin, badgeAwarded, (error, result) => {
        if (error) {
            handleDbError(leaderErrors, error, res, correlationId);
        } else {
            for (const challengerId of challengerIds) {
                if (result.hof) {
                    sendHttpBotRequest('/hofentered', { challengerId: challengerId });
                } else if (badgeAwarded) {
                    sendHttpBotRequest('/badgeearned', { challengerId: challengerId, leaderId: req.leaderId });
                }
            }

            for (const challengerId of challengerIds) {
                notifyRefreshData(challengerId);
                notifyRefreshBingo(challengerId);
            }

            getLeaderInfo(req, res, true, correlationId);
        }
    });
}

function decodeCredentials(credentials) {
    const parts = credentials.split(' ');
    if (parts[0] !== 'Basic') {
        return false;
    }

    return atob(parts[1]).split(':');
}

function createSession(id, isLeader, leaderId, platform) {
    const token = db.generateHex(SESSION_TOKEN_HEX_LENGTH);
    sessionCache[token] = {
        id: id,
        lastUsed: new Date().getTime(),
        isLeader: isLeader,
        leaderId: leaderId,
        platform: platform
    };

    saveCache();
    return token;
}

function clearSession(token, id) {
    const parts = token.split(' ');
    if (parts[0] !== 'Bearer') {
        // Malformed token header
        return;
    }

    const session = sessionCache[parts[1]];
    if (!session) {
        // No session found, so there's nothing to do
        return;
    }

    if (session.id !== id) {
        logger.api.error('Clearing a session where the request ID didn\'t match the stored one');
    }

    delete sessionCache[parts[1]];
    saveCache();
}

export function validateSession(token, id, type) {
    if (!token) {
        // Missing token header
        logger.api.warn(`loginId=${id} attempted to make an API request with a missing auth header`);
        return false;
    }

    const parts = token.split(' ');
    if (parts[0] !== 'Bearer') {
        // Malformed token header
        logger.api.warn(`loginId=${id} attempted to make an API request with with a malformed auth header`);
        return false;
    }

    const session = sessionCache[parts[1]];
    if (!session) {
        // No session found for the provided access token
        logger.api.warn(`loginId=${id} attempted to make an API request with with an invalid token`);
        return false;
    }

    if (session.id !== id) {
        // Incorrect ID in the request for the provided token
        logger.api.warn(`loginId=${id} attempted to make an API request with a token associated with loginId=${session.id}`);
        return false;
    }

    if ((type === requestType.challenger && session.isLeader) || (type === requestType.leader && session.isChallenger)) {
        // Disallow API requests from the wrong user type
        logger.api.warn(`loginId=${id} attempted to make an API request for the incorrect user type`);
        return false;
    }

    const now = new Date().getTime();
    const sessionAge = now - session.lastUsed;
    if (sessionAge > SESSION_EXPIRATION_MILLIS) {
        // Session is expired, clear it out of the cache
        logger.api.info(`Session expired for loginId=${id} (expired ${sessionAge - SESSION_EXPIRATION_MILLIS}ms ago), removing from cache`);
        delete sessionCache[parts[1]];
        saveCache();
        return false;
    }

    session.lastUsed = now;
    return session;
}

function pplEventToBitmask(eventString) {
    if (!eventString) {
        return false;
    }

    eventString = eventString.toLowerCase();
    if (!pplEvent[eventString]) {
        return false;
    }

    return pplEvent[eventString];
}

function platformToEnum(platformString) {
    if (!platformString) {
        return platformType.none;
    }

    platformString = platformString.toLowerCase();
    if (!platformType[platformString]) {
        return platformType.none;
    }

    return platformType[platformString];
}

function validateChallengerId(id) {
    return idCache.challengers.indexOf(id) !== -1;
}

function validateLeaderId(id) {
    return idCache.leaders.indexOf(id) !== -1;
}

function saveCache() {
    logger.api.debug('Writing session cache to file');
    fs.writeFileSync(CACHE_FILE, JSON.stringify(sessionCache), 'utf8');
}

function initCaches() {
    try {
        logger.api.debug('Restoring session cache from file');
        sessionCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (err) {
        logger.api.debug('Could not restore session cache, initializing as empty instead');
        sessionCache = {};
    }

    db.getAllIds((error, result) => {
        if (error) {
            logger.api.debug('Failed to initialize ID cache');
            idCache = { challengers: [], leaders: [] };
        } else {
            logger.api.debug('ID cache initialized');
            idCache = result;
        }
    });
}

function pruneSessionCache() {
    logger.api.info('Bulk pruning expired sessions');
    const now = new Date().getTime();
    let removed = 0;
    for (const id of Object.keys(sessionCache)) {
        if (now - sessionCache[id].lastUsed > SESSION_EXPIRATION_MILLIS) {
            // Session is expired, clear it out of the cache
            delete sessionCache[id];
            removed++;
        }
    }

    logger.api.info(`Removed ${removed} expired session${removed === 1? '' : 's'} from the cache`);
    saveCache();
}

function formatLogLine(line) {
    const json = JSON.parse(line);
    return { msg: `[${json.timestamp}] ${json.level}: ${json.message}`, level: json.level };
}

function generateLogviewResponse(res, daysAgo) {
    logger.api.debug('Rendering logs page');
    const date = new Date();
    date.setTime(date.getTime() - (daysAgo * ONE_DAY_MILLIS));

    // NOTE: This logic operates on the assumption that there's a file every day from the oldest one up to today
    const logFileCount = fs.readdirSync('logs').reduce((acc, filename) => { return acc + (filename.startsWith('api-combined') ? 1 : 0); }, 0);

    try {
        // eslint-disable-next-line no-magic-numbers
        const lines = fs.readFileSync(`./logs/api-combined-${date.toISOString().substring(0, 10)}.log`, 'utf8').trim().split('\n');
        res.render('logs', {
            date: date.toDateString(),
            lines: lines.map(formatLogLine),
            logFileCount: logFileCount,
            daysAgo: daysAgo
        });
    } catch (e) {
        res.render('nodata', {
            date: date.toDateString()
        });
    }
}

function clientLog(req, res, logFunc) {
    const message = sanitize(req.body.message);
    if (!message) {
        logger.api.debug('Received client log request with no message in the body');
        res.status(httpStatus.badRequest).json({ error: 'The JSON body for requests to this endpoint must include a \'message\' property.' });
        return;
    }

    logger.api.debug('Received log message from the client');
    logFunc(message);
    const stackTrace = sanitize(req.body.stackTrace);
    if (stackTrace) {
        logFunc(stackTrace);
    }

    res.json({});
}

function sendHttpBotRequest(path, params) {
    if (!config.supportsBotNotifications) {
        // Don't send bot notifications if the event doesn't support them
        return;
    }

    const postData = JSON.stringify(params);
    const options = {
        hostname: 'localhost',
        port: config.botApiPort,
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    logger.api.info(`Sending HTTP request to the bot webserver with path=${path} and postData=${postData}`);
    const req = http.request(options, (res) => {
        if (res.statusCode !== httpStatus.ok) {
            logger.api.warn(`Received non-200 status code from the bot webserver, statusCode=${res.statusCode}`);
        }

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            logger.api.info(`Response body: ${chunk}`);
        });
    });

    req.on('error', (error) => {
        logger.api.error(`Bot webserver error: ${error.message}`);
    });

    req.write(postData);
    req.end();
}

function eventIsOver(res, correlationId) {
    if (new Date() > EVENT_END_DATE) {
        if (res) {
            sendJsonResponse(httpStatus.badRequest, { error: 'You\'re still here? It\'s over! Go home! Go!' }, res, correlationId);
        }

        return true;
    }

    return false;
}

/***********************
 * Authentication APIs *
 ***********************/
api.post('/api/v2/register', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/register');
    const credentials = req.get(AUTH_HEADER);
    const eventString = req.get(PPL_EVENT_HEADER);
    const platformString = req.get(PLATFORM_HEADER);

    if (!credentials) {
        logger.api.warn('Registration attempt with missing auth header');
        sendJsonResponse(httpStatus.badRequest, { error: 'Registration requests must include an \'Authorization\' header.' }, res, correlationId);
        return;
    }

    const parts = decodeCredentials(credentials);
    if (!parts) {
        logger.api.warn('Registration attempt with malformed auth header');
        sendJsonResponse(httpStatus.badRequest, { error: 'The \'Authorization\' header in your request was malformed.' }, res, correlationId);
        return;
    }

    const eventMask = pplEventToBitmask(eventString);
    if (!eventMask) {
        logger.api.warn(`Registration attempt with unexpected PPL event header value=${eventString}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'The \'PPL-Event\' header in your request was either missing or invalid.' }, res, correlationId);
        return;
    }

    db.auth.register(parts[0], parts[1], eventMask, (error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            logger.api.info(`Registered loginId=${result.id} with username=${parts[0]}`);
            const token = createSession(result.id, result.isLeader, result.leaderId, platformToEnum(platformString));
            idCache.challengers.push(result.id);
            if (result.pplEvent === pplEvent.online) {
                sendHttpBotRequest('/challengerregistered', {});
            }

            sendJsonResponse(httpStatus.ok, {
                id: result.id,
                loginId: result.id,
                leaderId: result.leaderId,
                isLeader: result.isLeader,
                token: token
            }, res, correlationId);
        }
    });
});

api.post('/api/v2/login', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/login');
    const credentials = req.get(AUTH_HEADER);
    const eventString = req.get(PPL_EVENT_HEADER);
    const platformString = req.get(PLATFORM_HEADER);

    if (!credentials) {
        logger.api.warn('Login attempt with missing auth header');
        sendJsonResponse(httpStatus.badRequest, { error: 'Login requests must include an \'Authorization\' header.' }, res, correlationId);
        return;
    }

    const parts = decodeCredentials(credentials);
    if (!parts) {
        logger.api.warn('Login attempt with malformed auth header');
        sendJsonResponse(httpStatus.badRequest, { error: 'The \'Authorization\' header in your request was malformed.' }, res, correlationId);
        return;
    }

    const eventMask = pplEventToBitmask(eventString);
    if (!eventMask) {
        logger.api.warn(`Login attempt with unexpected PPL event header value=${eventString}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'The \'PPL-Event\' header in your request was either missing or invalid.' }, res, correlationId);
        return;
    }

    db.auth.login(parts[0], parts[1], eventMask, (error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            logger.api.info(`Logged in loginId=${result.id} with username=${parts[0]}`);
            // Only populate an existing push token in the session info if the login platform matches the push type
            const platform = platformToEnum(platformString);
            const token = createSession(result.id, result.isLeader, result.leaderId, platform);
            if (result.newEvent === pplEvent.online) {
                sendHttpBotRequest('/challengerregistered', {});
            }

            sendJsonResponse(httpStatus.ok, {
                id: result.id,
                loginId: result.id,
                leaderId: result.leaderId,
                isLeader: result.isLeader,
                token: token
            }, res, correlationId);
        }
    });
});

api.post('/api/v2/logout/:id', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/logout/:id');
    logger.api.info(`Logged out loginId=${req.params.id}`);
    const token = req.get(AUTH_HEADER);
    if (token) {
        clearSession(token, req.params.id);
    }

    sendJsonResponse(httpStatus.ok, {}, res, correlationId);
});

api.get('/api/v2/allleaderdata', (req, res) => {
    const correlationId = trackRequest('GET /api/v2/allleaderdata');
    logger.api.info('Fetching all leader data');
    db.getAllLeaderData((error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            sendJsonResponse(httpStatus.ok, result, res, correlationId);
        }
    });
});

/*******************
 * Challenger APIs *
 *******************/
api.use('/api/v2/challenger/:id', (req, res, next) => {
    logger.api.info(`Validating token for challenger endpoint request for loginId=${req.params.id}`);
    if (!validateSession(req.get(AUTH_HEADER), req.params.id, requestType.challenger)) {
        res.status(httpStatus.unauthorized).json({ error: 'The \'Authorization\' header in your request was missing, invalid, or malformed.' });
        return;
    }

    next();
});

api.get('/api/v2/challenger/:id', (req, res) => {
    const correlationId = trackRequest('GET /api/v2/challenger/:id');
    getChallengerInfo(req, res, correlationId);
});

api.put('/api/v2/challenger/:id', (req, res) => {
    const correlationId = trackRequest('PUT /api/v2/challenger/:id');
    const name = req.body.displayName;
    if (!name) {
        sendJsonResponse(httpStatus.badRequest, { error: 'The JSON body for requests to this endpoint must include a \'displayName\' property.' }, res, correlationId);
        return;
    }

    logger.api.info(`Setting display name for loginId=${req.params.id} to ${name}`);
    db.challenger.setDisplayName(req.params.id, name, (error) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            getChallengerInfo(req, res, correlationId);
        }
    });
});

api.get('/api/v2/challenger/:id/bingoboard', (req, res) => {
    const correlationId = trackRequest('GET /api/v2/challenger/:id/bingoboard');
    logger.api.info(`Returning bingo board for loginId=${req.params.id}`);
    db.challenger.getBingoBoard(req.params.id, (error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            sendJsonResponse(httpStatus.ok, result, res, correlationId);
        }
    });
});

api.post('/api/v2/challenger/:id/enqueue/:leader', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/challenger/:id/enqueue/:leader');
    if (eventIsOver(res, correlationId)) {
        return;
    }

    /*
    if (!config.supportsQueueState) {
        handleDbError(challengerErrors, resultCode.queueStateNotSupported, res);
        return;
    }
    */

    if (!validateLeaderId(req.params.leader)) {
        logger.api.warn(`loginId=${req.params.id} attempted to join queue for invalid leaderId=${req.params.leader}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'That leader ID is invalid.' }, res, correlationId);
        return;
    }

    const difficulty = Number(req.body.battleDifficulty);
    const format = Number(req.body.battleFormat);
    if (!difficulty || !format) {
        // Missing or invalid parameter
        logger.api.warn(`loginId=${req.params.id} attempted to join queue with invalid params; battleDifficulty=${req.body.battleDifficulty}, battleFormat=${req.body.battleFormat}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'That battle difficulty and/or battle format is invalid.' }, res, correlationId);
        return;
    }

    logger.api.info(`loginId=${req.params.id} joining leaderId=${req.params.leader}'s queue with battleDifficulty=${difficulty} and battleFormat=${format}`);
    db.queue.enqueue(req.params.leader, req.params.id, difficulty, format, (error) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            notifyRefreshData(req.params.leader);
            getChallengerInfo(req, res, correlationId);
        }
    });
});

api.delete('/api/v2/challenger/:id/dequeue/:leader', (req, res) => {
    const correlationId = trackRequest('DELETE /api/v2/challenger/:id/dequeue/:leader');
    if (!validateLeaderId(req.params.leader)) {
        logger.api.warn(`loginId=${req.params.id} attempted to leave queue for invalid leaderId=${req.params.leader}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'That leader ID is invalid.' }, res, correlationId);
        return;
    }

    logger.api.info(`loginId=${req.params.id} leaving leaderId=${req.params.leader}'s queue`);
    db.queue.dequeue(req.params.leader, req.params.id, (error) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            notifyRefreshData(req.params.leader);
            db.queue.getIdsInQueue(req.params.leader, (error, result) => {
                if (!error) {
                    // Don't bother handling errors here; this is just for websocket updates and not a critical path
                    for (const id of result) {
                        notifyRefreshData(id);
                    }
                }
            });

            getChallengerInfo(req, res, correlationId);
        }
    });
});

api.post('/api/v2/challenger/:id/hold/:leader', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/challenger/:id/hold/:leader');
    if (!validateLeaderId(req.params.leader)) {
        logger.api.warn(`loginId=${req.params.id} attempted to go on hold for invalid leaderId=${req.params.leader}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'That leader ID is invalid.' }, res, correlationId);
        return;
    }

    logger.api.info(`loginId=${req.params.id} placing themselves on hold in leaderId=${req.params.leader}'s queue`);
    db.queue.hold(req.params.leader, req.params.id, (error) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            notifyRefreshData(req.params.leader);
            db.queue.getIdsInQueue(req.params.leader, (error, result) => {
                if (!error) {
                    // Don't bother handling errors here; this is just for websocket updates and not a critical path
                    for (const id of result) {
                        notifyRefreshData(id);
                    }
                }
            });

            getChallengerInfo(req, res, correlationId);
        }
    });
});

/***************
 * Leader APIs *
 ***************/
api.use('/api/v2/leader/:id', (req, res, next) => {
    logger.api.info(`Validating token for leader endpoint request for loginId=${req.params.id}`);
    const session = validateSession(req.get(AUTH_HEADER), req.params.id, requestType.leader);
    if (!session) {
        res.status(httpStatus.unauthorized).json({ error: 'The \'Authorization\' header in your request was missing, invalid, or malformed.' });
        return;
    }

    req.leaderId = session.leaderId;
    next();
});

api.get('/api/v2/leader/:id', (req, res) => {
    const correlationId = trackRequest('GET /api/v2/leader/:id');
    getLeaderInfo(req, res, false, correlationId);
});

api.put('/api/v2/leader/:id', (req, res) => {
    const correlationId = trackRequest('PUT /api/v2/leader/:id');
    let code = req.body.battleCode;
    if (code) {
        if (!/^[0-9]{8}$/.test(code)) {
            // Not an 8-digit number, reject it
            sendJsonResponse(httpStatus.badRequest, { error: 'The \'battleCode\' property must be an 8-digit number with no spaces or other characters.' }, res, correlationId);
            return;
        }

        // Insert a space between the first and last four digits before saving
        code = `${code.substr(0, BATTLE_CODE_SECTION_LENGTH)} ${code.substr(BATTLE_CODE_SECTION_LENGTH)}`;
        logger.api.info(`Setting battle code for loginId=${req.params.id}, leaderId=${req.leaderId} to ${code}`);
    } else {
        logger.api.info(`Clearing battle code for loginId=${req.params.id}, leaderId=${req.leaderId}`);
    }

    db.leader.setBattleCode(req.leaderId, code, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res, correlationId);
        } else {
            getLeaderInfo(req, res, true, correlationId);
        }
    });
});

api.post('/api/v2/leader/:id/openqueue', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/leader/:id/openqueue');
    if (eventIsOver(res, correlationId)) {
        return;
    }

    if (!config.supportsQueueState) {
        handleDbError(leaderErrors, resultCode.queueStateNotSupported, res, correlationId);
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} opening queue`);
    const duoMode = !!req.body.duoMode;
    db.leader.updateQueueStatus(req.leaderId, true, duoMode, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res, correlationId);
        } else {
            sendHttpBotRequest('/queueopened', { leaderId: req.leaderId });
            getLeaderInfo(req, res, false, correlationId);
        }
    });
});

api.post('/api/v2/leader/:id/closequeue', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/leader/:id/closequeue');
    if (!config.supportsQueueState) {
        handleDbError(leaderErrors, resultCode.queueStateNotSupported, res, correlationId);
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} closing queue`);
    db.leader.updateQueueStatus(req.leaderId, false, false, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res, correlationId);
        } else {
            sendHttpBotRequest('/queueclosed', { leaderId: req.leaderId });
            getLeaderInfo(req, res, false, correlationId);
        }
    });
});

api.post('/api/v2/leader/:id/enqueue/:challenger', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/leader/:id/enqueue/:challenger');
    if (eventIsOver(res, correlationId)) {
        return;
    }

    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to enqueue invalid challengerId=${req.params.challenger}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'That challenger ID is invalid.' }, res, correlationId);
        return;
    }

    const difficulty = Number(req.body.battleDifficulty);
    const format = Number(req.body.battleFormat);
    if (!difficulty || !format) {
        // Missing or invalid parameter
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to enqueue a challenger with invalid params; battleDifficulty=${req.body.battleDifficulty}, battleFormat=${req.body.battleFormat}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'That battle difficulty and/or battle format is invalid.' }, res, correlationId);
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} adding challengerId=${req.params.challenger} to queue with battleDifficulty=${difficulty} and battleFormat=${format}`);
    db.queue.enqueue(req.leaderId, req.params.challenger, difficulty, format, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res, correlationId);
        } else {
            notifyRefreshData(req.params.challenger);
            getLeaderInfo(req, res, false, correlationId);
        }
    });
});

api.delete('/api/v2/leader/:id/dequeue/:challenger', (req, res) => {
    const correlationId = trackRequest('DELETE /api/v2/leader/:id/dequeue/:challenger');
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to dequeue invalid challengerId=${req.params.challenger}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'That challenger ID is invalid.' }, res, correlationId);
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} removing challengerId=${req.params.challenger} from queue`);
    db.queue.dequeue(req.leaderId, req.params.challenger, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res, correlationId);
        } else {
            notifyRefreshData(req.params.challenger);
            getLeaderInfo(req, res, true, correlationId);
        }
    });
});

api.post('/api/v2/leader/:id/report/:challenger', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/leader/:id/report/:challenger');
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to report a match result for invalid challengerId=${req.params.challenger}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'That challenger ID is invalid.' }, res, correlationId);
        return;
    }

    reportMatchResult([req.params.challenger], req, res, correlationId);
});

api.post('/api/v2/leader/:id/report/:challenger/:otherChallenger', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/leader/:id/report/:challenger/:otherChallenger');
    if (!validateChallengerId(req.params.challenger) || !validateChallengerId(req.params.otherChallenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to report a match result for invalid challengerIds=${req.params.challenger}, ${req.params.otherChallenger}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'One or both challenger IDs are invalid.' }, res, correlationId);
        return;
    }

    reportMatchResult([req.params.challenger, req.params.otherChallenger], req, res, correlationId);
});

api.post('/api/v2/leader/:id/hold/:challenger', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/:id/hold/:challenger');
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to hold invalid challengerId=${req.params.challenger}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'That challenger ID is invalid.' }, res, correlationId);
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} placing challengerId=${req.params.challenger} on hold`);
    db.queue.hold(req.leaderId, req.params.challenger, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res, correlationId);
        } else {
            notifyRefreshData(req.params.challenger);
            getLeaderInfo(req, res, true, correlationId);
        }
    });
});

api.post('/api/v2/leader/:id/unhold/:challenger', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/leader/:id/unhold/:challenger');
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to unhold invalid challengerId=${req.params.challenger}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'That challenger ID is invalid.' }, res, correlationId);
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} returning challengerId=${req.params.challenger} from hold`);
    const front = !!req.body.placeAtFront;
    db.queue.unhold(req.leaderId, req.params.challenger, front, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res, correlationId);
        } else {
            if (!front) {
                // Only poke the challenger if it's to the back of the queue, since that doesn't impact queue order
                notifyRefreshData(req.params.challenger);
            }
            getLeaderInfo(req, res, front, correlationId);
        }
    });
});

api.post('/api/v2/leader/:id/live', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/leader/:id/live');
    if (eventIsOver(res, correlationId)) {
        return;
    }

    // Assume the leader should be able to hit this and pass it along; we validate at the bot level anyway
    sendHttpBotRequest('/live', { leaderId: req.leaderId });
    getLeaderInfo(req, res, false, correlationId);
});

api.get('/api/v2/leader/:id/allchallengers', (req, res) => {
    const correlationId = trackRequest('GET /api/v2/leader/:id/allchallengers');
    const eventString = req.get(PPL_EVENT_HEADER);
    const eventMask = pplEventToBitmask(eventString);
    if (!eventMask) {
        logger.api.warn(`Get all challengers attempt with unexpected PPL event header value=${eventString}`);
        sendJsonResponse(httpStatus.badRequest, { error: 'The \'PPL-Event\' header in your request was either missing or invalid.' }, res, correlationId);
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} fetching all challengers`);
    db.leader.getAllChallengers(eventMask, (error, result) => {
        if (error) {
            handleDbError(leaderErrors, error, res, correlationId);
        } else {
            sendJsonResponse(httpStatus.ok, result, res, correlationId);
        }
    });
});

/*************
 * Push APIs *
 *************/
api.use('/api/v2/push/:id', (req, res, next) => {
    logger.api.info(`Validating token for push endpoint request for loginId=${req.params.id}`);
    const session = validateSession(req.get(AUTH_HEADER), req.params.id, requestType.universal);
    if (!session) {
        res.status(httpStatus.unauthorized).json({ error: 'The \'Authorization\' header in your request was missing, invalid, or malformed.' });
        return;
    }

    if (!req.body.pushToken) {
        logger.api.warn(`loginId=${req.params.id} attempted to enable push without a push token`);
        res.status(httpStatus.badRequest).json({ error: 'The JSON body for requests to this endpoint must include a \'pushToken\' property.' });
        return;
    }

    req.session = session;
    next();
});

// TODO - UNTESTED
api.post('/api/v2/push/:id/enable', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/push/:id/enable');
    logger.api.info(`loginId=${req.params.id} enabling push for platformType=${req.session.platform}`);
    db.push.enable(req.params.id, req.session.platform, req.body.pushToken, (error) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            req.session.pushToken = req.body.pushToken;
            sendJsonResponse(httpStatus.ok, {}, res, correlationId); // TODO - Maybe add something to the response payload?
        }
    });
});

// TODO - UNTESTED
api.post('/api/v2/push/:id/disable', (req, res) => {
    const correlationId = trackRequest('POST /api/v2/push/:id/disable');
    logger.api.info(`loginId=${req.params.id} disabling push for platformType=${req.session.platform}`);
    db.push.disable(req.params.id, req.session.platform, req.body.pushToken, (error) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            req.session.pushToken = null;
            sendJsonResponse(httpStatus.ok, {}, res, correlationId); // TODO - Maybe add something to the response payload?
        }
    });
});

/************************
 * Unauthenticated APIs *
 ************************/
api.get('/api/v2/metrics', (req, res) => {
    logger.api.info('Returning leader metrics');
    db.leader.metrics((error, result) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            res.json(result);
        }
    });
});

api.get('/api/v2/appsettings', (req, res) => {
    const correlationId = trackRequest('GET /api/v2/appsettings');
    logger.api.info('Returning app settings');
    res.set('Cache-Control', 'public, max-age=600');
    sendJsonResponse(httpStatus.ok, {
        showTrainerCard: new Date() > new Date(config.trainerCardShowDate),
        eventIsOver: eventIsOver(),
        eventSupportsQueueState: config.supportsQueueState,
        leadersToDefeat: config.requiredBadgesForElites, // DEPRECATED
        elitesToDefeat: config.requiredEmblemsForChamp, // DEPRECATED
        leagueFormat: {
            badgesForElites: config.requiredBadgesForElites,
            emblemsForChamp: config.requiredEmblemsForChamp,
            badgesForChamp: config.requiredBadgesForChamp,
            emblemWeight: config.emblemWeight
        },
        meetupTimes: config.meetupTimes,
        howToChallenge: config.howToChallenge,
        rules: config.rules,
        prizePools: config.prizePools,
        schedule: config.schedule,
        bingoBoard: config.bingoBoard,
        map: config.map
    }, res, correlationId);
});

api.get('/api/v2/openqueues', (req, res) => {
    const correlationId = trackRequest('GET /api/v2/openqueues');
    logger.api.info('Returning a list of open leader queues');
    db.getOpenQueues((error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res, correlationId);
        } else {
            sendJsonResponse(httpStatus.ok, result, res, correlationId);
        }
    });
});

api.get('/api/v2/badges/:id', (req, res) => {
    logger.api.info(`Returning simple badge list for loginId=${req.params.id}`);
    db.getBadges(req.params.id, (error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            res.json(result);
        }
    });
});

/****************
 * Logging APIs *
 ****************/
api.get('/logview', (req, res) => {
    generateLogviewResponse(res, 0);
});

api.get('/logview/:daysago', (req, res) => {
    const daysAgo = Number(req.params.daysago);
    generateLogviewResponse(res, daysAgo || 0);
});

api.get('/statsview', (req, res) => {
    logger.api.debug('Rendering stats page');
    db.getStats((error, result) => {
        if (error) {
            res.render('nostats', {
                errorCode: error
            });
            return;
        }

        const data = {
            matches: {
                inQueue: result.filter(match => match.status === matchStatus.inQueue).length,
                onHold: result.filter(match => match.status === matchStatus.onHold).length,
                loss: result.filter(match => match.status === matchStatus.loss).length,
                win: result.filter(match => match.status === matchStatus.win).length,
                ash: result.filter(match => match.status === matchStatus.ash).length,
                gary: result.filter(match => match.status === matchStatus.gary).length
            },
            challengers: [],
            leaderBadges: [],
            leaderMatches: []
        };

        const challengers = [...new Set(result.map(result => result.challengerName))];
        const leaders = [...new Set(result.map(result => result.leaderName))];

        for (const challengerName of challengers) {
            const badges = result.filter(match => match.challengerName === challengerName && (match.status === matchStatus.win || match.status === matchStatus.ash));
            if (badges.length > 0) {
                const classes = [];
                if (badges.find(match => match.difficulty === leaderType.champion)) {
                    classes.push('hof');
                }

                data.challengers.push({
                    name: challengerName,
                    badges: badges.length,
                    eliteEligible: config.requiredBadgesForElites > 0 && badges.length >= config.requiredBadgesForElites,
                    classes: classes
                });
            }
        }

        for (const leaderName of leaders) {
            const classes = [];
            if (result.find(match => match.leaderName === leaderName && match.difficulty === leaderType.elite)) {
                classes.push('elite');
            }

            if (result.find(match => match.leaderName === leaderName && match.difficulty === leaderType.champion)) {
                classes.push('champion');
            }

            data.leaderBadges.push({
                name: leaderName,
                awarded: result.filter(match => match.leaderName === leaderName && (match.status === matchStatus.win || match.status === matchStatus.ash)).length,
                classes: classes
            });

            data.leaderMatches.push({
                name: leaderName,
                matches: result.filter(match => match.leaderName === leaderName && !(match.status === matchStatus.inQueue || match.status === matchStatus.onHold)).length,
                classes: classes
            });
        }

        data.challengers.sort((a, b) => b.badges - a.badges);
        data.leaderBadges.sort((a, b) => b.awarded - a.awarded);
        data.leaderMatches.sort((a, b) => b.matches - a.matches);

        res.render('stats', data);
    });
});

api.post('/api/v2/loginfo', (req, res) => {
    clientLog(req, res, logger.client.info);
});

api.post('/api/v2/logwarning', (req, res) => {
    clientLog(req, res, logger.client.warn);
});

api.post('/api/v2/logerror', (req, res) => {
    clientLog(req, res, logger.client.error);
});

api.get('/apimetrics', (req, res) => {
    res.json(getMetrics());
});

initCaches();

setInterval(pruneSessionCache, PRUNE_INTERVAL_MILLIS);

export default api;
