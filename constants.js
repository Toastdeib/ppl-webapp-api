module.exports = {
    resultCode: {
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
        invalidToken: 11
    },
    leaderType: {
        // Bitmask; regular leaders can have teams for multiple difficulty tiers
        casual: 1,
        intermediate: 2,
        veteran: 4,
        // Elite and champ should generally never have any other bitflags set
        elite: 8,
        champion: 16
    },
    battleFormat: {
        // Bitmask; some leaders may support multiple battle formats
        singles: 1,
        doubles: 2,
        multi: 4,
        gimmick: 8
    },
    matchStatus: {
        inQueue: 0,
        onHold: 1,
        loss: 2, // Challenger loss
        win: 3,  // Challenger win
        ash: 4,  // Challenger loss but badge awarded
        gary: 5  // Challenger win but no badge awarded because the challenger was a complete prick
    },
    queueStatus: {
        // Perhaps overkill, but hey
        closed: 0,
        open: 1
    }
};
