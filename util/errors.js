/******************************************************
 *             RESULT CODE MESSAGE MODULE             *
 *                                                    *
 * This module contains a mapping of result codes to  *
 * log messages, display messages for users, and HTTP *
 * status codes. The API uses this to map error       *
 * responses from the db modules to responses it can  *
 * send back to the requesting client. It exports two *
 * constants, challengerErrors and leaderErrors. Each *
 * constant contains a full set of mappings, with     *
 * some of them specific to the user type and some of *
 * them shared, for codes where the message is type-  *
 * agnostic or only ever shown to one user type.      *
 ******************************************************/
import config from '../config/config.js';
import { httpStatus, resultCode } from './constants.js';

const genericErrors = {
    [resultCode.dbFailure]: {
        logMessage: 'Unexpected database error',
        userMessage: 'An unexpected database error occurred, please try again.',
        statusCode: httpStatus.serverError
    },
    [resultCode.notFound]: {
        logMessage: 'ID not found',
        userMessage: 'One or more IDs in the request path couldn\'t be found.',
        statusCode: httpStatus.notFound
    },
    [resultCode.usernameTaken]: {
        logMessage: 'Username is already taken',
        userMessage: 'That username is already in use.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.registrationFailure]: {
        logMessage: 'Unknown error during registration',
        userMessage: 'An unknown error occurred during registration, please try again later.',
        statusCode: httpStatus.serverError
    },
    [resultCode.badCredentials]: {
        logMessage: 'Invalid login credentials',
        userMessage: 'Invalid login credentials, please try again.',
        statusCode: httpStatus.unauthorized
    },
    [resultCode.invalidToken]: {
        logMessage: 'Invalid access token',
        userMessage: 'Your access token is invalid, please try logging out and back in.',
        statusCode: httpStatus.unauthorized
    },
    [resultCode.unsupportedPushPlatform]: {
        logMessage: 'Unsupported push platform',
        userMessage: 'Push notifications are only supported on Android an iOS.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.tokenAlreadyRegistered]: {
        logMessage: 'Push token already registered',
        userMessage: 'That push token has already been registered.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.tokenNotRegistered]: {
        logMessage: 'Push token not registered',
        userMessage: 'That push token isn\'t registered.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.queueAlreadyOpen]: {
        logMessage: 'Queue already open',
        userMessage: 'Your queue is already open.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.queueAlreadyClosed]: {
        logMessage: 'Queue already closed',
        userMessage: 'Your queue is already closed.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.duoModeNotSupported]: {
        logMessage: 'Duo mode not supported',
        userMessage: 'Duo mode is only supported for multi-battle leaders.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.notInDuoMode]: {
        logMessage: 'Queue not in duo mode',
        userMessage: 'You can only report match results for one challenger at a time while your queue isn\'t in duo mode.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.inDuoMode]: {
        logMessage: 'Queue in duo mode',
        userMessage: 'You can only report match results for two challengers at a time while your queue is in duo mode.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.notEnoughChallengers]: {
        logMessage: 'Not enough challengers',
        userMessage: 'You don\'t have enough challengers in your queue to report a match result.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.usernameTooShort]: {
        logMessage: 'Username too short',
        userMessage: 'Usernames can\'t be shorter than four characters.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.usernameTooLong]: {
        logMessage: 'Username too long',
        userMessage: 'Usernames can\'t be longer than thirty characters.',
        statusCode: httpStatus.badRequest
    }
};

export const challengerErrors = {
    [resultCode.alreadyInQueue]: {
        logMessage: 'Challenger already in queue',
        userMessage: 'You\'re already in that leader\'s queue.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.alreadyWon]: {
        logMessage: 'Challenger has already won',
        userMessage: 'You\'ve already earned that leader\'s badge.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.queueIsFull]: {
        logMessage: 'Leader queue is full',
        userMessage: 'That leader\'s queue is currently full.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.tooManyChallenges]: {
        logMessage: 'Challenger is in too many queues',
        userMessage: `You're already in ${config.maxQueuesPerChallenger} different leader queues.`,
        statusCode: httpStatus.badRequest
    },
    [resultCode.notInQueue]: {
        logMessage: 'Challenger is not in queue',
        userMessage: 'You aren\'t in that leader\'s queue.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.queueIsClosed]: {
        logMessage: 'Leader queue is closed',
        userMessage: 'That leader\'s queue is currently closed.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.notEnoughBadges]: {
        logMessage: 'Not enough badges to join the queue',
        userMessage: 'You don\'t have enough badges to join that leader\'s queue.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.notEnoughEmblems]: {
        logMessage: 'Not enough emblems to join the queue',
        userMessage: 'You don\'t have enough emblems to join that leader\'s queue.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.unsupportedDifficulty]: {
        logMessage: 'Unsupported battle difficulty',
        userMessage: 'That leader doesn\'t support that battle difficulty.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.unsupportedFormat]: {
        logMessage: 'Unsupported battle format',
        userMessage: 'That leader doesn\'t support that battle format.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.queueStateNotSupported]: {
        logMessage: 'Queue state not supported',
        userMessage: 'The current PPL event doesn\'t support challengers joining queues directly.',
        statusCode: httpStatus.forbidden
    },
    ...genericErrors
};

export const leaderErrors = {
    [resultCode.alreadyInQueue]: {
        logMessage: 'Challenger already in queue',
        userMessage: 'That challenger is already in your queue.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.alreadyWon]: {
        logMessage: 'Challenger has already won',
        userMessage: 'That challenger has already earned your badge.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.queueIsFull]: {
        logMessage: 'Leader queue is full',
        userMessage: 'Your queue is currently full.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.tooManyChallenges]: {
        logMessage: 'Challenger is in too many queues',
        userMessage: `That challenger is already in ${config.maxQueuesPerChallenger} different queues.`,
        statusCode: httpStatus.badRequest
    },
    [resultCode.notInQueue]: {
        logMessage: 'Challenger is not in queue',
        userMessage: 'That challenger isn\'t in your queue.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.queueIsClosed]: {
        logMessage: 'Leader queue is closed',
        userMessage: 'Your queue is currently closed.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.notEnoughBadges]: {
        logMessage: 'Not enough badges to join the queue',
        userMessage: 'That challenger doesn\'t have enough badges to join your queue.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.notEnoughEmblems]: {
        logMessage: 'Not enough emblems to join the queue',
        userMessage: 'That challenger doesn\'t have enough emblems to join your queue.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.unsupportedDifficulty]: {
        logMessage: 'Unsupported battle difficulty',
        userMessage: 'Your leader type doesn\'t support that battle difficulty.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.unsupportedFormat]: {
        logMessage: 'Unsupported battle format',
        userMessage: 'You don\'t support that battle format.',
        statusCode: httpStatus.badRequest
    },
    [resultCode.queueStateNotSupported]: {
        logMessage: 'Queue state not supported',
        userMessage: 'The current PPL event doesn\'t support opening and closing queues.',
        statusCode: httpStatus.forbidden
    },
    ...genericErrors
};
