const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const util = require('toast-utils');
const db = require('./db.js');
const config = require('./config.js');

app.use(cors({ origin: config.corsOrigin }));
app.use(bodyParser.json());

// Certificate
const privateKey = fs.readFileSync(config.certPath + 'privkey.pem', 'utf8');
const certificate = fs.readFileSync(config.certPath + 'cert.pem', 'utf8');
const ca = fs.readFileSync(config.certPath + 'chain.pem', 'utf8');

const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca
};

const SESSION_EXPIRATION_MILLIS = 24 * 60 * 60 * 1000; // 1 day in ms
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
        case db.resultCode.notFound:
            util.log('ID not found');
            res.status(404).json({ error: 'ID not found' });
            break;
        case db.resultCode.alreadyInQueue:
            util.log('Challenger already in queue');
            res.status(400).json({ error: 'Challenger already in queue' });
            break;
        case db.resultCode.alreadyWon:
            util.log('Challenger has already won');
            res.status(400).json({ error: 'Challenger has already won' });
            break;
        case db.resultCode.queueIsFull:
            util.log('Leader queue is full');
            res.status(400).json({ error: 'Leader queue is full' });
            break;
        case db.resultCode.tooManyChallenges:
            util.log('Challenger is in too many queues');
            res.status(400).json({ error: 'Challenger is in too many queues' });
            break;
        case db.resultCode.notInQueue:
            util.log('Challenger is not in queue');
            res.status(400).json({ error: 'Challenger is not in queue' });
            break;
        case db.resultCode.usernameTaken:
            util.log('Username is already taken');
            res.status(400).json({ error: 'Username is already taken' });
            break;
        case db.resultCode.registrationFailure:
            util.log('Unknown error during registration');
            res.status(400).json({ error: 'Unknown error during registration' });
            break;
        case db.resultCode.badCredentials:
            util.log('Invalid login credentials');
            res.status(400).json({ error: 'Invalid login credentials' });
            break;
        case db.resultCode.invalidToken:
            util.log('Invalid access token');
            res.status(400).json({ error: 'Invalid access token' });
            break;
        default:
            util.log('Unexpected database error');
            res.status(500).json({ error: 'Unexpected database error' });
            break;
    }
}

function getChallengerInfo(req, res) {
    util.log(`Returning challenger info for id=${req.params.id}`);
    db.challenger.getInfo(req.params.id, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json({ 
                id: req.params.id,
                displayName: result.displayName,
                queuesEntered: result.queuesEntered,
                badgesEarned: result.badgesEarned,
                championDefeated: result.championDefeated
            });
        }
    });
}

