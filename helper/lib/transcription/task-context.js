'use strict';

const fsp = require('fs/promises');
const state = require('../state');

function createTaskContext(taskId) {
  const controller = new AbortController();
  const context = {
    id: taskId,
    controller,
    cancelled: false,
    children: new Set(),
    tempFiles: new Set(),
  };
  state.activeTasks.set(taskId, context);
  return context;
}

function getTaskContext(taskId) {
  return state.activeTasks.get(taskId) || null;
}

function throwIfCancelled(context) {
  if (context?.cancelled || context?.controller.signal.aborted) {
    const error = new Error('任务已取消');
    error.code = 'TASK_CANCELLED';
    throw error;
  }
}

async function cancelTask(taskId) {
  const context = getTaskContext(taskId);
  if (!context) return false;
  context.cancelled = true;
  context.controller.abort();
  for (const child of context.children) {
    try {
      child.kill();
    } catch {}
  }
  state.activeTasks.delete(taskId);
  return true;
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {}
}

async function cleanupTaskContext(context) {
  if (!context) return;
  for (const filePath of context.tempFiles) {
    await safeUnlink(filePath);
  }
  state.activeTasks.delete(context.id);
}

module.exports = {
  createTaskContext,
  getTaskContext,
  throwIfCancelled,
  cancelTask,
  safeUnlink,
  cleanupTaskContext,
};
