import http from 'http';
import fs from 'fs';
import api from '../api.js';
import { debug } from './test-logger.js';

const hostname = 'localhost';
const port = 9002;

export function encodeCredentials(username, password) {
    const encoded = btoa(`${username}:${password}`);
    return `Basic ${encoded}`;
}

export function sendRequest(path, method, params, headers, callback) {
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
        callback({ status: 500 });
    });

    req.write(postData);
    req.end();
}

export function clearCache() {
    try {
        fs.unlinkSync('cache.json');
        debug('Cleaned up cache.json file');
    } catch (e) {
        debug('Unable to delete cache.json file, please perform cleanup manually');
    }
}

export function init(callback) {
    const httpServer = http.createServer({}, api);
    httpServer.listen({ host: hostname, port: port }, () => {
        debug('Test API running, beginning test suite');
        setTimeout(callback, 2000);
    });
}
