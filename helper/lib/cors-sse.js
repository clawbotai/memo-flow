'use strict';

const { DEFAULT_ALLOWED_ORIGINS, SSE_HEARTBEAT_INTERVAL_MS } = require('./constants');

function parseAllowedOrigins() {
  const configured = String(process.env.MEMOFLOW_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

const ALLOWED_ORIGINS = parseAllowedOrigins();

function getRequestOrigin(req) {
  const origin = req.headers.origin;
  return typeof origin === 'string' ? origin : '';
}

function isAllowedOrigin(origin) {
  return !!origin && ALLOWED_ORIGINS.has(origin);
}

function buildCorsHeaders(req) {
  const origin = getRequestOrigin(req);
  if (!isAllowedOrigin(origin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function assertTrustedOrigin(req) {
  const origin = getRequestOrigin(req);
  if (!origin || isAllowedOrigin(origin)) {
    return;
  }

  const error = new Error('不受信任的请求来源');
  error.statusCode = 403;
  throw error;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
    ...(res.__memoFlowCorsHeaders || {}),
  });
  res.end(body);
}

function writeSse(res, data) {
  if (res.writableEnded || res.destroyed) {
    return false;
  }

  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function openSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    ...(res.__memoFlowCorsHeaders || {}),
  });
  res.write('retry: 3000\n');
  res.write(': connected\n\n');
  return setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      return;
    }

    try {
      res.write(': heartbeat\n\n');
    } catch {}
  }, SSE_HEARTBEAT_INTERVAL_MS);
}

module.exports = {
  ALLOWED_ORIGINS,
  getRequestOrigin,
  isAllowedOrigin,
  buildCorsHeaders,
  assertTrustedOrigin,
  sendJson,
  writeSse,
  openSse,
};
