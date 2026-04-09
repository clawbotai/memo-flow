'use strict';

const { ANSI_REGEX } = require('./constants');

function normalizeLineBreaks(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripAnsi(text) {
  return text.replace(ANSI_REGEX, '');
}

module.exports = { normalizeLineBreaks, stripAnsi };
