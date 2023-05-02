const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const logger = require('./logger.js');
const db = require('./db.js');
const config = require('./config.js');
const constants = require('./constants.js');

app.use(cors({ origin: config.corsOrigin }));
app.use(bodyParser.json());
app.set('view engine', 'pug');

const ONE_DAY_MILLIS = 24 * 60 * 60 * 1000;
const SESSION_EXPIRATION_MILLIS = 4 * 24 * 60 * 60 * 1000; // 4 days in ms
const PRUNE_INTERVAL_MILLIS = 24 * 60 * 60 * 1000; // 1 day in ms
const CACHE_BACKUP_INTERVAL_MILLIS = 5 * 60 * 1000; // 5 minutes in ms
const CACHE_FILE = 'cache.json';
let sessionCache;
let idCache;

const AUTH_HEADER = 'Authorization';
const PPL_EVENT_HEADER = 'PPL-Event';

/******************
 * Util functions *
 ******************/
function handleDbError(error, res) {
    switch (error) {
        case constants.resultCode.notFound:
            logger.api.error('ID not found');
            res.status(404).json({ error: 'One or more IDs in the request path couldn\'t be found.', code: error });
            break;
        case constants.resultCode.alreadyInQueue:
            logger.api.error('Challenger already in queue');
            res.status(400).json({ error: 'A challenger can\'t be in the same queue twice.', code: error });
            break;
        case constants.resultCode.alreadyWon:
            logger.api.error('Challenger has already won');
            res.status(400).json({ error: 'Official rematches are only allowed when a badge hasn\'t been awarded yet.', code: error });
            break;
        case constants.resultCode.queueIsFull:
            logger.api.error('Leader queue is full');
            res.status(400).json({ error: 'That queue is currently full, please try again later.', code: error });
            break;
        case constants.resultCode.tooManyChallenges:
            logger.api.error('Challenger is in too many queues');
            res.status(400).json({ error: 'Challengers can\'t be in more than three queues at a time.', code: error });
            break;
        case constants.resultCode.notInQueue:
            logger.api.error('Challenger is not in queue');
            res.status(400).json({ error: 'That challenger isn\'t in your queue.', code: error });
            break;
        case constants.resultCode.usernameTaken:
            logger.api.error('Username is already taken');
            res.status(400).json({ error: 'That username is already in use.', code: error });
            break;
        case constants.resultCode.registrationFailure:
            logger.api.error('Unknown error during registration');
            res.status(500).json({ error: 'An unknown error occurred during registration.', code: error });
            break;
        case constants.resultCode.badCredentials:
            logger.api.error('Invalid login credentials');
            res.status(401).json({ error: 'Invalid login credentials, please try again.', code: error });
            break;
        case constants.resultCode.invalidToken:
            logger.api.error('Invalid access token');
            res.status(401).json({ error: 'Your access token is invalid, please try logging out and back in.', code: error });
            break;
        case constants.resultCode.queueIsClosed:
            logger.api.error('Leader queue is closed');
            res.status(400).json({ error: 'That leader\'s queue is currently closed.', code: error });
            break;
        case constants.resultCode.notEnoughBadges:
            logger.api.error('Not enough badges to join the queue');
            res.status(400).json({ error: 'Challengers need at least eight badges to battle elites and at least four emblems to battle the champ.', code: error });
            break;
        case constants.resultCode.unsupportedDifficulty:
            logger.api.error('Unsupported battle difficulty');
            res.status(400).json({ error: 'That battle difficulty isn\'t supported.', code: error });
            break;
        default:
            logger.api.error('Unexpected database error');
            res.status(500).json({ error: 'An unexpected database error occurred, please try again.', code: error });
            break;
    }
}

