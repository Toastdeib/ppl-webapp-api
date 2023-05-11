import config from './config.js';
import { resultCode } from './constants.js';

const genericErrors = {
    [resultCode.dbFailure]: {
        logMessage: 'Unexpected database error',
        userMessage: 'An unexpected database error occurred, please try again.',
        statusCode: 500
    },
    [resultCode.notFound]: {
        logMessage: 'ID not found',
        userMessage: 'One or more IDs in the request path couldn\'t be found.',
        statusCode: 404
    },
    [resultCode.usernameTaken]: {
        logMessage: 'Username is already taken',
        userMessage: 'That username is already in use.',
        statusCode: 400
    },
    [resultCode.registrationFailure]: {
        logMessage: 'Unknown error during registration',
        userMessage: 'An unknown error occurred during registration, please try again later.',
        statusCode: 500
    },
    [resultCode.badCredentials]: {
        logMessage: 'Invalid login credentials',
        userMessage: 'Invalid login credentials, please try again.',
        statusCode: 401
    },
    [resultCode.invalidToken]: {
        logMessage: 'Invalid access token',
        userMessage: 'Your access token is invalid, please try logging out and back in.',
        statusCode: 401
    }
};

export const challengerErrors = {
    [resultCode.alreadyInQueue]: {
        logMessage: 'Challenger already in queue',
        userMessage: 'You\'re already in that leader\'s queue.',
        statusCode: 400
    },
    [resultCode.alreadyWon]: {
        logMessage: 'Challenger has already won',
        userMessage: 'You\'ve already earned that leader\'s badge.',
        statusCode: 400
    },
    [resultCode.queueIsFull]: {
        logMessage: 'Leader queue is full',
        userMessage: 'That leader\'s queue is currently full.',
        statusCode: 400
    },
    [resultCode.tooManyChallenges]: {
        logMessage: 'Challenger is in too many queues',
        userMessage: `You're already in ${config.maxQueuesPerChallenger} different leader queues.`,
        statusCode: 400
    },
    [resultCode.notInQueue]: {
        logMessage: 'Challenger is not in queue',
        userMessage: 'You aren\'t in that leader\'s queue.',
        statusCode: 400
    },
    [resultCode.queueIsClosed]: {
        logMessage: 'Leader queue is closed',
        userMessage: 'That leader\'s queue is currently closed.',
        statusCode: 400
    },
    [resultCode.notEnoughBadges]: {
        logMessage: 'Not enough badges to join the queue',
        userMessage: 'You don\'t have enough badges to join that leader\'s queue.',
        statusCode: 400
    },
    [resultCode.notEnoughEmblems]: {
        logMessage: 'Not enough emblems to join the queue',
        userMessage: 'You don\'t have enough emblems to join that leader\'s queue.',
        statusCode: 400
    },
    [resultCode.unsupportedDifficulty]: {
        logMessage: 'Unsupported battle difficulty',
        userMessage: 'That leader doesn\'t support that battle difficulty.',
        statusCode: 400
    },
    ...genericErrors
};

export const leaderErrors = {
    [resultCode.alreadyInQueue]: {
        logMessage: 'Challenger already in queue',
        userMessage: 'That challenger is already in your queue.',
        statusCode: 400
    },
    [resultCode.alreadyWon]: {
        logMessage: 'Challenger has already won',
        userMessage: 'That challenger has already earned your badge.',
        statusCode: 400
    },
    [resultCode.queueIsFull]: {
        logMessage: 'Leader queue is full',
        userMessage: 'Your queue is currently full.',
        statusCode: 400
    },
    [resultCode.tooManyChallenges]: {
        logMessage: 'Challenger is in too many queues',
        userMessage: `That challenger is already in ${config.maxQueuesPerChallenger} different queues.`,
        statusCode: 400
    },
    [resultCode.notInQueue]: {
        logMessage: 'Challenger is not in queue',
        userMessage: 'That challenger isn\'t in your queue.',
        statusCode: 400
    },
    [resultCode.queueIsClosed]: {
        logMessage: 'Leader queue is closed',
        userMessage: 'Your queue is currently closed.',
        statusCode: 400
    },
    [resultCode.notEnoughBadges]: {
        logMessage: 'Not enough badges to join the queue',
        userMessage: 'That challenger doesn\'t have enough badges to join your queue.',
        statusCode: 400
    },
    [resultCode.notEnoughEmblems]: {
        logMessage: 'Not enough emblems to join the queue',
        userMessage: 'That challenger doesn\'t have enough emblems to join your queue.',
        statusCode: 400
    },
    [resultCode.unsupportedDifficulty]: {
        logMessage: 'Unsupported battle difficulty',
        userMessage: 'Your leader type doesn\'t support that battle difficulty.',
        statusCode: 400
    },
    ...genericErrors
};
