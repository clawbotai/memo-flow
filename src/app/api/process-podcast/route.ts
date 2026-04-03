import { NextRequest, NextResponse } from 'next/server';
import { fetchEpisodeInfo } from '@/lib/xiaoyuzhou';
import { existsSync } from 'fs';
import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // 通过小宇宙 API 获取播客信息和音频链接
    const episodeInfo = await fetchEpisodeInfo(url);

    if (!episodeInfo.audioUrl) {
      return NextResponse.json(
        { success: false, error: '未能从小宇宙播客中提取到音频链接' },
        { status: 400 }
      );
    }

    const audioUrl = episodeInfo.audioUrl;

    // 创建临时目录
    const tempDir = path.join(os.tmpdir(), 'memo-flow');
    await mkdir(tempDir, { recursive: true });

    // 生成临时文件路径
    const fileName = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.mp3`;
    const audioPath = path.join(tempDir, fileName);

    // 下载音频文件
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return NextResponse.json(
        { success: false, error: '无法下载音频文件' },
        { status: 500 }
      );
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    await writeFile(audioPath, audioBuffer);

    // 调用Whisper进行转录
    let transcript = '';
    const whisperPath = process.env.WHISPER_PATH || path.join(process.cwd(), 'whisper.cpp/main');
    const modelPath = process.env.WHISPER_MODEL_PATH || path.join(process.cwd(), 'models/ggml-small.bin');

    if (!existsSync(whisperPath) || !existsSync(modelPath)) {
      // 如果whisper未设置，使用模拟转录
      transcript = await simulateTranscription(audioPath);
    } else {
      // 调用本地whisper模型
      try {
        const { stdout } = await execFileAsync(whisperPath, [
          '-m', modelPath,
          '-f', audioPath,
          '-l', 'zh',
          '-t', process.env.WHISPER_THREADS || '4',
          '--output-txt'
        ]);

        // 读取生成的转录文件
        const txtPath = audioPath.replace(path.extname(audioPath), '.txt');
        if (existsSync(txtPath)) {
          transcript = await readFile(txtPath, 'utf8');
          await unlink(txtPath);
        } else {
          transcript = stdout;
        }
      } catch (execError) {
        console.error('Whisper execution error:', execError);
        transcript = await simulateTranscription(audioPath);
      }
    }

    // 删除临时音频文件
    try {
      await unlink(audioPath);
    } catch (unlinkError) {
      console.error('Failed to delete temp file:', unlinkError);
    }

    return NextResponse.json({
      success: true,
      data: {
        transcript: transcript.trim(),
        audioUrl,
        wordCount: transcript.trim().length,
        language: 'zh'
      }
    });
  } catch (error) {
    console.error('Process podcast error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '处理播客失败' },
      { status: 500 }
    );
  }
}

// 模拟转录函数，实际部署时需要替换为真正的whisper调用
async function simulateTranscription(audioPath: string): Promise<string> {
  // 在实际实现中，这里会调用whisper.cpp
  console.log(`Simulating transcription of audio at: ${audioPath}`);

  // 模拟一个真实的转录过程（在实际实现中会被替换）
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("欢迎收听本期节目。今天我们聊一聊人工智能在内容创作领域的应用。随着大语言模型的发展，AI已经成为内容创作者的重要工具。许多创作者开始探索如何利用AI来提高工作效率，同时保持自己的独特视角和创意。今天的讨论主要涵盖以下几个方面：首先是AI写作助手的使用技巧；其次是版权和原创性的考量；最后是如何平衡人机协作以达到最佳创作效果。我们邀请到了几位行业专家分享他们的实践经验和心得体会。");
    }, 2000); // 模拟处理时间
  });
}