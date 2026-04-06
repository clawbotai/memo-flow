/**
 * 千问 Qwen ASR 在线语音识别模块
 *
 * - `qwen3-asr-flash` 适合 5 分钟内短音频，支持 SSE 流式输出
 * - `qwen3-asr-flash-filetrans` 适合长音频，使用异步任务轮询
 */

import type { OnlineASRConfig, TranscribeSegment } from '@/types';

interface QwenASRCallbacks {
  onText: (text: string) => void;
  onProgress: (percent: number) => void;
  onError?: (error: Error) => void;
}

export interface QwenASRResult {
  segments: TranscribeSegment[];
  transcript: string;
  cancelled: boolean;
}

interface DashScopeSSEData {
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{
          text?: string;
        }>;
      };
      finish_reason?: string;
    }>;
    finish_reason?: string;
  };
  request_id?: string;
  code?: string;
  message?: string;
}

interface DashScopeTaskSubmitResponse {
  output?: {
    task_id?: string;
  };
  code?: string;
  message?: string;
}

interface DashScopeTaskQueryResponse {
  output?: {
    task_status?: string;
    code?: string;
    message?: string;
    result?: {
      transcription_url?: string;
    };
  };
  code?: string;
  message?: string;
}

interface DashScopeSentence {
  text?: string;
  begin_time?: number;
  end_time?: number;
  sentence_begin_time?: number;
  sentence_end_time?: number;
}

interface DashScopeTranscriptItem {
  text?: string;
  sentences?: DashScopeSentence[];
}

class DashScopeApiError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = 'DashScopeApiError';
    this.status = options?.status;
    this.code = options?.code;
  }
}

const FILETRANS_MODEL = 'qwen3-asr-flash-filetrans';
const DEFAULT_FLASH_MODEL = 'qwen3-asr-flash';
const FILETRANS_POLL_INTERVAL_MS = 2000;
const FILETRANS_TIMEOUT_MS = 20 * 60 * 1000;

export async function transcribeWithQwenASR(
  audioUrl: string,
  config: OnlineASRConfig,
  callbacks: QwenASRCallbacks,
  abortSignal?: AbortSignal,
): Promise<QwenASRResult> {
  if (!config.apiKey) {
    throw new Error('千问 ASR API Key 未配置，请在设置中填写');
  }

  const requestedModel = (config.modelName || FILETRANS_MODEL).trim();

  if (requestedModel === FILETRANS_MODEL) {
    return transcribeWithQwenFileTrans(audioUrl, config, callbacks, abortSignal);
  }

  try {
    return await transcribeWithQwenFlash(audioUrl, config, callbacks, abortSignal);
  } catch (error) {
    if (shouldFallbackToFileTrans(error, requestedModel)) {
      callbacks.onProgress(10);
      return transcribeWithQwenFileTrans(
        audioUrl,
        {
          ...config,
          modelName: FILETRANS_MODEL,
        },
        callbacks,
        abortSignal,
      );
    }

    throw error;
  }
}

async function transcribeWithQwenFlash(
  audioUrl: string,
  config: OnlineASRConfig,
  callbacks: QwenASRCallbacks,
  abortSignal?: AbortSignal,
): Promise<QwenASRResult> {
  const apiEndpoint = `${normalizeBaseUrl(config.baseUrl)}/services/aigc/multimodal-generation/generation`;
  const requestBody = {
    model: config.modelName || DEFAULT_FLASH_MODEL,
    input: {
      messages: [
        {
          role: 'system',
          content: [{ text: '' }],
        },
        {
          role: 'user',
          content: [{ audio: audioUrl }],
        },
      ],
    },
    parameters: {
      asr_options: {
        enable_itn: config.enableITN ?? true,
      },
      incremental_output: true,
    },
  };

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-SSE': 'enable',
    },
    body: JSON.stringify(requestBody),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw await buildDashScopeApiError(response);
  }

  return parseSSEStream(response, callbacks, abortSignal);
}

