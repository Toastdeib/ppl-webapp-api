module.exports = {
    resultCode: {
        success: 0, // To allow for a truthy "if (error)" check
        dbFailure: 1,
        alreadyRegistered: 2,
        notRegistered: 3,
        alreadyInQueue: 4,
        alreadyWon: 5,
        queueIsClosed: 6,
        queueIsFull: 7,
        tooManyChallenges: 8,
        notInQueue: 9,
        notOnHold: 10,
        noActiveChallengers: 11,
        noOpenQueues: 12,
        insufficientChallengers: 13
    },
    leaderType: {
        casual: 0,
        veteran: 1,
        elite: 2,
        champion: 3
    },
    matchStatus: {
        inQueue: 0,
        onHold: 1,
        loss: 2, // Challenger loss
        win: 3 // Challenger win
    }
};
