const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const cors = require('cors');
const fs = require('fs');
const db = require('./db.js');
const config = require('./config.js');

app.use(cors({ origin: config.corsOrigin }));
app.use(bodyParser.json());

/******************
 * Util functions *
 ******************/
function handleDbError(error, res) {
    if (error === db.resultCode.notFound) {
        console.log('ID not found');
        res.status(404).json({ error: 'ID not found' });
    } else {
        // Default error case, currently just dbFailure
        console.log('Unexpected database error');
        res.status(500).json({ error: 'Unexpected database error' });
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
                queue: result.queue,
                onHold: result.onHold
            });
        }
    });
}

/*******************
 * Challenger APIs *
 *******************/
app.get('/challenger/:id', getChallengerInfo);

app.post('/challenger/:id', (req, res) => {
    const name = req.body.displayName;
    if (!name) {
        res.json({ error: 'Missing required parameter: \'displayName\'' });
        return;
    }

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
app.get('/leader/:id', getLeaderInfo);

app.post('/leader/:id/enqueue/:challenger', (req, res) => {
    db.leader.enqueue(req.params.id, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/dequeue/:challenger', (req, res) => {
    const challengerWin = !!req.body.challengerWin;
    db.leader.dequeue(req.params.id, req.params.challenger, challengerWin, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/hold/:challenger', (req, res) => {
    db.leader.hold(req.params.id, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/unhold/:challenger', (req, res) => {
    const placeAtFront = !!req.body.placeAtFront;
    db.leader.unhold(req.params.id, req.params.challenger, placeAtFront, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

const server = app.listen(config.port, () => {
    console.log(`API running on port ${server.address().port}`);
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
