# PPL Webapp API

## Table of Contents

- [Overview](#overview)
- [API Documentation](#api-documentation)
    - [Authentication APIs](#authentication-apis)
    - [Challenger APIs](#challenger-apis)
    - [Leader APIs](#leader-apis)
    - [Unauthenticated APIs](#unauthenticated-apis)
    - [Constants](#constants)
- [Tests](#tests)

# Overview

This project is an API built to support the [PPL Webapp](https://github.com/lunemily/ppl-in-person) frontend. It's set up to present its public-facing API through Express and be driven off of a MySQL database, the expected schema of which can be found in a comment near the top of the [db.js](db.js) module. In order to set up a new instance, you need to:

1. Clone the project and install all the dependencies with npm.
2. Make a copy of the [config.js.example](config.js.example) simply named config.js.
3. Populate the API configs appropriately for your environment:
    - The `debug` field indicates whether the node application should run in debug mode. Setting this to `true` will enable console input in the running application, as well as the `debugSave` function on the database module.
    - The `port` field is the port that the API will listen on, and should be an open port on the machine running this node application.
    - The `botApiPort` field is optional and only relevant for events that make use of the PPLBot project (link to come) for reporting updates to Discord.
    - The `certPath` field is a local filepath to your cert file so the API can be served over HTTPS. If you don't have a cert set up, check out LetsEncrypt to get started.
    - The `corsOrigin` field can be either a string or an array of strings, and each string should be a domain that's permitted to access the API.
    - The `mysql...` fields configure the database connection, and will vary depending on how your system is set up.
    - The `tableSuffix` field is optional and applies a suffix to all table names in the db.js module if specified. This is useful for setting up a staging environment with a separate set of tables from those used in production.
4. Populate the event configs appropriately for your PPL event:
    - The `...SurveyUrl` fields are links to surveys to be filled out by Hall of Fame entrants, challengers, and leaders respectively. The former is typically used for challengers to submit their winning teams, and the latter two are for general feedback.
    - The `surveyStartDate` and `surveyDurationDays` fields define when the survey links should be sent down in API responses and for how long. The start date is typically the final day of a PPL event.
    - The `trainerCardShowDate` field defines when the trainer card should start appearing in the webapp. It's typically the day of the champion reveal, so that leader names and art can be pre-loaded without challengers seeing them early.
    - The `bingoBoardWidth` field defines the dimensions of the board used for the leader bingo side activity. It should typically be less than the square root of the number of leaders and elites combined (e.g. a 4x4 or 5x5 board for a pool of 30 total non-champion leaders).
    - The `requiredBadges` and `requiredEmblems` fields define how many badges and emblems a challenger needs to face elites and the champion, respectively. If `requiredEmblems` is set to 0, `requiredBadges` will be used for the champion check as well as elites.
    - The `maxQueueSize` field defines how many challengers a leader can have in their queue at a given time. This should typically be large for in-person events and more restricted during online events.
    - The `maxQueuesPerChallenger` field defines how many leader queues a challenger can be in at once.
    - The `excludedBingoIds` field is an array of leader ID strings that defines what, if any, leaders should be excluded when constructing new bingo boards. This should be used in cases where multiple leaders have the same ace/Tera and you want to avoid collisions.
5. Run `node startup.js`. **Note**: This *may* require `sudo` to run, depending on the permissions on the cert path.

If everything is correctly configured, you should see a few log statements appear indicating that the API is running. You can validate it by using curl, a simple web browser (for the GET requests), or another tool of your choice.

[Back to top](#table-of-contents)

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
    "id": [string],
    "loginId": [string],
    "leaderId": [string],
    "isLeader": [boolean],
    "token": [string]
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

[Back to top](#table-of-contents)

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

[Back to top](#table-of-contents)

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

[Back to top](#table-of-contents)

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
    "showTrainerCard": [boolean, based on how close to the start of a PPL event it is]
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

[Back to top](#table-of-contents)

## Constants

#### resultCode

These codes will be returned in **most** error payloads alongside an error string, to provide additional context around the nature of the error.

```json
{
    "success": 0,
    "dbFailure": 1,
    "notFound": 2,
    "alreadyInQueue": 3,
    "alreadyWon": 4,
    "queueIsFull": 5,
    "tooManyChallenges": 6,
    "notInQueue": 7,
    "usernameTaken": 8,
    "registrationFailure": 9,
    "badCredentials": 10,
    "invalidToken": 11,
    "queueIsClosed": 12,
    "notEnoughBadges": 13,
    "notEnoughEmblems": 14,
    "unsupportedDifficulty": 15
}
```

#### leaderType

These are used to identify what battle difficulties a leader supports. While this constant is used as a bitmask, only the first **three** values (`casual`, `intermediate`, `veteran`) will ever be masked together; `elite` and `champion` should never be combined with other values.

```json
{
    "casual": 1,
    "intermediate": 2,
    "veteran": 4,
    "elite": 8,
    "champion": 16
}
```

#### battleFormat

These are used to identify what battle formats a leader supports. This constant is used as a bitmask, as leaders can support multiple battle formats.

```json
{
    "singles": 1,
    "doubles": 2,
    "multi": 4,
    "special": 8
}
```

[Back to top](#table-of-contents)

# Tests

This project currently contains six test suites in the /tests directory - three that run on the database module directly, and three that instantiate an instance of the API and run against that instead. The database test suites currently have full coverage of *all* functions exposed by the module, although the API test suites don't yet cover all the paths and their possible responses. However, coverage should be sufficient to help find bugs in both the API and database modules before they make it to production.

The six suites are:

- [db-general.js](tests/db-general.js) - A database test suite covering general database functions, such as registration, login, and pulling down the list of challengers for a given event.
- [db-challenger.js](tests/db-challenger.js) - A database test suite covering challenger-oriented database functions, such as modifying the display name and joining leader queues.
- [db-leader.js](tests/db-leader.js) - A database test suite covering leader-oriented database functions, such as opening/closing the queue, adding challengers, and reporting match results.
- [api-general.js](tests/api-general.js) - An API test suite covering general, unauthenticated API paths. This suite covers mostly covers API paths that don't interact with the database.
- [api-challenger.js](tests/api-challenger.js) - An API test suite covering challenger-oriented API paths. This suite has roughly the same coverage as the db-challenger.js suite.g match results.
- [api-leader.js](tests/api-leader.js) - An API test suite covering leader-oriented API paths. This suite has roughly the same coverage as the db-leader.js suite.

As documented at the top of each test suite file, they're all intended to be run with certain environment variables which modify the behavior of the logging module and what database tables the tests should be performed on. The tests are intended to work off of a separate set of database tables, suffixed with `_test`, and pre-populated with the queries found in [baseline.sql](tests/baseline.sql). While each suite is designed to perform cleanup of any database changes it makes, the test tables *can* get out of sync with the baseline if certain tests or cleanup steps fail, so rerunning the baseline may be necessary in case of unexpected errors.

[Back to top](#table-of-contents)
