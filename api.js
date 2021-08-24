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

/*******************
 * Challenger APIs *
 *******************/
app.get('/challenger/:id', getChallengerInfo);

app.post('/challenger/:id', (req, res) => {
    const name = req.body.displayName;
    if (!name) {
        res.status(400).json({ error: 'Missing required parameter: \'displayName\'' });
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
    db.leader.dequeue(req.params.id, req.params.challenger, (error, result) => {
        if (error) {
            handleDbError(error, res);
        } else {
            getLeaderInfo(req, res);
        }
    });
});

app.post('/leader/:id/report/:challenger', (req, res) => {
    db.leader.reportResult(req.params.id, req.params.challenger, !!req.body.challengerWin, (error, result) => {
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
    db.leader.unhold(req.params.id, req.params.challenger, !!req.body.placeAtFront, (error, result) => {
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
