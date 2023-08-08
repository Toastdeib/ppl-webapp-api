export const resultCode = {
    success: 0,
    dbFailure: 1,
    notFound: 2,
    alreadyInQueue: 3,
    alreadyWon: 4,
    queueIsFull: 5,
    tooManyChallenges: 6,
    notInQueue: 7,
    usernameTaken: 8,
    registrationFailure: 9,
    badCredentials: 10,
    invalidToken: 11,
    queueIsClosed: 12,
    notEnoughBadges: 13,
    notEnoughEmblems: 14,
    unsupportedDifficulty: 15,
    unsupportedFormat: 16,
    unsupportedPushPlatform: 17,
    tokenAlreadyRegistered: 18,
    tokenNotRegistered: 19,
    queueAlreadyOpen: 20,
    queueAlreadyClosed: 21,
    duoModeNotSupported: 22,
    notInDuoMode: 23,
    inDuoMode: 24,
    notEnoughChallengers: 25,
    queueStateNotSupported: 26,
    usernameTooShort: 27,
    usernameTooLong: 28
};

export const leaderType = {
    // Bitmask; regular leaders can have teams for multiple difficulty tiers
    casual: 1,
    intermediate: 2,
    veteran: 4,
    // Elite and champ should generally never have any other bitflags set
    elite: 8,
    champion: 16
};

export const battleFormat = {
    // Bitmask; some leaders may support multiple battle formats
    singles: 1,
    doubles: 2,
    multi: 4,
    special: 8
};

export const matchStatus = {
    inQueue: 0,
    onHold: 1,
    loss: 2, // Challenger loss
    win: 3,  // Challenger win
    ash: 4,  // Challenger loss but badge awarded
    gary: 5  // Challenger win but no badge awarded because the challenger was a complete prick
};

export const queueStatus = {
    // Perhaps overkill, but hey
    closed: 0,
    open: 1
};

export const pplEvent = {
    // Bitmask; some users go to multiple PAXes
    east: 1,
    west: 2,
    aus: 4,
    online: 8
};

export const httpStatus = {
    // Just a small subset, since this only uses a handful
    ok: 200,
    badRequest: 400,
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    serverError: 500
};

export const requestType = {
    challenger: 0,
    leader: 1,
    universal: 2
};

export const platformType = {
    none: -1,
    web: 0,
    android: 1,
    ios: 2
};
