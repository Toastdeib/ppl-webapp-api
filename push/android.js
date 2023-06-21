import logger from '../util/logger.js';

/***************
 * Public APIs *
 ***************/
export function sendPush(msg, tokens) {
    // TODO - Remove this, since the loop will make it moot anyway; it's just here for early debugging
    if (tokens.length === 0) {
        logger.api.debug('No Android tokens for push event, skipping');
        return;
    }

    for (const token of tokens) {
        logger.api.info(`Sending push notification to Android device with token=${token}`);
        // TODO - Actual push logic
    }
}
