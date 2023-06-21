/******************************************************
 *                   PUSH DB MODULE                   *
 *                                                    *
 * This module uses the core db module to expose push *
 * APIs for mobile clients.                           *
 *                                                    *
 * This module exports the following functions:       *
 *   enable, disable                                  *
 ******************************************************/
import logger from '../util/logger.js';
import { cachePushToken, fetch, save, tables, uncachePushToken } from './core.js';
import { platformType, resultCode } from '../util/constants.js';

/******************
 * Util functions *
 ******************/
function platformIsValidForPush(platform) {
    return platform === platformType.android || platform === platformType.ios;
}

/***************
 * Public APIs *
 ***************/
// TODO - UNTESTED
export async function enable(id, platform, pushToken, callback) {
    if (!platformIsValidForPush(platform)) {
        logger.api.warn(`Attempted to register a push token for loginId=${id}, platformType=${platform}`);
        callback(resultCode.unsupportedPushPlatform);
        return;
    }

    let result = await fetch(`SELECT 1 FROM ${tables.tokens} WHERE id = ? AND push_type = ? AND push_token = ?`, [id, platform, pushToken]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.count > 0) {
        callback(resultCode.tokenAlreadyRegistered);
        return;
    }

    result = await save(`INSERT INTO ${tables.tokens} (id, push_type, push_token) VALUES (?, ?, ?)`, [id, platform, pushToken]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    cachePushToken(id, platform, pushToken);
    callback(resultCode.success, {});
}

// TODO - UNTESTED
export async function disable(id, platform, pushToken, callback) {
    if (!platformIsValidForPush(platform)) {
        logger.api.warn(`Attempted to unregister a push token for loginId=${id}, platformType=${platform}`);
        callback(resultCode.unsupportedPushPlatform);
        return;
    }

    let result = await fetch(`SELECT 1 FROM ${tables.tokens} WHERE id = ? AND push_type = ? AND push_token = ?`, [id, platform, pushToken]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    if (result.rows.count === 0) {
        callback(resultCode.tokenNotRegistered);
        return;
    }

    result = await save(`DELETE FROM ${tables.tokens} WHERE id = ? AND push_type = ? AND push_token = ?`, [id, platform, pushToken]);
    if (result.resultCode) {
        callback(result.resultCode);
        return;
    }

    uncachePushToken(id, platform, pushToken);
    callback(resultCode.success, {});
}