async function transcribeWithQwenFileTrans(
  audioUrl: string,
  config: OnlineASRConfig,
  callbacks: QwenASRCallbacks,
  abortSignal?: AbortSignal,
): Promise<QwenASRResult> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const submitResponse = await fetch(`${baseUrl}/services/audio/asr/transcription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: FILETRANS_MODEL,
      input: {
        file_url: audioUrl,
      },
      parameters: {
        channel_id: [0],
        enable_itn: config.enableITN ?? true,
        enable_words: true,
      },
    }),
    signal: abortSignal,
  });

  if (!submitResponse.ok) {
    throw await buildDashScopeApiError(submitResponse);
  }

  const submitPayload = (await submitResponse.json()) as DashScopeTaskSubmitResponse;
  const taskId = submitPayload.output?.task_id;

  if (!taskId) {
    throw new Error(submitPayload.message || '千问 ASR 任务提交失败，未返回 task_id');
  }

  callbacks.onProgress(15);

  const startedAt = Date.now();
  let queryProgress = 20;

  while (true) {
    if (abortSignal?.aborted) {
      return { segments: [], transcript: '', cancelled: true };
    }

    if (Date.now() - startedAt > FILETRANS_TIMEOUT_MS) {
      throw new Error('千问 ASR 长音频转录超时，请稍后重试');
    }

    await sleep(FILETRANS_POLL_INTERVAL_MS, abortSignal);

    const queryResponse = await fetch(`${baseUrl}/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      signal: abortSignal,
    });

    if (!queryResponse.ok) {
      throw await buildDashScopeApiError(queryResponse);
    }

    const queryPayload = (await queryResponse.json()) as DashScopeTaskQueryResponse;
    const status = (queryPayload.output?.task_status || '').toUpperCase();
    const code = queryPayload.output?.code || queryPayload.code;
    const message = queryPayload.output?.message || queryPayload.message;

    if (code) {
      throw new DashScopeApiError(
        `千问 ASR 错误 [${code}]: ${message || '未知错误'}`,
        { code },
      );
    }

    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(message || '千问 ASR 长音频转录失败');
    }

    if (status === 'SUCCEEDED') {
      callbacks.onProgress(90);

      const transcriptionUrl = queryPayload.output?.result?.transcription_url;
      if (!transcriptionUrl) {
        throw new Error('千问 ASR 转录完成，但未返回 transcription_url');
      }

      const resultResponse = await fetch(transcriptionUrl, {
        signal: abortSignal,
      });

      if (!resultResponse.ok) {
        throw new Error(`下载千问 ASR 转录结果失败 (${resultResponse.status})`);
      }

      const resultPayload = (await resultResponse.json()) as unknown;
      const { transcript, segments } = buildResultFromFileTransPayload(resultPayload);

      if (transcript) {
        callbacks.onText(transcript);
      }
      callbacks.onProgress(100);

      return {
        transcript,
        segments,
        cancelled: false,
      };
    }

    queryProgress = Math.min(queryProgress + 8, 80);
    callbacks.onProgress(queryProgress);
  }
}

async function parseSSEStream(
  response: Response,
  callbacks: QwenASRCallbacks,
  abortSignal?: AbortSignal,
): Promise<QwenASRResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullTranscript = '';
  let lastEventId = '';
  let cancelled = false;

  try {
    while (true) {
      if (abortSignal?.aborted) {
        cancelled = true;
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        if (!event.trim()) {
          continue;
        }

        const lines = event.split('\n');
        let eventData = '';
        let eventId = '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            eventData += line.slice(5).trim();
          } else if (line.startsWith('id:')) {
            eventId = line.slice(3).trim();
          }
        }

        if (!eventData) {
          continue;
        }

        if (eventId && eventId === lastEventId) {
          continue;
        }
        if (eventId) {
          lastEventId = eventId;
        }

        try {
          const parsed = JSON.parse(eventData) as DashScopeSSEData;

          if (parsed.code) {
            const error = new Error(
              `千问 ASR 错误 [${parsed.code}]: ${parsed.message || '未知错误'}`,
            );
            callbacks.onError?.(error);
            throw error;
          }

          const choices = parsed.output?.choices;
          if (!choices?.length) {
            continue;
          }

          const content = choices[0].message?.content;
          if (content?.length && content[0].text) {
            const newText = content[0].text;
            fullTranscript += newText;
            callbacks.onText(newText);
          }

          const finishReason = choices[0].finish_reason || parsed.output?.finish_reason;
          if (finishReason === 'stop') {
            callbacks.onProgress(100);
          }
        } catch (parseError) {
          if (
            parseError instanceof Error &&
            parseError.message.startsWith('千问 ASR 错误')
          ) {
            throw parseError;
          }

          console.warn('SSE 数据解析失败，跳过:', eventData.slice(0, 100), parseError);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const segments = buildSegmentsFromTranscript(fullTranscript);
  return {
    segments,
    transcript: fullTranscript.trim(),
    cancelled,
  };
}

function buildResultFromFileTransPayload(payload: unknown): {
  transcript: string;
  segments: TranscribeSegment[];
} {
  const transcriptItems = extractTranscriptItems(payload);
  const segments: TranscribeSegment[] = [];
  const transcriptParts: string[] = [];

  for (const item of transcriptItems) {
    const itemText = item.text?.trim();
    if (itemText) {
      transcriptParts.push(itemText);
    }

    if (!Array.isArray(item.sentences)) {
      continue;
    }

    for (const sentence of item.sentences) {
      const text = sentence.text?.trim();
      if (!text) {
        continue;
      }

      const start = sentence.begin_time ?? sentence.sentence_begin_time ?? 0;
      const end = sentence.end_time ?? sentence.sentence_end_time ?? start;
      segments.push({
        timestamp: `[${formatMilliseconds(start)} --> ${formatMilliseconds(end)}]`,
        text,
      });
    }
  }

  const transcript = transcriptParts.join('\n').trim()
    || segments.map((segment) => segment.text).join('\n').trim()
    || extractPlainTranscript(payload);

  return {
    transcript,
    segments: segments.length > 0 ? segments : buildSegmentsFromTranscript(transcript),
  };
}

function extractTranscriptItems(payload: unknown): DashScopeTranscriptItem[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.filter(isTranscriptItem);
  }

  const maybePayload = payload as {
    transcripts?: unknown;
    result?: unknown;
    results?: unknown;
  };

  if (Array.isArray(maybePayload.transcripts)) {
    return maybePayload.transcripts.filter(isTranscriptItem);
  }

  if (Array.isArray(maybePayload.results)) {
    return maybePayload.results.filter(isTranscriptItem);
  }

  if (maybePayload.result && typeof maybePayload.result === 'object') {
    return extractTranscriptItems(maybePayload.result);
  }

  if (isTranscriptItem(payload)) {
    return [payload];
  }

  return [];
}

