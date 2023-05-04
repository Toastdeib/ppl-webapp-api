const config = require('./config.js');
const constants = require('./constants.js');

const genericErrors = {
    [constants.resultCode.dbFailure]: {
        logMessage: 'Unexpected database error',
        userMessage: 'An unexpected database error occurred, please try again.',
        statusCode: 500
    },
    [constants.resultCode.notFound]: {
        logMessage: 'ID not found',
        userMessage: 'One or more IDs in the request path couldn\'t be found.',
        statusCode: 404
    },
    [constants.resultCode.usernameTaken]: {
        logMessage: 'Username is already taken',
        userMessage: 'That username is already in use.',
        statusCode: 400
    },
    [constants.resultCode.registrationFailure]: {
        logMessage: 'Unknown error during registration',
        userMessage: 'An unknown error occurred during registration, please try again later.',
        statusCode: 500
    },
    [constants.resultCode.badCredentials]: {
        logMessage: 'Invalid login credentials',
        userMessage: 'Invalid login credentials, please try again.',
        statusCode: 401
    },
    [constants.resultCode.invalidToken]: {
        logMessage: 'Invalid access token',
        userMessage: 'Your access token is invalid, please try logging out and back in.',
        statusCode: 401
    },
};

const challengerErrors = {
    [constants.resultCode.alreadyInQueue]: {
        logMessage: 'Challenger already in queue',
        userMessage: 'You\'re already in that leader\'s queue.',
        statusCode: 400
    },
    [constants.resultCode.alreadyWon]: {
        logMessage: 'Challenger has already won',
        userMessage: 'You\'ve already earned that leader\'s badge.',
        statusCode: 400
    },
    [constants.resultCode.queueIsFull]: {
        logMessage: 'Leader queue is full',
        userMessage: 'That leader\'s queue is currently full.',
        statusCode: 400
    },
    [constants.resultCode.tooManyChallenges]: {
        logMessage: 'Challenger is in too many queues',
        userMessage: `You're already in ${config.maxQueuesPerChallenger} different leader queues.`,
        statusCode: 400
    },
    [constants.resultCode.notInQueue]: {
        logMessage: 'Challenger is not in queue',
        userMessage: 'You aren\'t in that leader\'s queue.',
        statusCode: 400
    },
    [constants.resultCode.queueIsClosed]: {
        logMessage: 'Leader queue is closed',
        userMessage: 'That leader\'s queue is currently closed.',
        statusCode: 400
    },
    [constants.resultCode.notEnoughBadges]: {
        logMessage: 'Not enough badges to join the queue',
        userMessage: 'You don\'t have enough badges to join that leader\'s queue.',
        statusCode: 400
    },
    [constants.resultCode.notEnoughEmblems]: {
        logMessage: 'Not enough emblems to join the queue',
        userMessage: 'You don\'t have enough emblems to join that leader\'s queue.',
        statusCode: 400
    },
    [constants.resultCode.unsupportedDifficulty]: {
        logMessage: 'Unsupported battle difficulty',
        userMessage: 'That leader doesn\'t support that battle difficulty.',
        statusCode: 400
    },
    ...genericErrors
};

const leaderErrors = {
    [constants.resultCode.alreadyInQueue]: {
        logMessage: 'Challenger already in queue',
        userMessage: 'That challenger is already in your queue.',
        statusCode: 400
    },
    [constants.resultCode.alreadyWon]: {
        logMessage: 'Challenger has already won',
        userMessage: 'That challenger has already earned your badge.',
        statusCode: 400
    },
    [constants.resultCode.queueIsFull]: {
        logMessage: 'Leader queue is full',
        userMessage: 'Your queue is currently full.',
        statusCode: 400
    },
    [constants.resultCode.tooManyChallenges]: {
        logMessage: 'Challenger is in too many queues',
        userMessage: `That challenger is already in ${config.maxQueuesPerChallenger} different queues.`,
        statusCode: 400
    },
    [constants.resultCode.notInQueue]: {
        logMessage: 'Challenger is not in queue',
        userMessage: 'That challenger isn\'t in your queue.',
        statusCode: 400
    },
    [constants.resultCode.queueIsClosed]: {
        logMessage: 'Leader queue is closed',
        userMessage: 'Your queue is currently closed.',
        statusCode: 400
    },
    [constants.resultCode.notEnoughBadges]: {
        logMessage: 'Not enough badges to join the queue',
        userMessage: 'That challenger doesn\'t have enough badges to join your queue.',
        statusCode: 400
    },
    [constants.resultCode.notEnoughEmblems]: {
        logMessage: 'Not enough emblems to join the queue',
        userMessage: 'That challenger doesn\'t have enough emblems to join your queue.',
        statusCode: 400
    },
    [constants.resultCode.unsupportedDifficulty]: {
        logMessage: 'Unsupported battle difficulty',
        userMessage: 'Your leader type doesn\'t support that battle difficulty.',
        statusCode: 400
    },
    ...genericErrors
};

module.exports = {
    challengerErrors: challengerErrors,
    leaderErrors: leaderErrors
};
