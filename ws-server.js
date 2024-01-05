/******************************************************
 *              WEBSOCKET SERVER MODULE               *
 *                                                    *
 * This module exposes functions for instantiating    *
 * a WebSocketServer object that handles session      *
 * validation as part of its handshake process, as    *
 * well as functions for sending refresh pokes to     *
 * relevant client connections.                       *
 *                                                    *
 * This module exports the following functions:       *
 *   createWsServer, notifyChallengerRefresh,         *
 *   notifyLeaderRefresh                              *
 ******************************************************/

import config from './config/config.js';
import logger from './util/logger.js';
import { validateSession } from './api.js';
import { WebSocketServer } from 'ws';
import { requestType, websocketEvent } from './util/constants.js';

let server;
const socketDict = {};

// Socket ready state constants as defined here: https://github.com/websockets/ws/blob/master/doc/ws.md#ready-state-constants
// CONNECTING and OPEN are omitted because we don't need them in the code
const CLOSING = 2;
const CLOSED = 3;

/******************
 * Util functions *
 ******************/
function ping() {
    server.clients.forEach(socket => {
        if (!socket.isAlive) {
            socket.terminate();
            return;
        }

        socket.isAlive = false;
        socket.ping();
    });
}

function pong() {
    // This function is used as a callback for socket events; the 'this' variable refers to a WebSocket object
    this.isAlive = true;
}

function processMessage(data) {
    // This function is used as a callback for socket events; the 'this' variable refers to a WebSocket object
    const json = JSON.parse('' + data);
    switch (json.action) {
        case websocketEvent.authenticate:
            if (!validateSession(json.token, json.id, requestType.universal)) {
                // Invalid credentials; close the socket
                this.close();
            } else {
                // Valid credentials; notify the client that it's authenticated
                logger.api.info(`Websocket connection authenticated for loginId=${json.id}`);
                socketDict[json.id] = this;
                this.send(JSON.stringify({ action: websocketEvent.confirm }));
            }
            break;
    }
}

function notifyRefresh(id, action) {
    const socket = socketDict[id];
    if (!socket) {
        return;
    }

    if (socket.readyState === CLOSING || socket.readyState === CLOSED) {
        // Socket is closing or closed; remove it from the dict
        delete socketDict[id];
        return;
    }

    socket.send(JSON.stringify({ action: action }));
}

/***************
 * Public APIs *
 ***************/
export function createWsServer() {
    server = new WebSocketServer({ noServer: true });
    server.on('connection', (socket, request) => {
        logger.api.info('Websocket connection established');
        socket.isAlive = true;
        socket.on('error', logger.api.error);
        socket.on('message', processMessage);
        socket.on('pong', pong);

        socket.send(JSON.stringify({ action: websocketEvent.authenticate }));
    });

    setInterval(ping, config.websocketPingInterval);
    return server;
}

export function notifyChallengerRefresh(id) {
    notifyRefresh(id, websocketEvent.refreshChallenger);
}

export function notifyLeaderRefresh(id) {
    notifyRefresh(id, websocketEvent.refreshLeader);
}