function getChallengerInfo(req, res) {
    logger.api.info(`Returning challenger info for loginId=${req.params.id}`);
    db.challenger.getInfo(req.params.id, (error, result) => {
        if (error) {
            handleDbError(error, res);
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
            handleDbError(error, res);
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

    return Buffer.from(parts[1], 'base64').toString('utf8').split(':');
}

function createSession(id, isLeader, leaderId) {
    const token = db.generateHex(16);
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
    for (id of Object.keys(sessionCache)) {
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
    const logFileCount = fs.readdirSync('logs').reduce((acc, filename) => { return acc + (filename.startsWith('api-combined') ? 1 : 0) }, 0);

    try {
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

function sendHttpBotRequest(path, params) {
    const postData = JSON.stringify(params);
    const options = {
        hostname: 'localhost',
        port: 9001,
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    logger.api.info(`Sending HTTP request to the bot webserver with path=${path} and postData=${postData}`);
    const req = http.request(options, (res) => {
        if (res.statusCode !== 200) {
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
app.post('/register', (req, res) => {
    const credentials = req.get(AUTH_HEADER);
    const pplEvent = req.get(PPL_EVENT_HEADER);

    if (!credentials) {
        logger.api.warn('Registration attempt with missing auth header');
        res.status(400).json({ error: 'Missing required Authorization header' });
        return;
    }

    const parts = decodeCredentials(credentials);
    if (!parts) {
        logger.api.warn('Registration attempt with malformed auth header');
        res.status(400).json({ error: 'Authorization header was malformed' });
        return;
    }

    db.auth.register(parts[0], parts[1], pplEvent, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            logger.api.info(`Registered loginId=${result.id} with username=${parts[0]}`);
            const token = createSession(result.id, result.isLeader, result.leaderId);
            idCache.challengers.push(result.id);
            if (result.pplEvent === constants.pplEvent.online) {
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

app.post('/login', (req, res) => {
    const credentials = req.get(AUTH_HEADER);
    const pplEvent = req.get(PPL_EVENT_HEADER);

    if (!credentials) {
        logger.api.warn('Login attempt with missing auth header');
        res.status(400).json({ error: 'Missing required Authorization header' });
        return;
    }

    const parts = decodeCredentials(credentials);
    if (!parts) {
        logger.api.warn('Login attempt with malformed auth header');
        res.status(400).json({ error: 'Authorization header was malformed' });
        return;
    }

    db.auth.login(parts[0], parts[1], pplEvent, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            logger.api.info(`Logged in loginId=${result.id} with username=${parts[0]}`);
            const token = createSession(result.id, result.isLeader, result.leaderId);
            if (result.newEvent === constants.pplEvent.online) {
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

app.post('/logout/:id', (req, res) => {
    logger.api.info(`Logged out loginId=${req.params.id}`);
    const token = req.get(AUTH_HEADER);
    if (token) {
        clearSession(token, req.params.id);
    }

    res.status(200).json({});
});

app.get('/allleaderdata', (req, res) => {
    logger.api.info('Fetching all leader data');
    db.getAllLeaderData((error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json(result);
        }
    });
});

/*******************
 * Challenger APIs *
 *******************/
app.use('/challenger/:id', (req, res, next) => {
    const token = req.get(AUTH_HEADER);
    if (!token) {
        logger.api.warn(`Challenger endpoint request for loginId=${req.params.id} with missing auth header`);
        res.status(403).json({});
        return;
    }

    if (!validateSession(token, req.params.id, false)) {
        logger.api.warn(`Challenger endpoint request for loginId=${req.params.id} with invalid auth header`);
        res.status(403).json({});
        return;
    }

    next();
});

app.get('/challenger/:id', getChallengerInfo);

app.post('/challenger/:id', (req, res) => {
    const name = req.body.displayName;
    if (!name) {
        res.status(400).json({ error: 'Missing required parameter: \'displayName\'' });
        return;
    }

    logger.api.info(`Setting display name for loginId=${req.params.id} to ${name}`);
    db.challenger.setDisplayName(req.params.id, name, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getChallengerInfo(req, res);
        }
    });
});

app.get('/challenger/:id/bingoboard', (req, res) => {
    logger.api.info(`Returning bingo board for loginId=${req.params.id}`);
    db.challenger.getBingoBoard(req.params.id, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json(result);
        }
    });
});

app.post('/challenger/:id/enqueue/:leader', (req, res) => {
    if (!validateLeaderId(req.params.leader)) {
        logger.api.warn(`loginId=${req.params.id} attempted to join queue for invalid leaderId=${req.params.leader}`);
        res.status(400).json({ error: `Leader ID ${req.params.leader} is invalid` });
        return;
    }

    const difficulty = Number(req.body.battleDifficulty);
    if (!difficulty) {
        // Missing or invalid parameter
        logger.api.warn(`loginId=${req.params.id} attempted to join queue with invalid battleDifficulty=${req.body.battleDifficulty}`);
        res.status(400).json({ error: `Battle difficulty ${req.body.battleDifficulty} is invalid` });
        return;
    }

    logger.api.info(`loginId=${req.params.id} joining leaderId=${req.params.leader}'s queue`);
    db.queue.enqueue(req.params.leader, req.params.id, difficulty, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getChallengerInfo(req, res);
        }
    });
});

app.post('/challenger/:id/dequeue/:leader', (req, res) => {
    if (!validateLeaderId(req.params.leader)) {
        logger.api.warn(`loginId=${req.params.id} attempted to leave queue for invalid leaderId=${req.params.leader}`);
        res.status(400).json({ error: `Leader ID ${req.params.leader} is invalid` });
        return;
    }

    logger.api.info(`loginId=${req.params.id} leaving leaderId=${req.params.leader}'s queue`);
    db.queue.dequeue(req.params.leader, req.params.id, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getChallengerInfo(req, res);
        }
    });
});

app.post('/challenger/:id/hold/:leader', (req, res) => {
    if (!validateLeaderId(req.params.leader)) {
        logger.api.warn(`loginId=${req.params.id} attempted to go on hold for invalid leaderId=${req.params.leader}`);
        res.status(400).json({ error: `Leader ID ${req.params.leader} is invalid` });
        return;
    }

    logger.api.info(`loginId=${req.params.id} placing themselves on hold in leaderId=${req.params.leader}'s queue`);
    db.queue.hold(req.params.leader, req.params.id, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getChallengerInfo(req, res);
        }
    });
});

/***************
 * Leader APIs *
 ***************/
app.use('/leader/:id', (req, res, next) => {
    const token = req.get(AUTH_HEADER);
    if (!token) {
        logger.api.error(`Leader endpoint request for loginId=${req.params.id} with missing auth header`);
        res.status(403).json({});
        return;
    }

    const session = validateSession(token, req.params.id, true);
    if (!session) {
        logger.api.error(`Leader endpoint request for loginId=${req.params.id} with invalid auth header`);
        res.status(403).json({});
        return;
    }

    req.leaderId = session.leaderId;
    next();
});

app.get('/leader/:id', getLeaderInfo);

app.post('/leader/:id/openqueue', (req, res) => {
    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} opening queue`);
    db.leader.updateQueueStatus(req.leaderId, true, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            sendHttpBotRequest('/queueopened', { leaderId: req.leaderId });
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/closequeue', (req, res) => {
    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} closing queue`);
    db.leader.updateQueueStatus(req.leaderId, false, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            sendHttpBotRequest('/queueclosed', { leaderId: req.leaderId });
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/enqueue/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to enqueue invalid challengerId=${req.params.challenger}`);
        res.status(400).json({ error: `Challenger ID ${req.params.leader} is invalid` });
        return;
    }

    const difficulty = Number(req.body.battleDifficulty);
    if (!difficulty) {
        // Missing or invalid parameter
        logger.api.warn(`loginId=${req.params.id} attempted to join queue with invalid battleDifficulty=${req.body.battleDifficulty}`);
        res.status(400).json({ error: `Battle difficulty ${req.body.battleDifficulty} is invalid` });
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} adding challengerId=${req.params.challenger} to queue`);
    db.queue.enqueue(req.leaderId, req.params.challenger, difficulty, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/dequeue/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to dequeue invalid challengerId=${req.params.challenger}`);
        res.status(400).json({ error: `Challenger ID ${req.params.leader} is invalid` });
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} removing challengerId=${req.params.challenger} from queue`);
    db.queue.dequeue(req.leaderId, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/report/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to report a match result for invalid challengerId=${req.params.challenger}`);
        res.status(400).json({ error: `Challenger ID ${req.params.challenger} is invalid` });
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} reporting match result ${!!req.body.challengerWin}, badge awarded ${!!req.body.badgeAwarded} for challengerId=${req.params.challenger}`);
    db.leader.reportResult(req.leaderId, req.params.challenger, !!req.body.challengerWin, !!req.body.badgeAwarded, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            if (result.hof) {
                sendHttpBotRequest('/hofentered', { challengerId: req.params.challenger });
            } else if (!!req.body.badgeAwarded) {
                sendHttpBotRequest('/badgeearned', { challengerId: req.params.challenger, leaderId: req.leaderId });
            }

            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/hold/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to hold invalid challengerId=${req.params.challenger}`);
        res.status(400).json({ error: `Challenger ID ${req.params.leader} is invalid` });
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} placing challengerId=${req.params.challenger} on hold`);
    db.queue.hold(req.leaderId, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/unhold/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        logger.api.warn(`loginId=${req.params.id}, leaderId=${req.leaderId} attempted to unhold invalid challengerId=${req.params.challenger}`);
        res.status(400).json({ error: `Challenger ID ${req.params.leader} is invalid` });
        return;
    }

    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} returning challengerId=${req.params.challenger} from hold`);
    db.queue.unhold(req.leaderId, req.params.challenger, !!req.body.placeAtFront, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/live', (req, res) => {
    // Assume the leader should be able to hit this and pass it along; we validate at the bot level anyway
    sendHttpBotRequest('/live', { leaderId: req.leaderId });
    getLeaderInfo(req, res);
});

app.get('/leader/:id/allchallengers', (req, res) => {
    const pplEvent = req.get(PPL_EVENT_HEADER);
    logger.api.info(`loginId=${req.params.id}, leaderId=${req.leaderId} fetching all challengers`);
    db.leader.getAllChallengers(pplEvent, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json(result);
        }
    });
});

app.get('/metrics', (req, res) => {
    logger.api.info('Returning leader metrics');
    db.leader.metrics((error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json(result);
        }
    });
});

app.get('/appsettings', (req, res) => {
    logger.api.info('Returning app settings');
    res.json({ showTrainerCard: new Date() > new Date(config.trainerCardShowDate) });
});

app.get('/openqueues', (req, res) => {
    logger.api.info('Returning a list of open leader queues');
    db.getOpenQueues((error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json(result);
        }
    });
});

app.get('/badges/:id', (req, res) => {
    logger.api.info(`Returning simple badge list for loginId=${req.params.id}`);
    db.getBadges(req.params.id, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json(result);
        }
    });
});

app.get('/logview', (req, res) => {
    generateLogviewResponse(res, 0);
});

app.get('/logview/:daysago', (req, res) => {
    const daysAgo = Number(req.params.daysago);
    generateLogviewResponse(res, daysAgo || 0);
});

initCaches();

setInterval(pruneSessionCache, PRUNE_INTERVAL_MILLIS);

module.exports = app;
