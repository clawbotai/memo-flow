'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { WHISPER_TIMEOUT_MS } = require('../constants');
const { normalizeWhisperThreads } = require('../config');
const { buildExecOptions, resolveConfigPath } = require('../runtime/path-utils');
const {
  createWhisperOutputParser,
  parseSrtSegments,
  sanitizeDirName,
  writeTranscriptTextFiles,
} = require('./segments');

async function downloadFile(sourceUrl, targetPath, signal) {
  const response = await fetch(sourceUrl, { signal });
  if (!response.ok) {
    throw new Error(`下载音频失败 (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(targetPath, buffer);
}

async function convertToWav(inputPath, ffmpegPath, context) {
  const wavPath = inputPath.replace(path.extname(inputPath), '.wav');
  context.tempFiles.add(wavPath);

  await new Promise((resolve, reject) => {
    const child = spawn(
      resolveConfigPath(ffmpegPath) || ffmpegPath,
      ['-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', wavPath],
      buildExecOptions(ffmpegPath),
    );

    context.children.add(child);
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 2000) stderr = stderr.slice(-2000);
    });

    child.on('close', (code, signal) => {
      context.children.delete(child);
      if (context.cancelled) {
        reject(new Error('任务已取消'));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      const reason = code !== null ? `退出码: ${code}` : `信号: ${signal}`;
      reject(new Error(`ffmpeg 转换失败，${reason}\n${stderr.trim()}`));
    });

    child.on('error', (error) => {
      context.children.delete(child);
      reject(error);
    });
  });

  return wavPath;
}

async function runWhisperStreaming(
  wavPath,
  config,
  whisperExecutablePath,
  context,
  onSegment,
  onProgress,
) {
  const srtPath = `${wavPath}.srt`;
  context.tempFiles.add(srtPath);
  const parser = createWhisperOutputParser({ onSegment, onProgress });
  const threads = normalizeWhisperThreads(config.threads);

  await new Promise((resolve, reject) => {
    const child = spawn(
      resolveConfigPath(whisperExecutablePath) || whisperExecutablePath,
      [
        '-m',
        resolveConfigPath(config.modelPath),
        '-f',
        wavPath,
        '-l',
        'zh',
        '-t',
        String(threads),
        '--print-progress',
        '--output-srt',
        '-ng',
      ],
      buildExecOptions(whisperExecutablePath),
    );

    context.children.add(child);
    let errorOutput = '';
    let isTimedOut = false;

    const timeout = setTimeout(() => {
      isTimedOut = true;
      try {
        child.kill();
      } catch {}
    }, WHISPER_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      parser.push(chunk.toString());
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      errorOutput += text;
      if (errorOutput.length > 2000) errorOutput = errorOutput.slice(-2000);
      parser.push(text);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      context.children.delete(child);
      parser.flush();
      if (context.cancelled) {
        reject(new Error('任务已取消'));
        return;
      }
      if (isTimedOut) {
        reject(new Error('whisper 转录超时'));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      const reason = code !== null ? `退出码: ${code}` : `信号: ${signal}`;
      reject(new Error(`whisper 进程退出，${reason}\n${errorOutput.trim()}`));
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      context.children.delete(child);
      reject(error);
    });
  });

  return srtPath;
}

async function saveTranscriptionResult(record, transcript, segments, meta, preferredDir) {
  const outputRoot = resolveConfigPath(preferredDir);
  const episodeDir = record.savedPath || path.join(outputRoot, sanitizeDirName(record.title));
  return writeTranscriptTextFiles(episodeDir, segments, transcript, meta);
}

module.exports = {
  downloadFile,
  convertToWav,
  runWhisperStreaming,
  saveTranscriptionResult,
  parseSrtSegments,
};
