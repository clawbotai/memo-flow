'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { CONTENT_DRAFTS_FILE } = require('../constants');
const { buildRedbookPrompt } = require('./content-prompts');
const { requestLanguageModelText, tryParseJsonBlock } = require('./llm-provider');

function getContentDraftsPath(savedPath) {
  if (!savedPath) {
    throw new Error('当前转录记录缺少保存目录，无法处理内容草稿');
  }
  return path.join(path.resolve(String(savedPath)), CONTENT_DRAFTS_FILE);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => normalizeText(tag).replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeDraft(input, fallback = {}) {
  const content = normalizeText(input?.content);
  if (!content) {
    throw new Error('生成内容为空');
  }

  const now = new Date().toISOString();
  return {
    id: normalizeText(input?.id) || fallback.id || `draft_${randomUUID().slice(0, 8)}`,
    platform: fallback.platform || input?.platform || 'redbook',
    title: normalizeText(input?.title) || undefined,
    content,
    tweets: Array.isArray(input?.tweets)
      ? input.tweets.map((tweet) => normalizeText(tweet)).filter(Boolean)
      : undefined,
    tags: normalizeTags(input?.tags),
    sourcePointIds: Array.isArray(fallback.sourcePointIds) ? fallback.sourcePointIds : [],
    version: Number.isFinite(fallback.version) ? fallback.version : 1,
    editedByUser: Boolean(
      typeof input?.editedByUser === 'boolean' ? input.editedByUser : fallback.editedByUser,
    ),
    status: fallback.status || input?.status || 'ready',
    createdAt: fallback.createdAt || now,
    updatedAt: fallback.updatedAt || normalizeText(input?.updatedAt) || now,
  };
}

function normalizeDraftCollection(input) {
  const sourceDrafts = input?.drafts && typeof input.drafts === 'object' ? input.drafts : {};
  const drafts = {};

  if (sourceDrafts.redbook) {
    drafts.redbook = normalizeDraft(sourceDrafts.redbook, {
      id: sourceDrafts.redbook.id,
      platform: 'redbook',
      sourcePointIds: sourceDrafts.redbook.sourcePointIds,
      version: sourceDrafts.redbook.version,
      createdAt: sourceDrafts.redbook.createdAt,
      updatedAt: sourceDrafts.redbook.updatedAt,
      editedByUser: sourceDrafts.redbook.editedByUser,
      status: sourceDrafts.redbook.status,
    });
  }

  if (sourceDrafts.twitter) {
    drafts.twitter = normalizeDraft(sourceDrafts.twitter, {
      id: sourceDrafts.twitter.id,
      platform: 'twitter',
      sourcePointIds: sourceDrafts.twitter.sourcePointIds,
      version: sourceDrafts.twitter.version,
      createdAt: sourceDrafts.twitter.createdAt,
      updatedAt: sourceDrafts.twitter.updatedAt,
      editedByUser: sourceDrafts.twitter.editedByUser,
      status: sourceDrafts.twitter.status,
    });
  }

  return {
    drafts,
    updatedAt: normalizeText(input?.updatedAt) || new Date().toISOString(),
  };
}

async function generatePlatformContent(record, selectedPoints, platform, providerId, modelId, existingDraft) {
  if (platform !== 'redbook') {
    throw new Error('Phase 1 暂不支持该平台');
  }

  const prompt = buildRedbookPrompt(record, selectedPoints);
  const { text, model, modelId: resolvedModelId, providerName } = await requestLanguageModelText(providerId, modelId, prompt, {
    temperatureCap: 0.8,
  });

  const parsed = tryParseJsonBlock(text);
  const draft = normalizeDraft(parsed, {
    platform,
    sourcePointIds: selectedPoints.map((point) => point.id),
    version: (existingDraft?.version || 0) + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return {
    draft,
    generator: {
      providerId,
      providerName,
      modelId: resolvedModelId,
      model,
    },
  };
}

async function saveContentDraft(savedPath, draft) {
  const directoryPath = path.resolve(String(savedPath));
  const draftsPath = getContentDraftsPath(directoryPath);
  let existing = { drafts: {}, updatedAt: new Date().toISOString() };

  try {
    existing = await loadContentDrafts(directoryPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const normalizedDraft = normalizeDraft(draft, {
    id: draft.id,
    platform: draft.platform,
    sourcePointIds: draft.sourcePointIds,
    version: draft.version,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    editedByUser: draft.editedByUser,
    status: draft.status,
  });

  const nextCollection = {
    drafts: {
      ...existing.drafts,
      [normalizedDraft.platform]: normalizedDraft,
    },
    updatedAt: new Date().toISOString(),
  };

  await fsp.mkdir(directoryPath, { recursive: true });
  await fsp.writeFile(draftsPath, JSON.stringify(nextCollection, null, 2), 'utf8');
  return {
    path: draftsPath,
    collection: nextCollection,
    draft: normalizedDraft,
  };
}

async function loadContentDrafts(savedPath) {
  const raw = await fsp.readFile(getContentDraftsPath(savedPath), 'utf8');
  return normalizeDraftCollection(JSON.parse(raw));
}

module.exports = {
  getContentDraftsPath,
  normalizeDraftCollection,
  generatePlatformContent,
  saveContentDraft,
  loadContentDrafts,
};
