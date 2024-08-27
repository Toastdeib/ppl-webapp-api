# PPL Webapp API

## Table of Contents

- [Overview](#overview)
- [API Documentation](#api-documentation)
    - [Authentication APIs](#authentication-apis)
    - [Challenger APIs](#challenger-apis)
    - [Leader APIs](#leader-apis)
    - [Push APIs](#push-apis)
    - [Unauthenticated APIs](#unauthenticated-apis)
    - [Constants](#constants)
- [Websockets](#websockets)
- [Tests](#tests)

# Overview

This project is half of a system built to help manage events run by the [PAX Pokémon League](https://paxpokemonleague.net) both online and at in-person PAXes. It consists of an API built to support the [PPL Webapp](https://github.com/lunemily/ppl-in-person) frontend. It's set up to present its public-facing API through Express and be driven off of a MySQL database, the expected schema of which can be found in a comment near the top of the [core.js](db/core.js) database module. In order to set up a new instance, you need to:

1. Clone the project and install all the dependencies with npm.
2. Make a copy of the [config.js.example](config/config.js.example) file named `general.js` in the same directory as the example file.
3. Populate the API configs appropriately for your environment:
    - The `debug` field indicates whether the node application should run in debug mode. Setting this to `true` will enable console input in the running application, as well as the `debugSave` function on the database module.
    - The `port` field is the port that the API will listen on, and should be an open port on the machine running this node application.
    - The `botApiPort` field is optional and only relevant for events that make use of the PPLBot project (link to come) for reporting updates to Discord.
    - The `certPath` field is a local filepath to your cert file so the API can be served over HTTPS. If you don't have a cert set up, check out LetsEncrypt to get started.
    - The `corsOrigin` field can be either a string or an array of strings, and each string should be a domain that's permitted to access the API.
    - The `mysql...` fields configure the database connection, and will vary depending on how your system is set up.
    - The `tableSuffix` field is optional and applies a suffix to all table names queried by the database module if specified. This is useful for setting up a staging environment with a separate set of tables from those used in production.
    - The `websocketPingInterval` field defines how often websockets are pinged to check whether they're still alive in milliseconds.
4. Populate the event configs appropriately for your baseline PPL event:
    - The `...SurveyUrl` fields are links to surveys to be filled out by Hall of Fame entrants, challengers, and leaders respectively. The former is typically used for challengers to submit their winning teams, and the latter two are for general feedback.
    - The `surveyStartDate` and `surveyDurationDays` fields define when the survey links should be sent down in API responses and for how long. The start date is typically the final day of a PPL event.
    - The `trainerCardShowDate` field defines when the trainer card should start appearing in the webapp. It's typically the day of the champion reveal, so that leader names and art can be pre-loaded without challengers seeing them early.
    - The `eventEndDate` field defines when the PPL event is considered to be officially over, and is used to set a flag in the `/appsettings` API endpoint indicating that for callers so they can inform users.
    - The `bingoBoardWidth` field defines the dimensions of the board used for the leader bingo side activity. It should typically be less than the square root of the number of leaders and elites combined (e.g. a 4x4 or 5x5 board for a pool of 30 total non-champion leaders).
    - The `requiredBadgesForElites` field defines how many badges are required to battle elites. If an event only has regular leaders and a champion, this field will be ignored.
    - The `requiredBadgesForChamp` field defines how many badges are required to battle the champion. If this value is non-zero, `requiredEmblemsForChamp` **should** be zero, as it implies that the event either doesn't have elites or that they're optional.
    - The `requiredEmblemsForChamp` field defines how many elite emblems are required to battle the champion. If this value is non-zero, `requiredBadgesForChamp` **should** be zero, as it means that the elites are required to reach the champion.
    - The `emblemWeight` field defines how many badges an elite emblem should count for. This should only be set to a value higher than 1 if `requiredEmblemsForChamp` is set to 0.
    - The `maxQueueSize` field defines how many challengers a leader can have in their queue at a given time. This should typically be large for in-person events and more restricted during online events.
    - The `maxQueuesPerChallenger` field defines how many leader queues a challenger can be in at once.
    - The `excludedBingoIds` field is an array of leader ID strings that defines what, if any, leaders should be excluded when constructing new bingo boards. This should be used in cases where multiple leaders have the same ace/Tera and you want to avoid collisions.
    - The `multiBingoIds` field is an array of leader ID strings that defines what, if any, multi-battle leaders should be given two separate entries on the bingo board. This will produce bingo board keys in the form of `[id]-1` and `[id]-2`, so any bingo board image files in the `/static` directory (explained below) for leaders in this field should be named appropriately.
    - The `sharedBingoIds` field is an object mapping leader IDs which have the same signature/Tera 'mon on the bingo board, so that any of them will count towards the bingo space. Any **values** in this object should be the IDs used for actual bingo board images.
    - The `supportsQueueState` field is a flag indicating whether the open/close queue functionality should be enabled for the PPL event. Typically, this should only be true for virtual events (i.e. PPL Online). If set to `false`, the `/openqueue`, `/closequeue`, and challenger-facing `/enqueue` paths will all be gated. **Note**: If this flag is set to `false`, *all leaders for the event* should have their `queue_open` field set to `1` in the database for normal functionality to work.
    - The `supportsBotNotifications` field is a flag indicating whether certain events should be forwarded to PPLBot for Discord notifications. Similar to the previous flag, this should typically only be true for virtual events.
    - The `meetupTimes` field is an array of JSON objects, each containing a `location`, a `startTime`, and a `duration` field. `location` should be a string describing the location (e.g. "Community Room" or "Handheld Lounge"),`startTime` should be a UTC timestamp, and `duration` should be a duration in minutes. Each entry in the array should describe a single meetup time.
    - The `bingoBoard` field is a boolean flag indicating whether the bingo board should be shown on the webapp for the current event.
    - The `howToChallenge` field is a boolean flag indicating whether a relative path for the "how to challenge" graphic will be included in the settings response payload.
    - The `rules` field is a boolean flag indicating whether a relative path for the rules graphic will be included in the settings response payload.
    - The `prizePools` field is a boolean flag indicating whether a relative path for the prizes graphic will be included in the settings response payload.
    - The `sideActivities` field is a boolean flag indicating whether a relative path for the side activities graphic will be included in the settings response payload.
    - The `schedule` field is a boolean flag indicating whether a relative path for the schedule graphic will be included in the settings response payload.
    - The `map` field is a boolean flag indicating whether a relative path for the map graphic will be included in the settings response payload.
5. Create a directory named `event` under the `config` directory and make additional copies of [config.js.example](config/config.js.example) for each PPL event listed in [config.js](config/config.js). These files only need to contain config values that need to be overridden from those in the general configs. **Note**: The *numerical* event config fields in `test.js` should match those in the example config for the tests to run successfully.
6. Create a directory named `static` in the root of the project for serving up static image files for clients. The directory can be empty, but it should exist for the express middleware that sets up the virtual `/static` path.
7. Run `node startup.js`, providing a `PPL_EVENT` environment variable if desired; if unspecified, it will pull from the `general.js` file you created in step 2. **Note**: This *may* require `sudo` to run, depending on the permissions on the cert path.

If everything is correctly configured, you should see a few log statements appear indicating that the API is running. You can validate it by using curl, a simple web browser (for the GET requests), or another tool of your choice.

[Back to top](#table-of-contents)

# API Documentation

**General note**: For all API paths detailed below, the `:id` param will **always** be a login ID (an 8-byte hex string), as will the `:challenger` param. The `:leader` param will **always** be a leader ID (a 6-byte hex string).

## Authentication APIs

#### /api/v2/register (POST)

Creates a new account with the provided username and password.  

##### Required headers:

- `Authorization` - Authentication header following the [Basic scheme](https://www.rfc-editor.org/rfc/rfc7617).
- `PPL-Event` - A string indicating the event this account is being registered for. Can be one of:
    - `east`
    - `west`
    - `aus`
    - `online`
- `Platform` - A string indicating the platform this request is coming from. Can be one of:
    - `web`
    - `android`
    - `ios`
**Note**: The `Platform` header is technically optional and will be populated as `none` if omitted or invalid, but it's necessary to provide for push notification functionality.

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

#### /api/v2/login (POST)

Logs a user in with the provided username and password.  

##### Required headers:

- `Authorization` - Authentication header following the [Basic scheme](https://www.rfc-editor.org/rfc/rfc2617#section-2).
- `PPL-Event` - A string indicating the event this account is being registered for. Can be one of:
    - `east`
    - `west`
    - `aus`
    - `online`
- `Platform` - A string indicating the platform this request is coming from. Can be one of:
    - `web`
    - `android`
    - `ios`
**Note**: The `Platform` header is technically optional and will be populated as `none` if omitted or invalid, but it's necessary to provide for push notification functionality.

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

#### /api/v2/logout/:id (POST)

Logs out a user and clears their session from the local cache. If no `Authorization` header is provided, this path simply does nothing rather than return an error.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

```json
{}
```

[Back to top](#table-of-contents)

## Challenger APIs

#### /api/v2/challenger/:id (GET)

Retrieves information about the challenger with the given ID.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

```json
{
    "id": [string],
    "displayName": [string],
    "winCount": [int],
    "lossCount": [int],
    "queuesEntered": [
        {
            "leaderId": [string],
            "leaderName": [string],
            "position": [int, 0-indexed]
            "linkCode": [string],
            "difficulty": [int, uses the leaderType constant],
            "format": [int, uses the battleFormat constant]
        },
        ...
    ],
    "queuesOnHold": [
        {
            "leaderId": [string],
            "leaderName": [string],
            "difficulty": [int, uses the leaderType constant],
            "format": [int, uses the battleFormat constant]
        },
        ...
    ],
    "badgesEarned": [
        {
            "leaderId": [string],
            "leaderName": [string],
            "badgeName": [string],
            "difficulty": [int, uses the leaderType constant],
            "format": [int, uses the battleFormat constant]
        },
        ...
    ],
    "championDefeated": [boolean],
    "championSurveyUrl": [string, only present if championDefeated flag is true],
    "feedbackSurveyUrl": [string, only present if appropriate based on configs],
    "hasBingo": [boolean]
}
```

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /api/v2/challenger/:id (PUT)

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

#### /api/v2/challenger/:id/bingoboard (GET)

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

#### /api/v2/challenger/:id/enqueue/:leader (POST)

Adds the challenger to the given leader's queue. This request performs a number of checks and can fail for a number of reasons, as detailed in the error responses section below.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `battleDifficulty` - The battle difficulty, as one of the [`leaderType` constant values](#leadertype).
- `battleFormat` - The battle format, as one of the [`battleFormat` constant values](#battleformat).

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
- HTTP 403 (FORBIDDEN) - Returned if the event doesn't support queue state.
- HTTP 404 (NOT FOUND) - Returned if either of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /api/v2/challenger/:id/dequeue/:leader (DELETE)

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

#### /api/v2/challenger/:id/hold/:leader (POST)

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

#### /api/v2/leader/:id (GET)

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
    "battleFormat": [int, uses the battleFormat constant],
    "badgeName": [string],
    "queueOpen": [boolean],
    "duoMode": [boolean],
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
            "difficulty": [int, uses the leaderType constant],
            "format": [int, uses the battleFormat constant]
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

#### /api/v2/leader/:id/openqueue (POST)

Flags the leader's queue as open, allowing challengers to join it or be added to it.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `duoMode` - A boolean flag indicating whether to open the queue in duo mode (multi-battle). This should **only** be passed as `true` if the leader supports multi-battles as one of their battle formats. If omitted, it will be treated as `false`.

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 403 (FORBIDDEN) - Returned if the event doesn't support queue state.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /api/v2/leader/:id/closequeue (POST)

Flags the leader's queue as closed, preventing challengers from joining it or being added to it.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 403 (FORBIDDEN) - Returned if the event doesn't support queue state.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /api/v2/leader/:id/enqueue/:challenger (POST)

Adds the given challenger to the leader's queue. This request performs a number of checks and can fail for a number of reasons, as detailed in the error responses section below.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `battleDifficulty` - The battle difficulty, as one of the [`leaderType` constant values](#leadertype).
- `battleFormat` - The battle format, as one of the [`battleFormat` constant values](#battleformat).

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

#### /api/v2/leader/:id/dequeue/:challenger (DELETE)

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

#### /api/v2/leader/:id/report/:challenger (POST)

Reports a match result for the given challenger. This path tracks the battle result and whether a badge was awarded separately to improve the accuracy of battle statistics.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `challengerWin` - A boolean flag indicating whether the challenger won the match.
- `badgeAwarded` - A boolean flag indicating whether the challenger was awarded a badge.

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the given challenger ID isn't in the leader's queue.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if either of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /api/v2/leader/:id/report/:challenger/:otherChallenger (POST)

Reports a match result for the given challenger pair, for use when a leader is running their queue in duo mode with multi-battles. This path tracks the battle result and whether a badge was awarded separately to improve the accuracy of battle statistics.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `challengerWin` - A boolean flag indicating whether the challenger won the match.
- `badgeAwarded` - A boolean flag indicating whether the challenger was awarded a badge.

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if either of the given challenger IDs aren't in the leader's queue.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if any of the given IDs don't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /api/v2/leader/:id/hold/:challenger (POST)

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

#### /api/v2/leader/:id/unhold/:challenger (POST)

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

#### /api/v2/leader/:id/live (POST)

Notifies the API that the leader is streaming on Twitch. This endpoint should only be used for PPL Online events.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Response payload:

See: Response payload for [/leader/:id (GET)](#leaderid-get).

##### Possible error responses:

- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 404 (NOT FOUND) - Returned if the given ID doesn't exist in the database.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /api/v2/leader/:id/allchallengers (GET)

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

## Push APIs

#### /api/v2/push/:id/enable (POST)

Enables push notifications on the given login for a device specified by other request parameters. This path should only be used by mobile platforms that support push notifications (e.g. Android and iOS). It is currently **untested** and **unstable**, and the body params and response payload are still subject to change.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `pushToken` - The device's push token, as a string.

##### Response payload:

```json
{}
```

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the push token is omitted from the request body.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /api/v2/push/:id/disable (POST)

Disables push notifications on the given login for a device specified by other request parameters. This path should only be used by mobile platforms that support push notifications (e.g. Android and iOS). It is currently **untested** and **unstable**, and the body params and response payload are still subject to change.

##### Required headers:

- `Authorization` - Authentication header following the [Bearer scheme](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

##### Body params:

- `pushToken` - The device's push token, as a string.

##### Response payload:

```json
{}
```

##### Possible error responses:

- HTTP 400 (BAD REQUEST) - Returned if the push token is omitted from the request body.
- HTTP 401 (UNAUTHORIZED) - Returned if the authentication header is omitted or malformed.
- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

[Back to top](#table-of-contents)

## Unauthenticated APIs

#### /api/v2/metrics (GET)

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

#### /api/v2/appsettings (GET)

Retrieves a collection of event-specific settings.

##### Response payload:

```json
{
    "showTrainerCard": [boolean, based on the trainer card show date config entry],
    "eventIsOver": [boolean, based on the event end date config entry],
    "eventSupportsQueueState": [boolean, indicates whether leaders should be able to open/close queues],
    "leadersToDefeat": [int, DEPRECATED, specifies the number of badges required to face elites],
    "elitesToDefeat": [int, DEPRECATED, specifies the number of elite emblems required to face the champ],
    "leagueFormat": {
        "badgesForElites": [int, specifies the number of badges required to face elites],
        "emblemsForChamp": [int, specifies the number of elite emblems required to face the champ],
        "badgesForChamp": [int, specifies the number of badges required to face the champ for no-elite/elite-optional formats],
        "emblemWeight": [int, specifies how many badges elite emblems should count as when badgesForChamp is non-zero]
    },
    "meetupTimes": [
        {
            "location": [string, the location name for a meetup],
            "startTime": [string, the start time of the meetup as a UTC timestamp],
            "duration": [int, the duration of the meetup in minutes]
        },
        ...
    ],
    "bingoBoard": [boolean, indicates whether the webapp should display the bingo board to challengers],
    "assets": {
        "howToChallenge": [string, URL for the how to challenge graphic],
        "rules": [string, URL for the rules graphic],
        "prizePools": [string, URL for the prizes graphic],
        "sideActivities": [string, URL for the side activities graphic],
        "schedule": [string, URL for the schedule graphic],
        "map": [string, URL for the map graphic]
    }
}
```

##### Possible error responses:

- HTTP 500 (SERVER ERROR) - Returned if a database error occurs.

#### /api/v2/openqueues (GET)

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

#### /api/v2/badges/:id (GET)

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

#### /api/v2/loginfo (POST)

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

#### /api/v2/logwarning (POST)

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

#### /api/v2/logerror (POST)

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

The [constants.js](util/constants.js) file contains the following constant definitions:

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
    "unsupportedDifficulty": 15,
    "unsupportedFormat": 16,
    "unsupportedPushPlatform": 17,
    "tokenAlreadyRegistered": 18,
    "tokenNotRegistered": 19,
    "queueAlreadyOpen": 20,
    "queueAlreadyClosed": 21,
    "duoModeNotSupported": 22,
    "notInDuoMode": 23,
    "inDuoMode": 24,
    "notEnoughChallengers": 25,
    "queueStateNotSupported": 26,
    "usernameTooShort": 27,
    "usernameTooLong": 28
}
```

#### leaderType

These are used to identify what battle difficulties a leader supports, and will both be returned in some payloads and expected as parameters in some requests. While this constant is a bitmask, only the first **three** values (`casual`, `intermediate`, `veteran`) will ever be masked together; `elite` and `champion` should never be combined with other values.

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

These are used to identify what battle formats a leader supports, and will both be returned in some payloads and expected as parameters in some requests. This constant is a bitmask, as leaders can support multiple battle formats.

```json
{
    "singles": 1,
    "doubles": 2,
    "multi": 4,
    "special": 8
}
```

#### matchStatus

These are used to identify the current status of a match in the matches database table, and are only used **internally** to the API. Results are from the **challenger perspective** - `loss` refers to a challenger loss, and `win` a challenger win. `ash` and `gary` are special results for when a match is lost but a badge is awarded, or a match is won but a badge is **not** awarded (e.g. due to bad sportsmanship), respectively.

```json
{
    "inQueue": 0,
    "onHold": 1,
    "loss": 2,
    "win": 3,
    "ash": 4,
    "gary": 5
}
```

#### queueStatus

These are used to identify the current status of a leader's queue, and are only used **internally** to the API. While far from necessary, this constant helps keep the code more readable.

```json
{
    "closed": 0,
    "open": 1
}
```

#### pplEvent

These are used to identify what PAX event(s) a login is associated with, and are only used **internally** to the API. This constant is a bitmask, as users can and often do attend multiple events. It's mapped to the string values passed in the PPL-Event header expected in some requests.

```json
{
    "east": 1,
    "west": 2,
    "aus": 4,
    "online": 8
}
```

#### httpStatus

These are used as a mapping for the subset of HTTP status codes that can be returned, and are only used **internally** to the API. This mapping should be expanded if any additional status codes are ever used.

```json
{
    "ok": 200,
    "badRequest": 400,
    "unauthorized": 401,
    "forbidden": 403,
    "notFound": 404,
    "serverError": 500
}
```

#### requestType

These are used to identify the type of request for permissioning when validating a session. Requests with type `challenger` will be rejected for leader logins, requests with type `leader` will be rejected for challenger logins, and requests with type `universal` will be allowed for both login types.

```json
{
    "challenger": 0,
    "leader": 1,
    "universal": 2
}
```

#### platformType

These are used to identify the platform a request is coming from. They're mapped from the `Platform` header in login and register requests, with `none` being used if the header is missing or an invalid value is provided.

```json
{
    "none": -1,
    "web": 0,
    "android": 1,
    "ios": 2
}
```

#### websocketAction

These are used to identify the action being sent along a websocket connection for real-time update support. `authenticate` and `confirm` are both part of the handshake process and `refreshData` is currently the only supported RTU action.

```json
{
    "authenticate": 0,
    "confirm": 1,
    "refreshData": 2,
    "refreshBingo": 3
}
```

[Back to top](#table-of-contents)
# Websockets

To support real-time updates within the webapp without requiring a full page refresh, this API allows clients to establish secure websocket connections over which they can receive poke payloads notifying them that the queue status for a logged-in user has changed through someone else's actions. For example:

* A challenger's queue updating itself when a leader finishes a battle.
* A leader's queue updating itself when a challenger joins, leaves, or places themselves on hold.

And so on. As the socket connections **must** be authenticated, an additional step beyond the simple handshake needs to be completed as part of the connection flow. Implementing clients should do the following steps:

1. Make a request using any websocket library to the base URL and port for the API, but with the `wss://` protocol (`ws://` if the API is being served over HTTP and not HTTPS).
2. Configure the `message` event listener to parse the data into a JSON object.
3. Handle each action as defined by the [websocketAction constant](#websocketaction) as follows:
   * `authenticate`: Send a stringified JSON blob to the server over the websocket containing the `action` field (echoed back), an `id` field populated with the user's login ID, and a `token` field populated with the user's session token (including the `Bearer ` prefix that you would include in API request headers).
   * `confirm`: No action needed; this message is simply confirmation from the server that the authentication payload was valid.
   * `refreshData`: Pull the latest challenger or leader info payload from the API, depending on whether the logged in user is a challenger or a leader, and update any parts of the UI that need to be updated.
   * `refreshBingo`: Pull the latest bingo board data from the API and update that view. **Note:** This will only be sent to challengers, and should only be acted on if the bingo board view is currently open.

**All** messages sent from the server over websockets will be stringified JSON blobs that contain an `action` property with a value defined by the constant above. At present, no other fields will be included in any of the payloads, but the JSON format offers the flexibility to add them in the future if needed.

[Back to top](#table-of-contents)

# Tests

This project currently contains six test suites in the /tests directory - three that run on the database module directly, and three that instantiate an instance of the API and run against that instead. The database test suites currently have full coverage of *all* functions exposed by the module, and the API test suites cover all but three paths (/register, /logview, and /logview/:daysago). Coverage should be sufficient to help find bugs in both the API and database modules before they make it to production.

The six suites are:

- [db-general.js](tests/db-general.js) - A database test suite covering general database functions, such as registration, login, and pulling down the list of challengers for a given event.
- [db-challenger.js](tests/db-challenger.js) - A database test suite covering challenger-oriented database functions, such as modifying the display name and joining leader queues.
- [db-leader.js](tests/db-leader.js) - A database test suite covering leader-oriented database functions, such as opening/closing the queue, adding challengers, and reporting match results.
- [api-general.js](tests/api-general.js) - An API test suite covering general, unauthenticated API paths. This suite covers mostly covers API paths that don't interact with the database.
- [api-challenger.js](tests/api-challenger.js) - An API test suite covering challenger-oriented API paths. This suite has roughly the same coverage as the db-challenger.js suite.g match results.
- [api-leader.js](tests/api-leader.js) - An API test suite covering leader-oriented API paths. This suite has roughly the same coverage as the db-leader.js suite.

As documented at the top of each test suite file, they're all intended to be run with certain environment variables which modify the behavior of the logging module and what database tables the tests should be performed on. The [db.sh](tests/db.sh) and [api.sh](tests/api.sh) shell scripts will run each set of suites in sequence with the correct environment variables, pausing in between each run for validation of the results. The tests are intended to work off of a separate set of database tables, suffixed with `_test`, and pre-populated with the queries found in [baseline.sql](tests/baseline.sql). While each suite is designed to perform cleanup of any database changes it makes, the test tables *can* get out of sync with the baseline if certain tests or cleanup steps fail, so rerunning the baseline may be necessary in case of unexpected errors. This can be performed easily by running `node db-reset.js` in the tests directory.

[Back to top](#table-of-contents)
