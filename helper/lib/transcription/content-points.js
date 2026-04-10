'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { CONTENT_POINTS_FILE } = require('../constants');
const { buildPointExtractionPrompt } = require('./content-prompts');
const { requestLanguageModelText, tryParseJsonBlock } = require('./llm-provider');

function getContentPointsPath(savedPath) {
  if (!savedPath) {
    throw new Error('当前转录记录缺少保存目录，无法处理观点结果');
  }
  return path.join(path.resolve(String(savedPath)), CONTENT_POINTS_FILE);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePoint(input, type) {
  const text = normalizeText(input?.text);
  if (!text) {
    return null;
  }

  return {
    id: normalizeText(input?.id) || `pt_${randomUUID().slice(0, 8)}`,
    type,
    text,
    sourceText: normalizeText(input?.sourceText) || undefined,
    sourceTimestamp: normalizeText(input?.sourceTimestamp) || undefined,
    selected: Boolean(input?.selected),
  };
}

function normalizePointList(list, type) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((item) => normalizePoint(item, type))
    .filter(Boolean);
}

function normalizePointExtractionResult(input) {
  const normalizedPointArray = Array.isArray(input?.points)
    ? input.points
        .map((point) => normalizePoint(point, point?.type))
        .filter(Boolean)
    : null;

  const points = normalizedPointArray && normalizedPointArray.length > 0
    ? normalizedPointArray
    : [
        ...normalizePointList(input?.viralPoints || input?.viral || [], 'viral'),
        ...normalizePointList(input?.controversialPoints || input?.controversial || [], 'controversial'),
        ...normalizePointList(input?.quotes || input?.quotePoints || [], 'quote'),
      ];

  if (!points.length) {
    throw new Error('观点提炼结果为空');
  }

  return {
    theme: normalizeText(input?.theme) || undefined,
    points,
    updatedAt: normalizeText(input?.updatedAt) || new Date().toISOString(),
  };
}

async function extractContentPoints(record, provider) {
  const prompt = buildPointExtractionPrompt(record);
  const { text, model } = await requestLanguageModelText(provider, prompt, {
    temperatureCap: 0.5,
  });

  const parsed = tryParseJsonBlock(text);
  return {
    result: normalizePointExtractionResult(parsed),
    generator: {
      provider,
      model,
    },
  };
}

async function saveContentPoints(savedPath, result) {
  const directoryPath = path.resolve(String(savedPath));
  const pointsPath = getContentPointsPath(directoryPath);
  const normalized = normalizePointExtractionResult(result);
  await fsp.mkdir(directoryPath, { recursive: true });
  await fsp.writeFile(pointsPath, JSON.stringify(normalized, null, 2), 'utf8');
  return {
    path: pointsPath,
    result: normalized,
  };
}

async function loadContentPoints(savedPath) {
  const raw = await fsp.readFile(getContentPointsPath(savedPath), 'utf8');
  return normalizePointExtractionResult(JSON.parse(raw));
}

module.exports = {
  getContentPointsPath,
  normalizePointExtractionResult,
  extractContentPoints,
  saveContentPoints,
  loadContentPoints,
};
