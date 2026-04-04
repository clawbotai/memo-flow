// whisper.cpp 封装
// 通过 child_process 调用 whisper.cpp 的 main 程序进行语音转写

import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { isValidWhisperExecutable, getWhisperConfig, resolveWhisperConfigPaths } from './whisper-config';

/**
 * 获取当前的 Whisper 配置
 */
function getCurrentConfig() {
  const config = getWhisperConfig();
  return resolveWhisperConfigPaths(config);
}

export interface TranscribeOptions {
  language?: string;      // 语言代码，默认 'zh' (中文)
  outputJson?: boolean;   // 是否输出 JSON 格式（带时间戳）
  wordTimestamps?: boolean; // 是否输出词级时间戳
}

export interface TranscribeResult {
  transcript: string;     // 完整转写文本
  wordCount: number;      // 字数
  language: string;       // 检测到的语言
  segments?: TranscribeSegment[]; // 分段信息（如果 outputJson=true）
}

export interface TranscribeSegment {
  start: number;          // 开始时间（秒）
  end: number;            // 结束时间（秒）
  text: string;           // 分段文本
}

/**
 * 检查 whisper.cpp 是否已安装并可运行
 */
export function checkWhisperInstalled(): boolean {
  try {
    const config = getCurrentConfig();
    return isValidWhisperExecutable(config.whisperPath);
  } catch (error) {
    console.error('验证 whisper 可执行文件失败:', error);
    return false;
  }
}

/**
 * 检查模型文件是否存在
 */
export function checkModelExists(): boolean {
  const config = getCurrentConfig();
  return fs.existsSync(config.modelPath);
}

/**
 * 转录音频文件
 * @param audioPath 音频文件路径（绝对路径）
 * @param options 转写选项
 */
export async function transcribe(
  audioPath: string,
  options: TranscribeOptions = {}
): Promise<TranscribeResult> {
  const {
    language = 'zh',
    outputJson = false,
    wordTimestamps = false
  } = options;

  // 验证文件存在
  if (!fs.existsSync(audioPath)) {
    throw new Error(`音频文件不存在：${audioPath}`);
  }

  // 验证 whisper.cpp 已安装
  if (!checkWhisperInstalled()) {
    throw new Error(
      'whisper.cpp 未安装，请先在设置中完成安装'
    );
  }

  // 验证模型存在
  if (!checkModelExists()) {
    throw new Error(
      '模型文件不存在，请在设置中下载模型'
    );
  }

  const config = getCurrentConfig();

  // 构建命令参数
  const args = [
    '-m', config.modelPath,
    '-f', audioPath,
    '-l', language,
    '-t', config.threads.toString(), // 使用配置中的线程数
  ];

  // 如果需要 JSON 输出（带时间戳）
  if (outputJson || wordTimestamps) {
    args.push('--output-json');
  } else {
    args.push('--output-txt');
  }

  // 词级时间戳
  if (wordTimestamps) {
    args.push('--max-len', '1');
  }

  return new Promise((resolve, reject) => {
    // 运行命令
    execFile(config.whisperPath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`whisper 执行失败：${error.message}\n${stderr}`));
        return;
      }

      // 读取输出文件
      const outputExt = outputJson || wordTimestamps ? '.json' : '.txt';
      const outputPath = audioPath.replace(path.extname(audioPath), outputExt);

      fs.readFile(outputPath, 'utf8', (err, data) => {
        if (err) {
          reject(new Error(`读取转写结果失败：${err.message}`));
          return;
        }

        // 如果是 JSON 输出，解析结构化数据
        if (outputJson || wordTimestamps) {
          try {
            const json = JSON.parse(data);
            const transcript = extractTextFromJson(json);
            const segments = extractSegmentsFromJson(json);

            // 清理临时文件
            cleanupTempFiles(audioPath, outputExt);

            resolve({
              transcript,
              wordCount: transcript.length,
              language,
              segments
            });
          } catch (parseError) {
            reject(new Error(`解析 JSON 结果失败：${parseError}`));
            return;
          }
        } else {
          // 纯文本输出
          const transcript = data.trim();

          // 清理临时文件
          cleanupTempFiles(audioPath, outputExt);

          resolve({
            transcript,
            wordCount: transcript.length,
            language
          });
        }
      });
    });
  });
}

/**
 * 从 JSON 输出中提取纯文本
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractTextFromJson(json: unknown): string {
  if (!isRecord(json)) return '';

  const transcription = json.transcription;
  if (isRecord(transcription) && typeof transcription.text === 'string') {
    return transcription.text;
  }

  const segments = json.segments;
  if (Array.isArray(segments)) {
    return segments
      .map((s) => (isRecord(s) && typeof s.text === 'string' ? s.text : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  return '';
}

/**
 * 从 JSON 输出中提取分段信息
 */
function extractSegmentsFromJson(json: unknown): TranscribeSegment[] {
  if (!isRecord(json)) return [];

  const transcription = json.transcription;
  if (isRecord(transcription) && Array.isArray(transcription.segments)) {
    return transcription.segments
      .map((s) => {
        if (!isRecord(s)) return null;
        const start = typeof s.start === 'number' ? s.start : 0;
        const end = typeof s.end === 'number' ? s.end : 0;
        const text = typeof s.text === 'string' ? s.text : '';
        if (!text) return null;
        return { start, end, text };
      })
      .filter((s): s is TranscribeSegment => s !== null);
  }

  if (Array.isArray(json.segments)) {
    return json.segments
      .map((s) => {
        if (!isRecord(s)) return null;
        const start = typeof s.start === 'number' ? s.start : 0;
        const end = typeof s.end === 'number' ? s.end : 0;
        const text = typeof s.text === 'string' ? s.text : '';
        if (!text) return null;
        return { start, end, text };
      })
      .filter((s): s is TranscribeSegment => s !== null);
  }

  return [];
}

/**
 * 清理临时文件
 */
function cleanupTempFiles(audioPath: string, outputExt: string) {
  try {
    // 清理输出文件
    const outputPath = audioPath.replace(path.extname(audioPath), outputExt);
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  } catch (error) {
    console.error('清理临时文件失败:', error);
  }
}

/**
 * 快速转写（使用 small 模型，适合快速测试）
 */
export async function transcribeFast(audioPath: string): Promise<TranscribeResult> {
  const fastModelPath = path.resolve(process.cwd(), 'models/ggml-small.bin');

  if (!fs.existsSync(fastModelPath)) {
    // 如果 small 模型不存在，使用当前配置的模型
    return transcribe(audioPath);
  }

  // 临时使用 small 模型进行转录
  return await transcribe(audioPath, { language: 'zh' });
}
