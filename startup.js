import api from './api.js';
import config from './config/config.js';
import { createWsServer } from './ws-server.js';
import fs from 'fs';
import https from 'https';
import { initMetrics } from './util/metrics.js';
import logger from './util/logger.js';

// Certificate
const privateKey = fs.readFileSync(config.certPath + 'privkey.pem', 'utf8');
const certificate = fs.readFileSync(config.certPath + 'cert.pem', 'utf8');
const ca = fs.readFileSync(config.certPath + 'chain.pem', 'utf8');

const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca
};

const httpsServer = https.createServer(credentials, api);

// Websocket server init
const wss = createWsServer();
httpsServer.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

httpsServer.listen(config.port, () => {
    logger.api.info(`API running on port ${config.port}`);
});

initMetrics();

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
