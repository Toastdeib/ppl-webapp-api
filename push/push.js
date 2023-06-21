import { platformType } from '../util/constants.js';
import { sendPush as sendAndroidPush } from './android.js';
import { sendPush as sendIosPush } from './ios.js';

/***************
 * Public APIs *
 ***************/
export function sendPush(msg, tokens) {
    if (tokens[platformType.android]) {
        sendAndroidPush(msg, tokens[platformType.android]);
    }

    if (tokens[platformType.ios]) {
        sendIosPush(msg, tokens[platformType.ios]);
    }
}
