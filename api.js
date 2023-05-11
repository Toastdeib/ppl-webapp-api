import bodyParser from 'body-parser';
import config from './config.js';
import cors from 'cors';
import db from './db.js';
import express from 'express';
import fs from 'fs';
import http from 'http';
import logger from './logger.js';
import sanitize from 'sanitize-html';
import { challengerErrors, leaderErrors } from './errors.js';
import { httpStatus, pplEvent } from './constants.js';

const api = express();
api.use(cors({ origin: config.corsOrigin }));
api.use(bodyParser.json());
api.set('view engine', 'pug');

// eslint-disable-next-line no-magic-numbers
const ONE_DAY_MILLIS = 24 * 60 * 60 * 1000;
// eslint-disable-next-line no-magic-numbers
const SESSION_EXPIRATION_MILLIS = 4 * 24 * 60 * 60 * 1000; // 4 days in ms
// eslint-disable-next-line no-magic-numbers
const PRUNE_INTERVAL_MILLIS = 24 * 60 * 60 * 1000; // 1 day in ms
const SESSION_TOKEN_HEX_LENGTH = 16;
const CACHE_FILE = 'cache.json';
let sessionCache;
let idCache;

const AUTH_HEADER = 'Authorization';
const PPL_EVENT_HEADER = 'PPL-Event';

/******************
 * Util functions *
 ******************/
function handleDbError(errorList, code, res) {
    const error = errorList[code];
    if (!error) {
        logger.api.error(`No error data found for code=${code}`);
        res.status(httpStatus.badRequest).json({ error: 'An unexpected error occurred, please try again.', code: code });
        return;
    }

    logger.api.info(error.logMessage);
    res.status(error.statusCode).json({ error: error.userMessage, code: code });
}

function getChallengerInfo(req, res) {
    logger.api.info(`Returning challenger info for loginId=${req.params.id}`);
    db.challenger.getInfo(req.params.id, (error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            res.json({
                id: req.params.id,
                ...result
            });
        }
    });
}

function getLeaderInfo(req, res) {
    logger.api.info(`Returning leader info for loginId=${req.params.id}, leaderId=${req.leaderId}`);
    db.leader.getInfo(req.leaderId, (error, result) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            res.json({
                loginId: req.params.id,
                leaderId: req.leaderId,
                ...result
            });
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

function createSession(id, isLeader, leaderId) {
    const token = db.generateHex(SESSION_TOKEN_HEX_LENGTH);
    sessionCache[token] = {
        id: id,
        lastUsed: new Date().getTime(),
        isLeader: isLeader,
        leaderId: leaderId
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

function validateSession(token, id, leaderRequest) {
    const parts = token.split(' ');
    if (parts[0] !== 'Bearer') {
        // Malformed token header
        return false;
    }

    const session = sessionCache[parts[1]];
    if (!session) {
        // No session found for the provided access token
        return false;
    }

    if (session.id !== id) {
        // Incorrect ID in the request for the provided token
        logger.api.warn(`loginId=${id} attempted to make an API request with a token associated with loginId=${session.id}`);
        return false;
    }

    if (session.isLeader !== leaderRequest) {
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

/***********************
 * Authentication APIs *
 ***********************/
api.post('/register', (req, res) => {
    const credentials = req.get(AUTH_HEADER);
    const eventString = req.get(PPL_EVENT_HEADER);

    if (!credentials) {
        logger.api.warn('Registration attempt with missing auth header');
        res.status(httpStatus.badRequest).json({ error: 'Registration requests must include an \'Authorization\' header.' });
        return;
    }

    const parts = decodeCredentials(credentials);
    if (!parts) {
        logger.api.warn('Registration attempt with malformed auth header');
        res.status(httpStatus.badRequest).json({ error: 'The \'Authorization\' header in your request was malformed.' });
        return;
    }

    db.auth.register(parts[0], parts[1], eventString, (error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            logger.api.info(`Registered loginId=${result.id} with username=${parts[0]}`);
            const token = createSession(result.id, result.isLeader, result.leaderId);
            idCache.challengers.push(result.id);
            if (result.pplEvent === pplEvent.online) {
                sendHttpBotRequest('/challengerregistered', {});
            }

            res.json({
                id: result.id,
                loginId: result.id,
                leaderId: result.leaderId,
                isLeader: result.isLeader,
                token: token
            });
        }
    });
});

api.post('/login', (req, res) => {
    const credentials = req.get(AUTH_HEADER);
    const eventString = req.get(PPL_EVENT_HEADER);

    if (!credentials) {
        logger.api.warn('Login attempt with missing auth header');
        res.status(httpStatus.badRequest).json({ error: 'Login requests must include an \'Authorization\' header.' });
        return;
    }

    const parts = decodeCredentials(credentials);
    if (!parts) {
        logger.api.warn('Login attempt with malformed auth header');
        res.status(httpStatus.badRequest).json({ error: 'The \'Authorization\' header in your request was malformed.' });
        return;
    }

    db.auth.login(parts[0], parts[1], eventString, (error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            logger.api.info(`Logged in loginId=${result.id} with username=${parts[0]}`);
            const token = createSession(result.id, result.isLeader, result.leaderId);
            if (result.newEvent === pplEvent.online) {
                sendHttpBotRequest('/challengerregistered', {});
            }

            res.json({
                id: result.id,
                loginId: result.id,
                leaderId: result.leaderId,
                isLeader: result.isLeader,
                token: token
            });
        }
    });
});

api.post('/logout/:id', (req, res) => {
    logger.api.info(`Logged out loginId=${req.params.id}`);
    const token = req.get(AUTH_HEADER);
    if (token) {
        clearSession(token, req.params.id);
    }

    res.json({});
});

api.get('/allleaderdata', (req, res) => {
    logger.api.info('Fetching all leader data');
    db.getAllLeaderData((error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            res.json(result);
        }
    });
});

/*******************
 * Challenger APIs *
 *******************/
api.use('/challenger/:id', (req, res, next) => {
    const token = req.get(AUTH_HEADER);
    if (!token) {
        logger.api.warn(`Challenger endpoint request for loginId=${req.params.id} with missing auth header`);
        res.status(httpStatus.unauthorized).json({});
        return;
    }

    if (!validateSession(token, req.params.id, false)) {
        logger.api.warn(`Challenger endpoint request for loginId=${req.params.id} with invalid auth header`);
        res.status(httpStatus.unauthorized).json({});
        return;
    }

    next();
});

api.get('/challenger/:id', getChallengerInfo);

api.post('/challenger/:id', (req, res) => {
    const name = req.body.displayName;
    if (!name) {
        res.status(httpStatus.badRequest).json({ error: 'The JSON body for requests to this endpoint must include a \'displayName\' property.' });
        return;
    }

    logger.api.info(`Setting display name for loginId=${req.params.id} to ${name}`);
    db.challenger.setDisplayName(req.params.id, name, (error) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            getChallengerInfo(req, res);
        }
    });
});

api.get('/challenger/:id/bingoboard', (req, res) => {
    logger.api.info(`Returning bingo board for loginId=${req.params.id}`);
    db.challenger.getBingoBoard(req.params.id, (error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            res.json(result);
        }
    });
});