function getLeaderInfo(req, res) {
    util.log(`Returning leader info for loginId=${req.params.id}, leaderId=${req.leaderId}`);
    db.leader.getInfo(req.leaderId, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json({
                loginId: req.params.id,
                leaderId: req.leaderId,
                leaderName: result.leaderName,
                badgeName: result.badgeName,
                winCount: result.winCount,
                lossCount: result.lossCount,
                badgesAwarded: result.badgesAwarded,
                queue: result.queue,
                onHold: result.onHold
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

    if (session.isLeader !== leaderRequest) {
        // Disallow API requests from the wrong user type
        return false;
    }

    const now = new Date().getTime();
    if (now - session.lastUsed > SESSION_EXPIRATION_MILLIS) {
        // Session is expired, clear it out of the cache
        delete sessionCache[parts[1]];
        saveCache();
        return false;
    }

    session.lastUsed = new Date().getTime();
    return session;
}

function validateChallengerId(id) {
    return idCache.challengers.indexOf(id) !== -1;
}

function validateLeaderId(id) {
    return idCache.leaders.indexOf(id) !== -1;
}

function saveCache() {
    util.log('Writing session cache to file');
    fs.writeFileSync(CACHE_FILE, JSON.stringify(sessionCache), 'utf-8');
}

function initCaches() {
    try {
        util.log('Restoring session cache from file');
        sessionCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    } catch (err) {
        util.log('Could not restore session cache, initializing as empty instead');
    }

    db.getAllIds((error, result) => {
        if (error) {
            util.log('Failed to initialize ID cache');
            idCache = { challengers: [], leaders: [] };
        } else {
            util.log('Initalizing ID cache');
            idCache = result;
        }
    });
}

function pruneCache() {
    util.log('Bulk pruning expired sessions from cache');
    const ids = Object.keys(sessionCache);
    const now = new Date().getTime();
    for (let i = 0; i < ids.length; i++) {
        if (now - sessionCache[ids[i]].lastUsed > SESSION_EXPIRATION_MILLIS) {
            // Session is expired, clear it out of the cache
            delete sessionCache[ids[i]];
        }
    }

    saveCache();
}

/*********************
 * Authentication APIs *
 *********************/
app.post('/register', (req, res) => {
    const credentials = req.get(AUTH_HEADER);
    const pplEvent = req.get(PPL_EVENT_HEADER);

    if (!credentials) {
        res.status(400).json({ error: 'Missing required Authorization header' });
        return;
    }

    const parts = decodeCredentials(credentials);
    if (!parts) {
        res.status(400).json({ error: 'Authorization header was malformed' });
        return;
    }

    util.log('Registering new user');
    db.register(parts[0], parts[1], pplEvent, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            const token = createSession(result.id, result.isLeader, result.leaderId);
            idCache.challengers.push(result.id);
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
        res.status(400).json({ error: 'Missing required Authorization header' });
        return;
    }

    const parts = decodeCredentials(credentials);
    if (!parts) {
        res.status(400).json({ error: 'Authorization header was malformed' });
        return;
    }

    util.log('Logging in user');
    db.login(parts[0], parts[1], pplEvent, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            const token = createSession(result.id, result.isLeader, result.leaderId);
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
    util.log(`Logging out userId=${req.params.id}`);
    const token = req.get(AUTH_HEADER);
    if (token) {
        clearSession(token, req.params.id);
    }

    res.status(200).json({});
});

app.get('/allleaderdata', (req, res) => {
    util.log('Fetching all leader data');
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
        util.log('Missing auth header in challenger endpoint request');
        res.status(403).json({});
        return;
    }

    if (!validateSession(token, req.params.id, false)) {
        util.log('Invalid auth header in challenger endpoint request');
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

    util.log(`Setting display name for id=${req.params.id} to ${name}`);
    db.challenger.setDisplayName(req.params.id, name, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getChallengerInfo(req, res);
        }
    });
});

app.post('/challenger/:id/bingoboard', (req, res) => {
    util.log(`Returning bingo board for id=${req.params.id}`);
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
        res.status(400).json({ error: `Leader ID ${req.params.leader} is invalid` });
        return;
    }

    util.log(`loginId=${req.params.id} joining leaderId=${req.params.leader}'s queue`);
    db.leader.enqueue(req.params.leader, req.params.id, (error, result) => {
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
        util.log('Missing auth header in leader endpoint request');
        res.status(403).json({});
        return;
    }

    const session = validateSession(token, req.params.id, true);
    if (!session) {
        util.log('Invalid auth header in leader endpoint request');
        res.status(403).json({});
        return;
    }

    req.leaderId = session.leaderId;
    next();
});

app.get('/leader/:id', getLeaderInfo);

app.post('/leader/:id/enqueue/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        res.status(400).json({ error: `Challenger ID ${req.params.leader} is invalid` });
        return;
    }

    util.log(`loginId=${req.params.id}, leaderId=${req.leaderId} adding challengerId=${req.params.challenger} to queue`);
    db.leader.enqueue(req.leaderId, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/dequeue/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        res.status(400).json({ error: `Challenger ID ${req.params.leader} is invalid` });
        return;
    }

    util.log(`loginId=${req.params.id}, leaderId=${req.leaderId} removing challengerId=${req.params.challenger} from queue`);
    db.leader.dequeue(req.leaderId, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/report/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        res.status(400).json({ error: `Challenger ID ${req.params.leader} is invalid` });
        return;
    }

    util.log(`loginId=${req.params.id}, leaderId=${req.leaderId} reporting match result ${!!req.body.challengerWin}, badge awarded ${!!req.body.badgeAwarded} for challengerId=${req.params.challenger}`);
    db.leader.reportResult(req.leaderId, req.params.challenger, !!req.body.challengerWin, !!req.body.badgeAwarded, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/hold/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        res.status(400).json({ error: `Challenger ID ${req.params.leader} is invalid` });
        return;
    }

    util.log(`loginId=${req.params.id}, leaderId=${req.leaderId} placing challengerId=${req.params.challenger} on hold`);
    db.leader.hold(req.leaderId, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/unhold/:challenger', (req, res) => {
    if (!validateChallengerId(req.params.challenger)) {
        res.status(400).json({ error: `Challenger ID ${req.params.leader} is invalid` });
        return;
    }

    util.log(`loginId=${req.params.id}, leaderId=${req.leaderId} returning challengerId=${req.params.challenger} from hold`);
    db.leader.unhold(req.leaderId, req.params.challenger, !!req.body.placeAtFront, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.get('/leader/:id/allchallengers', (req, res) => {
    const pplEvent = req.get(PPL_EVENT_HEADER);
    util.log(`loginId=${req.params.id}, leaderId=${req.leaderId} fetching all challengers`);
    db.leader.getAllChallengers(pplEvent, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json(result);
        }
    });
});

app.get('/metrics', (req, res) => {
    util.log('Returning leader metrics');
    db.leader.metrics((error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json(result);
        }
    });
});

const httpsServer = https.createServer(credentials, app);
httpsServer.listen(config.port, () => {
    util.log(`API running on port ${config.port}`);
});

initCaches();

setInterval(pruneCache, SESSION_EXPIRATION_MILLIS);

if (config.debug) {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
        try {
            eval(chunk);
        } catch (e) {
            console.error(e);
        }
    });
}
