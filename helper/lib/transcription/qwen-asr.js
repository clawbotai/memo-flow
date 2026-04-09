'use strict';

const {
  FILETRANS_POLL_INTERVAL_MS,
  FILETRANS_TIMEOUT_MS,
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_TEST_MODEL,
} = require('../constants');

function formatDashScopeTimestamp(ms) {
  const totalMs = Math.max(0, Number(ms) || 0);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    seconds,
  ).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function buildSegmentsFromTranscript(transcript) {
  return String(transcript || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({
      timestamp: `[00:00:${String(index).padStart(2, '0')}.000 --> 00:00:${String(
        index + 1,
      ).padStart(2, '0')}.000]`,
      text,
    }));
}

function extractTranscriptItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.transcripts)) return payload.transcripts;
    if (Array.isArray(payload.output?.results)) return payload.output.results;
  }
  return [];
}

function buildResultFromFileTransPayload(payload) {
  const items = extractTranscriptItems(payload);
  const segments = [];
  const transcriptParts = [];

  for (const item of items) {
    const itemText = String(item.text || '').trim();
    if (itemText) transcriptParts.push(itemText);

    if (Array.isArray(item.sentences)) {
      for (const sentence of item.sentences) {
        const text = String(sentence.text || '').trim();
        if (!text) continue;
        const startRaw = sentence.begin_time ?? sentence.sentence_begin_time ?? 0;
        const endRaw = sentence.end_time ?? sentence.sentence_end_time ?? startRaw;
        segments.push({
          timestamp: `[${formatDashScopeTimestamp(startRaw)} --> ${formatDashScopeTimestamp(
            endRaw,
          )}]`,
          text,
        });
      }
    }
  }

  const transcript = transcriptParts.join('\n').trim();
  return {
    transcript,
    segments: segments.length ? segments : buildSegmentsFromTranscript(transcript),
  };
}

async function sleep(ms, signal) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('任务已取消'));
      },
      { once: true },
    );
  });
}

async function transcribeWithQwenFileTrans(audioUrl, config, onUpdate, signal) {
  if (!config?.apiKey) {
    throw new Error('千问 ASR API Key 未配置，请在设置中填写');
  }

  const baseUrl = String(config.baseUrl || DEFAULT_QWEN_BASE_URL).replace(/\/$/, '');
  const submitResponse = await fetch(`${baseUrl}/services/audio/asr/transcription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: 'qwen3-asr-flash-filetrans',
      input: {
        file_url: audioUrl,
      },
      parameters: {
        channel_id: [0],
        enable_itn: config.enableITN ?? true,
        enable_words: true,
      },
    }),
    signal,
  });

  if (!submitResponse.ok) {
    throw new Error(`千问 ASR 提交失败 (${submitResponse.status})`);
  }

  const submitPayload = await submitResponse.json();
  const taskId = submitPayload?.output?.task_id;
  if (!taskId) {
    throw new Error(submitPayload?.message || '千问 ASR 任务提交失败');
  }

  onUpdate({ progress: 15, transcript: '' });

  const startedAt = Date.now();
  let queryProgress = 20;

  while (true) {
    if (signal?.aborted) {
      throw new Error('任务已取消');
    }

    if (Date.now() - startedAt > FILETRANS_TIMEOUT_MS) {
      throw new Error('千问 ASR 长音频转录超时，请稍后重试');
    }

    await sleep(FILETRANS_POLL_INTERVAL_MS, signal);

    const queryResponse = await fetch(`${baseUrl}/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      signal,
    });

    if (!queryResponse.ok) {
      throw new Error(`千问 ASR 查询失败 (${queryResponse.status})`);
    }

    const queryPayload = await queryResponse.json();
    const status = String(queryPayload?.output?.task_status || '').toUpperCase();
    const code = queryPayload?.output?.code || queryPayload?.code;
    const message = queryPayload?.output?.message || queryPayload?.message;

    if (code) {
      throw new Error(`千问 ASR 错误 [${code}]: ${message || '未知错误'}`);
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(message || '千问 ASR 长音频转录失败');
    }
    if (status === 'SUCCEEDED') {
      onUpdate({ progress: 90 });
      const transcriptionUrl = queryPayload?.output?.result?.transcription_url;
      if (!transcriptionUrl) {
        throw new Error('千问 ASR 转录完成，但未返回 transcription_url');
      }
      const resultResponse = await fetch(transcriptionUrl, { signal });
      if (!resultResponse.ok) {
        throw new Error(`下载千问 ASR 转录结果失败 (${resultResponse.status})`);
      }
      const resultPayload = await resultResponse.json();
      const result = buildResultFromFileTransPayload(resultPayload);
      onUpdate({ progress: 100, transcript: result.transcript });
      return result;
    }

    queryProgress = Math.min(queryProgress + 8, 80);
    onUpdate({ progress: queryProgress });
  }
}

async function testQwenASRConnection(config) {
  if (!config?.apiKey) {
    return { success: false, message: 'API Key 不能为空' };
  }

  try {
    const baseUrl = String(config.baseUrl || DEFAULT_QWEN_BASE_URL).replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_QWEN_TEST_MODEL,
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
        body.code &&
        !String(body.code).includes('Unauthorized') &&
        !String(body.code).includes('InvalidApiKey')
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

module.exports = {
  formatDashScopeTimestamp,
  buildSegmentsFromTranscript,
  extractTranscriptItems,
  buildResultFromFileTransPayload,
  sleep,
  transcribeWithQwenFileTrans,
  testQwenASRConnection,
};
