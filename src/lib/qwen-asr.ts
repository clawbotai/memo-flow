/**
 * 千问 Qwen3-ASR-Flash 在线语音识别模块
 *
 * 通过 DashScope multimodal-generation API 进行音频转录。
 * 支持 SSE 流式输出，实时返回转录结果。
 */

import type { TranscribeSegment, OnlineASRConfig } from "@/types";

// ─── 类型定义 ───

interface QwenASRCallbacks {
  /** 收到新的转录文本片段时回调 */
  onText: (text: string) => void;
  /** 进度更新（0-100） */
  onProgress: (percent: number) => void;
  /** 错误回调 */
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
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  request_id?: string;
  code?: string;
  message?: string;
}

// ─── 核心实现 ───

/**
 * 使用千问 ASR 模型进行在线转录（SSE 流式）
 *
 * @param audioUrl 公网可访问的音频文件 URL
 * @param config 在线 ASR 配置（API Key 等）
 * @param callbacks 回调函数
 * @param abortSignal 取消信号
 * @returns 转录结果
 */
export async function transcribeWithQwenASR(
  audioUrl: string,
  config: OnlineASRConfig,
  callbacks: QwenASRCallbacks,
  abortSignal?: AbortSignal,
): Promise<QwenASRResult> {
  if (!config.apiKey) {
    throw new Error("千问 ASR API Key 未配置，请在设置中填写");
  }

  const apiEndpoint = `${config.baseUrl}/services/aigc/multimodal-generation/generation`;

  const requestBody = {
    model: config.modelName || "qwen3-asr-flash",
    input: {
      messages: [
        {
          role: "user",
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
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-SSE": "enable",
    },
    body: JSON.stringify(requestBody),
    signal: abortSignal,
  });

  if (!response.ok) {
    let errorMessage = `千问 ASR API 请求失败 (${response.status})`;
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        errorMessage = `千问 ASR: ${errorBody.message}`;
      } else if (errorBody.error?.message) {
        errorMessage = `千问 ASR: ${errorBody.error.message}`;
      }
    } catch {
      // ignore parse error
    }
    throw new Error(errorMessage);
  }

  // 解析 SSE 流
  return parseSSEStream(response, callbacks, abortSignal);
}

/**
 * 解析 DashScope SSE 流式响应
 */
async function parseSSEStream(
  response: Response,
  callbacks: QwenASRCallbacks,
  abortSignal?: AbortSignal,
): Promise<QwenASRResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("无法读取响应流");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullTranscript = "";
  let lastEventId = "";
  let cancelled = false;

  try {
    while (true) {
      if (abortSignal?.aborted) {
        cancelled = true;
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE 格式：以 \n\n 分隔事件
      const events = buffer.split("\n\n");
      buffer = events.pop() || ""; // 保留未完成的最后一块

      for (const event of events) {
        if (!event.trim()) continue;

        const lines = event.split("\n");
        let eventData = "";
        let eventId = "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            eventData += line.slice(5).trim();
          } else if (line.startsWith("id:")) {
            eventId = line.slice(3).trim();
          }
        }

        if (!eventData) continue;

        // 跳过重复 event id
        if (eventId && eventId === lastEventId) continue;
        if (eventId) lastEventId = eventId;

        try {
          const parsed: DashScopeSSEData = JSON.parse(eventData);

          // 检查 API 错误
          if (parsed.code) {
            const error = new Error(
              `千问 ASR 错误 [${parsed.code}]: ${parsed.message || "未知错误"}`,
            );
            callbacks.onError?.(error);
            throw error;
          }

          // 提取转录文本
          const choices = parsed.output?.choices;
          if (choices && choices.length > 0) {
            const content = choices[0].message?.content;
            if (content && content.length > 0 && content[0].text) {
              const newText = content[0].text;

              // incremental_output 模式下，每次返回的是增量文本
              fullTranscript += newText;
              callbacks.onText(newText);
            }

            // 检查是否完成
            const finishReason =
              choices[0].finish_reason || parsed.output?.finish_reason;
            if (finishReason === "stop") {
              callbacks.onProgress(100);
            }
          }
        } catch (parseError) {
          if (
            parseError instanceof Error &&
            parseError.message.startsWith("千问 ASR 错误")
          ) {
            throw parseError;
          }
          // 忽略无法解析的 SSE 数据行（如注释行）
          console.warn("SSE 数据解析失败，跳过:", eventData.slice(0, 100), parseError);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 将完整转录文本转为 segments 格式
  const segments = buildSegmentsFromTranscript(fullTranscript);

  return {
    segments,
    transcript: fullTranscript.trim(),
    cancelled,
  };
}

/**
 * 将纯文本转录结果转为 TranscribeSegment[] 格式
 * 在线 ASR 可能不提供精确时间戳，按段落拆分并生成估算时间戳
 */
function buildSegmentsFromTranscript(
  transcript: string,
): TranscribeSegment[] {
  if (!transcript.trim()) {
    return [];
  }

  // 按句子或段落拆分（中英文标点）
  const sentences = transcript
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return [
      {
        timestamp: "[00:00:00.000 --> 00:00:00.000]",
        text: transcript.trim(),
      },
    ];
  }

  // 为每个句子生成估算时间戳（按字符比例分配，每字符约 0.3 秒）
  const totalLength = sentences.reduce((sum, s) => sum + s.length, 0);
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

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad3(ms)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

/**
 * 测试千问 ASR API 连接是否可用
 * 发送一个轻量请求验证 API Key 有效性
 */
export async function testQwenASRConnection(
  config: OnlineASRConfig,
): Promise<{ success: boolean; message: string }> {
  if (!config.apiKey) {
    return { success: false, message: "API Key 不能为空" };
  }

  try {
    // 使用一个极短的静音音频 URL 测试，或直接发送请求看鉴权是否通过
    // 这里用一个简单的 HEAD-like 请求方式：发送无效音频让 API 返回鉴权结果
    const apiEndpoint = `${config.baseUrl}/services/aigc/multimodal-generation/generation`;

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelName || "qwen3-asr-flash",
        input: {
          messages: [
            {
              role: "user",
              content: [{ text: "test" }],
            },
          ],
        },
      }),
    });

    if (response.status === 401 || response.status === 403) {
      return { success: false, message: "API Key 无效或已过期" };
    }

    // 400 参数错误（如发送了无效音频内容）说明鉴权已通过，Key 有效
    // 这是预期行为：我们故意发送 text 内容而非音频来触发参数错误而非鉴权错误
    if (response.status === 400) {
      const body = await response.json();
      // 如果是参数错误而非鉴权错误，说明连接&Key 都是通的
      if (
        body.code &&
        !body.code.includes("Unauthorized") &&
        !body.code.includes("InvalidApiKey")
      ) {
        return { success: true, message: "API Key 验证通过，连接正常" };
      }
      return {
        success: false,
        message: body.message || "API Key 验证失败",
      };
    }

    if (response.ok) {
      return { success: true, message: "API Key 验证通过，连接正常" };
    }

    return {
      success: false,
      message: `连接失败 (HTTP ${response.status})`,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { success: false, message: "连接超时" };
      }
      return { success: false, message: `连接失败: ${error.message}` };
    }
    return { success: false, message: "未知连接错误" };
  }
}
