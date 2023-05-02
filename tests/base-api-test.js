const http = require('http');
const api = require('../api.js');
const test = require('./test-logger.js');

const hostname = 'localhost';
const port = 9002;

function encodeCredentials(username, password) {
    const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
    return `Basic ${encoded}`;
}

function sendRequest(path, method, params, headers, callback) {
    const postData = JSON.stringify(params);
    const options = {
        hostname: hostname,
        port: port,
        path: path,
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            ...headers
        }
    };

    let data = '';
    const req = http.request(options, (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            callback({ status: res.statusCode, body: data });
        });

    });

    req.on('error', (error) => {
        console.log(`Error in web request: ${error.message}`);
        callback({ status: res.statusCode });
    });

    req.write(postData);
    req.end();
}

function init(callback) {
    const httpServer = http.createServer({}, api);
    httpServer.listen({ host: hostname, port: port }, () => {
        test.debug('Test API running, beginning test suite');
        setTimeout(callback, 2000);
    });
}

module.exports = {
    encodeCredentials: encodeCredentials,
    sendRequest: sendRequest,
    init: init
};
