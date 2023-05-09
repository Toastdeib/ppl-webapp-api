import https from 'https';
import fs from 'fs';
import api from './api.js';
import logger from './logger.js';
import config from './config.js';

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
httpsServer.listen(config.port, () => {
    logger.api.info(`API running on port ${config.port}`);
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
