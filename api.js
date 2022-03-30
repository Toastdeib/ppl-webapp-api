const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const cors = require('cors');
const fs = require('fs');
const https = require('https');
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

const SESSION_EXPIRATION_MILLIS = 7 * 24 * 60 * 60 * 1000; // 1 week in ms
const sessionCache = {};

const AUTH_HEADER = 'Authorization';

/******************
 * Util functions *
 ******************/
function handleDbError(error, res) {
    switch (error) {
        case db.resultCode.notFound:
            console.log('ID not found');
            res.status(404).json({ error: 'ID not found' });
            break;
        case db.resultCode.alreadyInQueue:
            console.log('Challenger already in queue');
            res.status(400).json({ error: 'Challenger already in queue' });
            break;
        case db.resultCode.alreadyWon:
            console.log('Challenger has already won');
            res.status(400).json({ error: 'Challenger has already won' });
            break;
        case db.resultCode.queueIsFull:
            console.log('Leader queue is full');
            res.status(400).json({ error: 'Leader queue is full' });
            break;
        case db.resultCode.tooManyChallenges:
            console.log('Challenger is in too many queues');
            res.status(400).json({ error: 'Challenger is in too many queues' });
            break;
        case db.resultCode.notInQueue:
            console.log('Challenger is not in queue');
            res.status(400).json({ error: 'Challenger is not in queue' });
            break;
        case db.resultCode.usernameTaken:
            console.log('Username is already taken');
            res.status(400).json({ error: 'Username is already taken' });
            break;
        case db.resultCode.registrationFailure:
            console.log('Unknown error during registration');
            res.status(400).json({ error: 'Unknown error during registration' });
            break;
        case db.resultCode.badCredentials:
            console.log('Invalid login credentials');
            res.status(400).json({ error: 'Invalid login credentials' });
            break;
        case db.resultCode.invalidToken:
            console.log('Invalid access token');
            res.status(400).json({ error: 'Invalid access token' });
            break;
        default:
            console.log('Unexpected database error');
            res.status(500).json({ error: 'Unexpected database error' });
            break;
    }
}

function getChallengerInfo(req, res) {
    console.log(`Returning challenger info for id=${req.params.id}`);
    db.challenger.getInfo(req.params.id, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json({ 
                id: req.params.id,
                displayName: result.displayName,
                queuesEntered: result.queuesEntered,
                badgesEarned: result.badgesEarned
            });
        }
    });
}

function getLeaderInfo(req, res) {
    console.log(`Returning leader info for id=${req.params.id}`);
    db.leader.getInfo(req.params.id, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            res.json({
                id: req.params.id,
                leaderName: result.leaderName,
                badgeName: result.badgeName,
                winCount: result.winCount,
                lossCount: result.lossCount,
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

function createSession(id, isLeader) {
    const token = db.generateHex(16);
    sessionCache[token] = {
        id: id,
        created: new Date().getTime(),
        isLeader: isLeader
    };

    return token;
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
    if (now - session.created > SESSION_EXPIRATION_MILLIS) { // TODO - Shorten this and do rolling expiration instead?
        // Session is expired
        return false;
    }

    return true;
}

/*********************
 * Authentication APIs *
 *********************/
app.post('/register', (req, res) => {
    const credentials = req.get(AUTH_HEADER);

    if (!credentials) {
        res.status(400).json({ error: 'Missing required Authorization header' });
        return;
    }

    const parts = decodeCredentials(credentials);
    if (!parts) {
        res.status(400).json({ error: 'Authorization header was malformed' });
        return;
    }

    console.log('Registering new user');
    db.register(parts[0], parts[1], (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            const token = createSession(result.id, result.isLeader);
            res.json({ id: result.id, isLeader: result.isLeader, token: token });
        }
    });
});

app.post('/login', (req, res) => {
    const credentials = req.get(AUTH_HEADER);

    if (!credentials) {
        res.status(400).json({ error: 'Missing required Authorization header' });
        return;
    }

    const parts = decodeCredentials(credentials);
    if (!parts) {
        res.status(400).json({ error: 'Authorization header was malformed' });
        return;
    }

    console.log('Logging in user');
    db.login(parts[0], parts[1], (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            const token = createSession(result.id, result.isLeader);
            res.json({ id: result.id, isLeader: result.isLeader, token: token });
        }
    });
});

/*******************
 * Challenger APIs *
 *******************/
app.use('/challenger/:id', (req, res, next) => {
    const token = req.get(AUTH_HEADER);
    if (!token) {
        console.log('Missing auth header in challenger endpoint request');
        res.status(403).json({});
        return;
    }

    if (!validateSession(token, req.params.id, false)) {
        console.log('Invalid auth header in challenger endpoint request');
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

    console.log(`Setting display name for id=${req.params.id} to ${name}`);
    db.challenger.setDisplayName(req.params.id, name, (error, result) => {
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
        console.log('Missing auth header in leader endpoint request');
        res.status(403).json({});
        return;
    }

    if (!validateSession(token, req.params.id, true)) {
        console.log('Invalid auth header in leader endpoint request');
        res.status(403).json({});
        return;
    }

    next();
});

app.get('/leader/:id', getLeaderInfo);

app.post('/leader/:id/enqueue/:challenger', (req, res) => {
    console.log(`leaderId=${req.params.id} adding challengerId=${req.params.challenger} to queue`);
    db.leader.enqueue(req.params.id, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/dequeue/:challenger', (req, res) => {
    console.log(`leaderId=${req.params.id} removing challengerId=${req.params.challenger} from queue`);
    db.leader.dequeue(req.params.id, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/report/:challenger', (req, res) => {
    console.log(`leaderId=${req.params.id} reporting match result ${!!req.body.challengerWin} for challengerId=${req.params.challenger}`);
    db.leader.reportResult(req.params.id, req.params.challenger, !!req.body.challengerWin, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/hold/:challenger', (req, res) => {
    console.log(`leaderId=${req.params.id} placing challengerId=${req.params.challenger} on hold`);
    db.leader.hold(req.params.id, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/unhold/:challenger', (req, res) => {
    console.log(`leaderId=${req.params.id} returning challengerId=${req.params.challenger} from hold`);
    db.leader.unhold(req.params.id, req.params.challenger, !!req.body.placeAtFront, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.get('/metrics', (req, res) => {
    console.log('Returning leader metrics');
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
    console.log(`API running on port ${config.port}`);
});

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
