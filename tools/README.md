# PPL Webapp API Tools

## Table of Contents

- [Test DB Reset Tool](#test-db-reset-tool)
- [Populate Leader Data Tool](#populate-leader-data-tool)

# Test DB Reset Tool

[db-reset.js](tools/db-reset.js) is a tool for resetting the test database back to the baseline defined in [baseline.sql](tests/baseline.sql). If the tests ever fail in strange or unexpected ways, you can use this tool to ensure that the actual data isn't the problem. It's also helpful if you're setting up an entirely new database environment.

The tool should be run via the [reset.sh](tools/reset.sh) shell script so that the `TEST_RUN` environment variable is properly set and no logs are written to file.

Example usage: `./reset.sh`

# Populate Leader Data Tool

[populate-leaders.js](tools/populate-leaders.js) is a tool for bulk loading leader data into the leaders table from a .tsv file to help reduce the amount of manual work involved in setting up a new PPL event. The tool expects three parameters:

- An input file, which must be a .tsv file (structure detailed below)
- A database table suffix, which will be appended to `ppl_webapp_leaders` in the `INSERT` statements (**note:** this tool doesn't create the table, it must already exist)
- A flag for whether the event supports queue state, either `true` or `false` (typically, this should only be `true` for PPL Online events)

The tool handles generating the leader IDs for each row it inserts and prints them to the output as each row is inserted. It should be run via the [load.sh](tools/load.sh) shell script so that the `TEST_RUN` environment variable is properly set and no logs are written to file.

Example usage: `./load.sh leader-data.tsv _load false`

### Import File Structure

A .tsv file used for the import **must** have exactly 6 columns, in the order specified below. Those columns are:

- Full leader name, including the epithet (e.g. "Leopold, the Masterful Magician")
- Leader difficulty, as a numerical value defined by the `leaderType` bitmask
- Battle format, as a numerical value defined by the `battleFormat` bitmask
- Badge name
- Leader bio
- Leader tagline