function isTranscriptItem(value: unknown): value is DashScopeTranscriptItem {
  return Boolean(value) && typeof value === 'object';
}

function extractPlainTranscript(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.trim();
  }

  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const maybePayload = payload as {
    text?: unknown;
    transcript?: unknown;
    result?: unknown;
  };

  if (typeof maybePayload.text === 'string') {
    return maybePayload.text.trim();
  }

  if (typeof maybePayload.transcript === 'string') {
    return maybePayload.transcript.trim();
  }

  if (maybePayload.result) {
    return extractPlainTranscript(maybePayload.result);
  }

  return '';
}

function buildSegmentsFromTranscript(transcript: string): TranscribeSegment[] {
  if (!transcript.trim()) {
    return [];
  }

  const sentences = transcript
    .split(/[。！？!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return [
      {
        timestamp: '[00:00:00.000 --> 00:00:00.000]',
        text: transcript.trim(),
      },
    ];
  }

  const totalLength = sentences.reduce((sum, sentence) => sum + sentence.length, 0);
  const totalEstimatedDuration = totalLength * 0.3;
  let currentTime = 0;

  return sentences.map((sentence) => {
    const startTime = currentTime;
    const duration = (sentence.length / totalLength) * totalEstimatedDuration;
    currentTime = startTime + duration;

    return {
      timestamp: `[${formatTime(startTime)} --> ${formatTime(currentTime)}]`,
      text: sentence,
    };
  });
}

function shouldFallbackToFileTrans(error: unknown, requestedModel: string): boolean {
  if (requestedModel === FILETRANS_MODEL) {
    return false;
  }

  if (!(error instanceof DashScopeApiError)) {
    return false;
  }

  if (error.status === 400 || error.status === 413) {
    return true;
  }

  return Boolean(
    error.message.includes('5 分钟')
    || error.message.includes('5分钟')
    || error.message.includes('10MB')
    || error.message.includes('audio')
    || error.message.includes('Audio'),
  );
}

async function buildDashScopeApiError(response: Response): Promise<DashScopeApiError> {
  let message = `千问 ASR API 请求失败 (${response.status})`;
  let code: string | undefined;

  try {
    const payload = (await response.json()) as {
      code?: string;
      message?: string;
      error?: { message?: string; code?: string };
    };

    code = payload.code || payload.error?.code;
    message = payload.message || payload.error?.message || message;
  } catch {
    // ignore parse error
  }

  if (response.status === 401 || response.status === 403) {
    message = `${message}。请确认 API Key 有效，且与当前 DashScope 地域端点匹配。`;
  }

  return new DashScopeApiError(`千问 ASR: ${message}`, {
    status: response.status,
    code,
  });
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

async function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      abortSignal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', handleAbort, { once: true });
    }
  });
}

function formatMilliseconds(milliseconds: number): string {
  return formatTime(milliseconds / 1000);
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad3(ms)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function pad3(value: number): string {
  return value.toString().padStart(3, '0');
}

export async function testQwenASRConnection(
  config: OnlineASRConfig,
): Promise<{ success: boolean; message: string }> {
  if (!config.apiKey) {
    return { success: false, message: 'API Key 不能为空' };
  }

  try {
    const apiEndpoint = `${normalizeBaseUrl(config.baseUrl)}/services/aigc/multimodal-generation/generation`;

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_FLASH_MODEL,
        input: {
          messages: [
            {
              role: 'system',
              content: [{ text: '' }],
            },
            {
              role: 'user',
              content: [{ text: 'test' }],
            },
          ],
        },
      }),
    });

    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'API Key 无效，或与当前 DashScope 地域端点不匹配' };
    }

    if (response.status === 400) {
      const body = await response.json();
      if (
        body.code
        && !String(body.code).includes('Unauthorized')
        && !String(body.code).includes('InvalidApiKey')
      ) {
        return { success: true, message: 'API Key 验证通过，连接正常' };
      }

      return {
        success: false,
        message: body.message || 'API Key 验证失败',
      };
    }

    if (response.ok) {
      return { success: true, message: 'API Key 验证通过，连接正常' };
    }

    return {
      success: false,
      message: `连接失败 (HTTP ${response.status})`,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { success: false, message: '连接超时' };
      }
      return { success: false, message: `连接失败: ${error.message}` };
    }

    return { success: false, message: '未知连接错误' };
  }
}
