import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { saveWhisperConfig, getWhisperConfig, toProjectDisplayPath } from '@/lib/whisper-config';

// 模型下载 URL 映射（使用 Hugging Face 镜像源）
const MODEL_URLS: Record<string, string> = {
  small: 'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  medium: 'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin'
};

// 模型文件大小（字节）- 用于进度计算
const MODEL_SIZES: Record<string, number> = {
  small: 466000000,      // ~466 MB
  medium: 1530000000     // ~1.53 GB
};

// 进度文件路径
const MODELS_DIR = path.join(process.cwd(), 'models');
const PROGRESS_FILE = path.join(MODELS_DIR, '.download-progress.json');

/**
 * 确保模型目录存在
 */
function ensureModelsDir(): void {
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }
}

/**
 * 写入进度文件
 */
function writeProgress(progress: {
  status: 'downloading' | 'completed' | 'error';
  downloaded: number;
  total: number;
  modelName: string;
  error?: string;
}): void {
  try {
    ensureModelsDir();
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
  } catch (error) {
    console.error('写入进度文件失败:', error);
  }
}

/**
 * 后台下载模型
 */
async function downloadModelInBackground(modelName: string): Promise<void> {
  const modelUrl = MODEL_URLS[modelName];
  const targetPath = path.join(MODELS_DIR, `ggml-${modelName}.bin`);
  
  if (!modelUrl) {
    writeProgress({
      status: 'error',
      downloaded: 0,
      total: 0,
      modelName,
      error: `不支持的模型: ${modelName}`
    });
    return;
  }

  try {
    // 初始化进度
    writeProgress({
      status: 'downloading',
      downloaded: 0,
      total: MODEL_SIZES[modelName],
      modelName
    });

    // 发起下载请求
    const response = await fetch(modelUrl);
    
    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status}`);
    }

    // 获取 Content-Length
    const contentLength = response.headers.get('content-length');
    const totalSize = contentLength ? parseInt(contentLength, 10) : MODEL_SIZES[modelName];
    
    // 创建写入流
    const fileStream = fs.createWriteStream(targetPath);
    
    if (!response.body) {
      throw new Error('响应体为空');
    }

    const reader = response.body.getReader();
    let downloadedSize = 0;
    let lastProgressUpdate = Date.now();

    // 循环读取数据
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      // 写入文件
      fileStream.write(Buffer.from(value));
      downloadedSize += value.length;

      // 每 500ms 更新一次进度（避免频繁写入）
      const now = Date.now();
      if (now - lastProgressUpdate > 500) {
        writeProgress({
          status: 'downloading',
          downloaded: downloadedSize,
          total: totalSize,
          modelName
        });
        lastProgressUpdate = now;
      }
    }

    // 关闭文件流
    fileStream.end();
    
    // 等待文件写入完成
    await new Promise<void>((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    // 下载完成，更新配置
    const config = getWhisperConfig();
    config.modelPath = toProjectDisplayPath(targetPath);
    config.modelName = modelName;
    saveWhisperConfig(config);
    
    writeProgress({
      status: 'completed',
      downloaded: totalSize,
      total: totalSize,
      modelName
    });

    console.log(`模型 ${modelName} 下载完成`);

  } catch (error) {
    console.error(`模型 ${modelName} 下载失败:`, error);
    
    // 清理不完整的文件
    try {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    } catch (cleanupError) {
      console.error('清理失败文件失败:', cleanupError);
    }

    writeProgress({
      status: 'error',
      downloaded: 0,
      total: 0,
      modelName,
      error: error instanceof Error ? error.message : '下载失败'
    });
  }
}

/**
 * POST /api/whisper-download
 * 触发模型下载（后台执行）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelName } = body;

    // 验证请求参数
    if (!modelName || (modelName !== 'small' && modelName !== 'medium')) {
      return NextResponse.json(
        { success: false, error: '无效的模型名称，必须是 small 或 medium' },
        { status: 400 }
      );
    }

    // 检查是否正在下载中
    if (fs.existsSync(PROGRESS_FILE)) {
      try {
        const progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        if (progressData.status === 'downloading' && progressData.modelName === modelName) {
          return NextResponse.json(
            { success: false, error: '该模型正在下载中' },
            { status: 409 }
          );
        }
      } catch {
        // 进度文件损坏，忽略错误
      }
    }

    // 检查模型是否已存在
    const targetPath = path.join(MODELS_DIR, `ggml-${modelName}.bin`);
    if (fs.existsSync(targetPath)) {
      // 模型已存在，更新配置并返回
      const config = getWhisperConfig();
      config.modelPath = toProjectDisplayPath(targetPath);
      config.modelName = modelName;
      saveWhisperConfig(config);
      return NextResponse.json({
        success: true,
        message: '模型已存在',
        alreadyExists: true
      });
    }

    // 启动后台下载（不等待完成）
    downloadModelInBackground(modelName).catch(error => {
      console.error('后台下载任务失败:', error);
    });

    // 立即返回响应
    return NextResponse.json({
      success: true,
      message: 'Download started'
    });

  } catch (error) {
    console.error('启动模型下载失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '启动下载失败' },
      { status: 500 }
    );
  }
}
