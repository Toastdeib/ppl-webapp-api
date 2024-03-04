/******************************************************
 *                   METRICS MODULE                   *
 *                                                    *
 * This module defines functions for tracking request *
 * and response metrics for the web API, as well as   *
 * one for fetching the data for visualization. It    *
 * maintains up to 5 minutes worth of data in a cache *
 * and prunes older data every 60 seconds to avoid    *
 * excessive memory usage.                            *
 *                                                    *
 * NOTE: In order to properly track request duration, *
 * the trackRequest function returns a correlation ID *
 * which -must- be passed to the trackResponse call   *
 * for that same request.                             *
 *                                                    *
 * This module exports the following functions:       *
 *   trackRequest, trackResponse, getMetrics          *
 ******************************************************/
import { generateHex } from '../db/auth.js';

const MAX_DATA_AGE_MILLISECONDS = 300000; // 5 minutes
const PRUNE_INTERVAL_MILLISECONDS = 60000; // 1 minute
const CORRELATION_ID_HEX_LENGTH = 8;

const metricsCache = {
    requests: [],
    responses: []
};

setInterval(pruneCache, PRUNE_INTERVAL_MILLISECONDS);

/******************
 * Util functions *
 ******************/
function pruneCache() {
    const maxAge = new Date() - MAX_DATA_AGE_MILLISECONDS;
    const pruneRequestsTo = metricsCache.requests.findIndex(request => request.timestamp >= maxAge);
    const pruneResponsesTo = metricsCache.responses.findIndex(response => response.timestamp >= maxAge);

    metricsCache.requests.splice(0, pruneRequestsTo);
    metricsCache.responses.splice(0, pruneResponsesTo);
}

/***************
 * Public APIs *
 ***************/
export function trackRequest(path) {
    const timestamp = new Date();
    const correlationId = generateHex(CORRELATION_ID_HEX_LENGTH);
    metricsCache.requests.push({
        path: path,
        timestamp: timestamp,
        correlationId: correlationId
    });

    return correlationId;
}

export function trackResponse(statusCode, correlationId) {
    const timestamp = new Date();
    const request = metricsCache.requests.find(request => request.correlationId === correlationId);
    if (!request) {
        // Logging a response with no corresponding request; that's a paddlin'
        return;
    }

    const duration = timestamp - request.timestamp;
    metricsCache.responses.push({
        statusCode: statusCode,
        path: request.path,
        timestamp: timestamp,
        duration: duration,
        correlationId: correlationId
    });
}

export function getMetrics() {
    const maxAge = new Date() - MAX_DATA_AGE_MILLISECONDS;
    return {
        requests: metricsCache.requests
            .filter(request => request.timestamp >= maxAge)
            .map(request => { return { path: request.path, timestamp: request.timestamp }; }),
        responses: metricsCache.responses
            .filter(response => response.timestamp >= maxAge)
            .map(response => { return { statusCode: response.statusCode, path: response.path, duration: response.duration }; })
    };
}
