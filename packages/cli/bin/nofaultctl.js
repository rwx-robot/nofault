#!/usr/bin/env node
'use strict';
const { run } = require('../dist/cli.js');
process.exitCode = run(process.argv.slice(2)).exitCode;