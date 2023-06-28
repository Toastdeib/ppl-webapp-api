#!/bin/bash

TEST_RUN=true TABLE_SUFFIX=_test PPL_EVENT=test node db-general.js
echo "Tests complete; Press a to abort or any other key to continue..."
read -s -n 1 k <&1
if [[ $k = a ]] ; then
exit 0
fi
echo
TEST_RUN=true TABLE_SUFFIX=_test PPL_EVENT=test node db-challenger.js
echo "Tests complete; Press a to abort or any other key to continue..."
read -s -n 1 k <&1
if [[ $k = a ]] ; then
exit 0
fi
echo
TEST_RUN=true TABLE_SUFFIX=_test PPL_EVENT=test node db-leader.js
