# API Documentation

**General note**: For all API paths detailed below, the `:id` param will **always** be a login ID (an 8-byte hex string), as will the `:challenger` param. The `:leader` param will **always** be a leader ID (a 6-byte hex string).

## Authentication APIs

#### /register (POST)

Creates a new account with the provided username and password.  

##### Required headers:

- `Authorization` - Authentication header following the [Basic scheme](https://www.rfc-editor.org/rfc/rfc7617).
- `PPL-Event` - A string indicating the event this account is being registered for. Can be one of:
    - `east`
    - `west`
    - `aus`
    - `online`

##### Response payload:

```json
{
    id: [string],
    loginId: [string],
    leaderId: [string],
    isLeader: [boolean],
    token: [string]
}
```
`id` and `loginId` will **always** be populated with the same value and should be used in the path for authenticated API calls. `token` should be used in an `Authorization` header for authenticated API calls.

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the authentication header is omitted or malformed, or if the username is already in use.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /login (POST)

Logs a user in with the provided username and password.  

##### Required headers:

- `Authorization` - Authentication header following the [Basic scheme](https://www.rfc-editor.org/rfc/rfc2617#section-2).
- `PPL-Event` - A string indicating the event this account is being registered for. Can be one of:
    - `east`
    - `west`
    - `aus`
    - `online`

##### Response payload:

```json
{
    "id": [string],
    "loginId": [string],
    "leaderId": [string],
    "isLeader": [boolean],
    "token": [string]
}
```
`id` and `loginId` will **always** be populated with the same value and should be used in the path for authenticated API calls. `token` should be used in an `Authorization` header for authenticated API calls.

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the authentication header is omitted or malformed.
- HTTP 401 (UNAUTHORIZED) - Returned if the provided credentials are invalid.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /logout/:id (POST)

Logs out a user and clears their session from the local cache. If no `Authorization` header is provided, this path simply does nothing rather than return an error.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

```json
{}
```

## Challenger APIs

#### /challenger/:id (GET)

Retrieves information about the challenger with the given ID.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

```json
{
    "id": [string],
    "displayName": [string],
    "queuesEntered": [
        {
            "leaderId": [string],
            "leaderName": [string],
            "position": [int, 0-indexed]
            "linkCode": [string],
            "difficulty": [int, uses the leaderType constant]
        },
        ...
    ],
    "queuesOnHold": [
        {
            "leaderId": [string],
            "leaderName": [string],
            "difficulty": [int, uses the leaderType constant]
        },
        ...
    ],
    "badgesEarned": [
        {
            "leaderId": [string],
            "leaderName": [string],
            "badgeName": [string]
        },
        ...
    ],
    "championDefeated": [boolean],
    "championSurveyUrl": [string, only present if championDefeated flag is true],
    "feedbackSurveyUrl": [string, only present if appropriate based on configs]
}
```

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /challenger/:id (POST)

Updates the challenger's display name to the value provided in the request body.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `displayName` - The new display name.

##### Response payload:

See: Response payload for [/challenger/:id (GET)](#challengerid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the `displayName` param is omitted.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /challenger/:id/bingoboard (GET)

Retrieves the challenger's bingo board, formatted as a 2D array of objects mapping leader IDs to boolean flags indicating whether or not the challenger has earned that leader's badge. If the board has a free space, its leader ID will be represented as an empty string.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

```json
[
    [
        {
            [leader ID]: [boolean]
        },
        ...
    ],
    ...
]
```

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /challenger/:id/enqueue/:leader (POST)

Adds the challenger to the given leader's queue. This request performs a number of checks and can fail for a number of reasons, as detailed in the error responses section below.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `battleDifficulty` - The battle difficulty, as one of the [`leaderType` constant values](#leadertype).

##### Response payload:

See: Response payload for [/challenger/:id (GET)](#challengerid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the request fails any of several checks. The possible failures as their associated [result codes](#resultcode) are:
    - `queueIsClosed` - Returned if the challenger is attempting to join a closed leader queue.
    - `unsupportedDifficulty` - Returned if the `battleDifficulty` param isn't supported by the given leader.
    - `notEnoughBadges` - Returned if the challenger is attempting to join an Elite's or the Champ's queue and doesn't have enough badges.
    - `notEnoughEmblems` - Returned if the challenger is attempting to join the Champ's queue and doesn't have enough emblems.
    - `alreadyInQueue` - Returned if the challenger is already in the given leader's queue.
    - `alreadyWon` - Returned if the challenger has already earned the given leader's badge or emblem.
    - `queueIsFull` - Returned if the given leader's queue is full.
    - `tooManyChallenges` - Returned if the challenger is in too many different leader queues already.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if either of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /challenger/:id/dequeue/:leader (POST)

Removes the challenger from the given leader's queue.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

See: Response payload for [/challenger/:id (GET)](#challengerid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the challenger isn't in the given leader's queue.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if either of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /challenger/:id/hold/:leader (POST)

Places the challenger on hold for the given leader.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

See: Response payload for [/challenger/:id (GET)](#challengerid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the challenger isn't in the given leader's queue.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if either of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

## Leader APIs

#### /leader/:id (GET)

Retrieves information about the leader with the given ID.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

```json
{
    "loginId": [string],
    "leaderId": [string],
    "leaderName": [string],
    "leaderType": [int, uses the leaderType constant],
    "badgeName": [string],
    "queueOpen": [boolean],
    "twitchEnabled": [boolean],
    "winCount": [int],
    "lossCount": [int],
    "badgesAwarded": [int],
    "queue": [
        {
            "challengerId": [string],
            "displayName": [string],
            "position": [int, 0-indexed],
            "linkCode": [string],
            "difficulty": [int, uses the leaderType constant]
        },
        ...
    ],
    "onHold": [
        {
            "challengerId": [string],
            "displayName": [string]
        },
        ...
    ]
}
```

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /leader/:id/openqueue (POST)

Flags the leader's queue as open, allowing challengers to join it or be added to it.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /leader/:id/closequeue (POST)

Flags the leader's queue as closed, preventing challengers from joining it or being added to it.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /leader/:id/enqueue/:challenger (POST)

Adds the given challenger to the leader's queue. This request performs a number of checks and can fail for a number of reasons, as detailed in the error responses section below.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `battleDifficulty` - The battle difficulty, as one of the [`leaderType` constant values](#leadertype).

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the request fails any of several checks. The possible failures as their associated [result codes](#resultcode) are:
    - `queueIsClosed` - Returned if the leader is attempting to add a challenger while their queue is closed.
    - `unsupportedDifficulty` - Returned if the `battleDifficulty` param isn't supported by the leader.
    - `notEnoughBadges` - Returned if the leader is an Elite or the Champ and the given challenger doesn't have enough badges.
    - `notEnoughEmblems` - Returned if the leader is the Champ and the given challenger doesn't have enough emblems.
    - `alreadyInQueue` - Returned if the given challenger is already in the leader's queue.
    - `alreadyWon` - Returned if the given challenger has already earned the leader's badge or emblem.
    - `queueIsFull` - Returned if the leader's queue is full.
    - `tooManyChallenges` - Returned if the given challenger is in too many different leader queues already.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if either of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /leader/:id/dequeue/:challenger (POST)

Removes the given challenger from the leader's queue.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the challenger isn't in the given leader's queue.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if either of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /leader/:id/report/:challenger (POST)

Reports a match result for the given challenger. This path tracks the battle result and whether a badge was awarded separately to improve the accuracy of battle statistics.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Require body params:

- challengerWin - A boolean flag indicating whether the challenger won the match.
- badgeAwarded - A boolean flag indicating whether the challenger was awarded a badge.

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the given challenger ID isn't in the leader's queue.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if either of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /leader/:id/hold/:challenger (POST)

Places the given challenger on hold for the leader.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the challenger isn't in the given leader's queue.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if either of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /leader/:id/unhold/:challenger (POST)

Returns the given challenger from hold and places them back in the leader's queue, either at the front or back depending on the body param.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `placeAtFront` - A boolean flag indicating whether to place the challenger at the front of the queue. If the flag is `false`, they'll be placed at the back instead.

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the challenger isn't in the given leader's queue.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if either of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /leader/:id/live (POST)

Notifies the API that the leader is streaming on Twitch. This endpoint should only be used for PPL Online events.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /leader/:id/allchallengers (GET)

Retrieves a list of all challengers for the PPL event indicated by the request header.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).
- `PPL-Event` - A string indicating the event this request is being made for. Can be one of:
    - `east`
    - `west`
    - `aus`
    - `online`

##### Response payload:

```json
[
    {
        "id": [string],
        "name": [string]
    },
    ...
]
```

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

## Unauthenticated APIs

#### /metrics (GET)

Retrieves battle and badge metrics for all leaders as a dictionary mapping leader IDs to their data.

##### Response payload:

```json
{
    [leader ID]: {
        "name": [string],
        "wins": [int],
        "losses": [int],
        "badgesAwarded": [int]
    },
    ...
}
```

##### Possible error responses:

- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /appsettings (GET)

Retrieves a collection of event-specific settings. Currently, the collection only contains a single setting, but more may be added in the future.

##### Response payload:

```json
{
    showTrainerCard: [boolean, based on how close to the start of a PPL event it is]
}
```

##### Possible error responses:

- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /openqueues (GET)

Retrieves a list of the queue status of all leaders as a dictionary mapping leader IDs to a boolean flag.

##### Response payload:

```json
{
    [leader ID]: [boolean, indicating whether the leader's queue is open],
    ...
}
```

##### Possible error responses:

- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /badges/:id (GET)

Retrieves a list of badges earned by the given challenger, for displaying a non-interactive public trainer card.

##### Response payload:

```json
{
    "challengerId": [string],
    "displayName": [string],
    "badgesEarned": [
        {
            "leaderId": [string],
            "leaderName": [string],
            "badgeName": [string]
        }
    ]
}
```

##### Possible error responses:

- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /loginfo (POST)

Writes an info-level log message to file. This path should only be sent plaintext; any HTML formatting will be stripped before the message is written.

##### Body params:

- `message` - The message string to be logged.
- `stackTrace` - A stack trace to be logged with the message body. This param is optional.

##### Response payload:

```json
{}
```

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the request body doesn't contain a message param.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /logwarning (POST)

Writes a warning-level log message to file. This path should only be sent plaintext; any HTML formatting will be stripped before the message is written.

##### Body params:

- `message` - The message string to be logged.
- `stackTrace` - A stack trace to be logged with the message body. This param is optional.

##### Response payload:

```json
{}
```

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the request body doesn't contain a message param.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /logerror (POST)

Writes an error-level log message to file. This path should only be sent plaintext; any HTML formatting will be stripped before the message is written.

##### Body params:

- `message` - The message string to be logged.
- `stackTrace` - A stack trace to be logged with the message body. This param is optional.

##### Response payload:

```json
{}
```

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the request body doesn't contain a message param.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

## Constants

#### resultCode

These codes will be returned in **most** error payloads alongside an error string, to provide additional context around the nature of the error.

```json
resultCode = {
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
    unsupportedDifficulty: 15
}
```

#### leaderType

These are used to identify what battle difficulties a leader supports. While this constant is used as a bitmask, only the first **three** values (`casual`, `intermediate`, `veteran`) will ever be masked together; `elite` and `champion` should never be combined with other values.

```json
leaderType = {
    casual: 1,
    intermediate: 2,
    veteran: 4,
    elite: 8,
    champion: 16
}
```

#### battleFormat

These are used to identify what battle formats a leader supports. This constant is used as a bitmask, as leaders can support multiple battle formats.

```json
battleFormat = {
    singles: 1,
    doubles: 2,
    multi: 4,
    special: 8
}
```
