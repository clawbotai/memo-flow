// whisper.cpp 封装
// 通过 child_process 调用 whisper.cpp 的 main 程序进行语音转写

import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';

// whisper.cpp 可执行文件路径
const WHISPER_PATH = process.env.WHISPER_PATH ||
  path.join(process.cwd(), 'whisper.cpp/main');

// 模型文件路径
export const MODEL_PATH = process.env.WHISPER_MODEL_PATH ||
  path.join(process.cwd(), 'models/ggml-medium.bin');

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
 * 检查 whisper.cpp 是否已安装
 */
export function checkWhisperInstalled(): boolean {
  return fs.existsSync(WHISPER_PATH);
}

/**
 * 检查模型文件是否存在
 */
export function checkModelExists(): boolean {
  return fs.existsSync(MODEL_PATH);
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
      'whisper.cpp 未安装，请运行：bash scripts/setup-whisper.sh'
    );
  }

  // 验证模型存在
  if (!checkModelExists()) {
    throw new Error(
      '模型文件不存在，请运行：bash scripts/download-model.sh'
    );
  }

  // 构建命令参数
  const args = [
    '-m', MODEL_PATH,
    '-f', audioPath,
    '-l', language,
    '-t', process.env.WHISPER_THREADS || '4', // 使用线程数
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
    execFile(WHISPER_PATH, args, (error, stdout, stderr) => {
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
function extractTextFromJson(json: any): string {
  if (json.transcription) {
    return json.transcription.text || '';
  }
  if (Array.isArray(json.segments)) {
    return json.segments.map((s: any) => s.text).join(' ').trim();
  }
  return '';
}

/**
 * 从 JSON 输出中提取分段信息
 */
function extractSegmentsFromJson(json: any): TranscribeSegment[] {
  if (json.transcription?.segments) {
    return json.transcription.segments.map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text
    }));
  }
  if (Array.isArray(json.segments)) {
    return json.segments.map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text
    }));
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
  const fastModelPath = path.join(process.cwd(), 'models/ggml-small.bin');

  if (!fs.existsSync(fastModelPath)) {
    // 如果 small 模型不存在，回退到默认模型
    return transcribe(audioPath);
  }

  // 临时修改 MODEL_PATH
  const originalModelPath = MODEL_PATH;
  try {
    // @ts-ignore - 临时修改
    global.MODEL_PATH = fastModelPath;
    return await transcribe(audioPath, { language: 'zh' });
  } finally {
    // @ts-ignore
    global.MODEL_PATH = originalModelPath;
  }
}