api.post('/challenger/:id/enqueue/:leader', (req, res) => {
    if (!validateLeaderId(req.params.leader)) {
        logger.api.warn(`loginId=${req.params.id} attempted to join queue for invalid leaderId=${req.params.leader}`);
        res.status(httpStatus.badRequest).json({ error: 'That leader ID is invalid.' });
        return;
    }

    const difficulty = Number(req.body.battleDifficulty);
    if (!difficulty) {
        // Missing or invalid parameter
        logger.api.warn(`loginId=${req.params.id} attempted to join queue with invalid battleDifficulty=${req.body.battleDifficulty}`);
        res.status(httpStatus.badRequest).json({ error: 'That battle difficulty is invalid.' });
        return;
    }

    logger.api.info(`loginId=${req.params.id} joining leaderId=${req.params.leader}'s queue`);
    db.queue.enqueue(req.params.leader, req.params.id, difficulty, (error) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            getChallengerInfo(req, res);
        }
    });
});

api.post('/challenger/:id/dequeue/:leader', (req, res) => {
    if (!validateLeaderId(req.params.leader)) {
        logger.api.warn(`loginId=${req.params.id} attempted to leave queue for invalid leaderId=${req.params.leader}`);
        res.status(httpStatus.badRequest).json({ error: 'That leader ID is invalid.' });
        return;
    }

    logger.api.info(`loginId=${req.params.id} leaving leaderId=${req.params.leader}'s queue`);
    db.queue.dequeue(req.params.leader, req.params.id, (error) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            getChallengerInfo(req, res);
        }
    });
});

api.post('/challenger/:id/hold/:leader', (req, res) => {
    if (!validateLeaderId(req.params.leader)) {
        logger.api.warn(`loginId=${req.params.id} attempted to go on hold for invalid leaderId=${req.params.leader}`);
        res.status(httpStatus.badRequest).json({ error: 'That leader ID is invalid.' });
        return;
    }

    logger.api.info(`loginId=${req.params.id} placing themselves on hold in leaderId=${req.params.leader}'s queue`);
    db.queue.hold(req.params.leader, req.params.id, (error) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            getChallengerInfo(req, res);
        }
    });
});

/***************
 * Leader APIs *
 ***************/
api.use('/leader/:id', (req, res, next) => {
    const token = req.get(AUTH_HEADER);
    if (!token) {
        logger.api.error(`Leader endpoint request for loginId=${req.params.id} with missing auth header`);
        res.status(httpStatus.unauthorized).json({});
        return;
    }

    const session = validateSession(token, req.params.id, true);
    if (!session) {
        logger.api.error(`Leader endpoint request for loginId=${req.params.id} with invalid auth header`);
        res.status(httpStatus.unauthorized).json({});
        return;
    }

    req.leaderId = session.leaderId;
    next();
});

api.get('/leader/:id', getLeaderInfo);

api.post('/leader/:id/openqueue', (req, res) => {
    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} opening queue`);
    db.leader.updateQueueStatus(req.leaderId, true, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            sendHttpBotRequest('/queueopened', { leaderId: req.leaderId });
            getLeaderInfo(req, res);
        }
    });
});

api.post('/leader/:id/closequeue', (req, res) => {
    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} closing queue`);
    db.leader.updateQueueStatus(req.leaderId, false, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            sendHttpBotRequest('/queueclosed', { leaderId: req.leaderId });
            getLeaderInfo(req, res);
        }
    });
});

api.post('/leader/:id/enqueue/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to enqueue invalid challengerId=${req.params.challenger}`);
        res.status(httpStatus.badRequest).json({ error: 'That challenger ID is invalid.' });
        return;
    }

    const difficulty = Number(req.body.battleDifficulty);
    if (!difficulty) {
        // Missing or invalid parameter
        logger.api.warn(`loginId=${req.params.id} attempted to join queue with invalid battleDifficulty=${req.body.battleDifficulty}`);
        res.status(httpStatus.badRequest).json({ error: 'That battle difficulty is invalid.' });
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} adding challengerId=${req.params.challenger} to queue`);
    db.queue.enqueue(req.leaderId, req.params.challenger, difficulty, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

api.post('/leader/:id/dequeue/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to dequeue invalid challengerId=${req.params.challenger}`);
        res.status(httpStatus.badRequest).json({ error: 'That challenger ID is invalid.' });
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} removing challengerId=${req.params.challenger} from queue`);
    db.queue.dequeue(req.leaderId, req.params.challenger, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

api.post('/leader/:id/report/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to report a match result for invalid challengerId=${req.params.challenger}`);
        res.status(httpStatus.badRequest).json({ error: 'That challenger ID is invalid.' });
        return;
    }

    const challengerWin = !!req.body.challengerWin;
    const badgeAwarded = !!req.body.badgeAwarded;
    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} reporting match result ${challengerWin}, badge awarded ${badgeAwarded} for challengerId=${req.params.challenger}`);
    db.leader.reportResult(req.leaderId, req.params.challenger, challengerWin, badgeAwarded, (error, result) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            if (result.hof) {
                sendHttpBotRequest('/hofentered', { challengerId: req.params.challenger });
            } else if (badgeAwarded) {
                sendHttpBotRequest('/badgeearned', { challengerId: req.params.challenger, leaderId: req.leaderId });
            }

            getLeaderInfo(req, res);
        }
    });
});

api.post('/leader/:id/hold/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to hold invalid challengerId=${req.params.challenger}`);
        res.status(httpStatus.badRequest).json({ error: 'That challenger ID is invalid.' });
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} placing challengerId=${req.params.challenger} on hold`);
    db.queue.hold(req.leaderId, req.params.challenger, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

api.post('/leader/:id/unhold/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to unhold invalid challengerId=${req.params.challenger}`);
        res.status(httpStatus.badRequest).json({ error: 'That challenger ID is invalid.' });
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} returning challengerId=${req.params.challenger} from hold`);
    db.queue.unhold(req.leaderId, req.params.challenger, !!req.body.placeAtFront, (error) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

api.post('/leader/:id/live', (req, res) => {
    // Assume the leader should be able to hit this and pass it along; we validate at the bot level anyway
    sendHttpBotRequest('/live', { leaderId: req.leaderId });
    getLeaderInfo(req, res);
});

api.get('/leader/:id/allchallengers', (req, res) => {
    const eventString = req.get(PPL_EVENT_HEADER);
    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} fetching all challengers`);
    db.leader.getAllChallengers(eventString, (error, result) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            res.json(result);
        }
    });
});

api.get('/metrics', (req, res) => {
    logger.api.info('Returning leader metrics');
    db.leader.metrics((error, result) => {
        if (error) {
            handleDbError(leaderErrors, error, res);
        } else {
            res.json(result);
        }
    });
});

api.get('/appsettings', (req, res) => {
    logger.api.info('Returning app settings');
    res.json({ showTrainerCard: new Date() > new Date(config.trainerCardShowDate) });
});

api.get('/openqueues', (req, res) => {
    logger.api.info('Returning a list of open leader queues');
    db.getOpenQueues((error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            res.json(result);
        }
    });
});

api.get('/badges/:id', (req, res) => {
    logger.api.info(`Returning simple badge list for loginId=${req.params.id}`);
    db.getBadges(req.params.id, (error, result) => {
        if (error) {
            handleDbError(challengerErrors, error, res);
        } else {
            res.json(result);
        }
    });
});

api.get('/logview', (req, res) => {
    generateLogviewResponse(res, 0);
});

api.get('/logview/:daysago', (req, res) => {
    const daysAgo = Number(req.params.daysago);
    generateLogviewResponse(res, daysAgo || 0);
});

api.post('/loginfo', (req, res) => {
    clientLog(req, res, logger.client.info);
});

api.post('/logwarning', (req, res) => {
    clientLog(req, res, logger.client.warn);
});

api.post('/logerror', (req, res) => {
    clientLog(req, res, logger.client.error);
});

initCaches();

setInterval(pruneSessionCache, PRUNE_INTERVAL_MILLIS);

export default api;
