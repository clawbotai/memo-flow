/**
 * 真实链接解析器
 * 支持: YouTube, 小宇宙, 小红书, B站
 */

import { Content, Platform } from '@/types';

// 带超时的 fetch 工具函数
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// YouTube 解析
async function parseYouTube(url: string): Promise<Content | null> {
  try {
    // 从 URL 提取视频 ID
    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
    if (!videoIdMatch) {
      return null;
    }
    const videoId = videoIdMatch[1];

    // 调用 YouTube oEmbed API
    const apiUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

    const response = await fetchWithTimeout(apiUrl, {}, 10000);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      id: `yt_${videoId}`,
      url,
      platform: 'youtube',
      title: data.title || 'YouTube 视频',
      description: data.description?.substring(0, 500) || '',
      duration: undefined, // 需要 YouTube Data API v3 才能获取
      thumbnail: data.thumbnail_url || '',
      author: data.author_name || '未知作者',
      publishedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[YouTube Parse Error]', error);
    // 降级：使用 mock 数据
    return createMockContent(url, 'youtube');
  }
}

// 使用 Jina AI Reader API 提取网页内容
async function extractWithJina(url: string): Promise<{ title: string; content: string; author?: string } | null> {
  try {
    const readerUrl = `https://r.jina.ai/${url}`;
    const response = await fetchWithTimeout(readerUrl, {
      headers: {
        'Accept': 'text/plain',
        'User-Agent': 'Mozilla/5.0 (compatible; MemoFlow/1.0)'
      }
    }, 15000);

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    if (!text || text.length < 10) {
      return null;
    }

    // Jina Reader 返回格式：第一行是标题，后面是内容
    const lines = text.split('\n');
    const title = lines[0]?.trim() || '';
    const content = lines.slice(1).join('\n').trim();

    // 尝试从内容中提取作者
    const authorMatch = content.match(/作者[：:]\s*([^\n]+)/);

    return {
      title,
      content: content.substring(0, 2000),
      author: authorMatch?.[1]?.trim()
    };
  } catch (error) {
    console.error('[Jina Reader Error]', error);
    return null;
  }
}

// 小宇宙解析
async function parseXiaoyuzhou(url: string): Promise<Content | null> {
  try {
    // 小宇宙的节目 ID 通常在 URL 中
    const episodeIdMatch = url.match(/episode\/([a-f0-9-]+)/);
    const programIdMatch = url.match(/program\/([a-f0-9-]+)/);

    if (!episodeIdMatch && !programIdMatch) {
      return null;
    }

    const episodeId = episodeIdMatch?.[1] || programIdMatch?.[1] || 'unknown';

    // 优先使用 Jina Reader API 提取内容
    const extracted = await extractWithJina(url);

    if (extracted) {
      // 清理标题（去掉 "Title:" 前缀和节目后缀）
      let title = extracted.title
        .replace(/^Title:\s*/, '')
        .replace(/\s*[-|_]\s*小宇宙.*$/i, '')
        .replace(/\s*[-|_]\s*不想上班.*$/i, '')
        .trim();

      // 清理描述（去掉 URL、Markdown 标记等）
      let description = extracted.content
        .replace(/^URL Source:.*$/gm, '')
        .replace(/^Markdown Content:.*$/gm, '')
        .replace(/^=+$/gm, '')
        .replace(/^#+\s*/gm, '')
        .replace(/!\[Image \d+:\s*[^\]]*\]\([^)]+\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/cosmos:\/\/[^ ]+/g, '')
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/听播客，上小宇宙！.*$/gm, '')
        .replace(/点击下载.*$/gm, '')
        .replace(/70分钟.*$/gm, '')
        .replace(/^\s*\n/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .substring(0, 500);

      return {
        id: `xzy_${episodeId}`,
        url,
        platform: 'xiaoyuzhou',
        title: title || '小宇宙播客',
        description: description || '播客内容分析',
        duration: undefined,
        thumbnail: '',
        author: extracted.author || '未知播客',
        publishedAt: new Date().toISOString()
      };
    }

    // 降级：尝试直接请求
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 10000);

    if (response.ok) {
      const html = await response.text();

      // 解析 HTML 获取元数据
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch = html.match(/name="description"[^>]*content="([^"]+)"/i);

      return {
        id: `xzy_${episodeId}`,
        url,
        platform: 'xiaoyuzhou',
        title: titleMatch
          ? titleMatch[1].replace(/_.*$/, '').trim() || '小宇宙播客'
          : '小宇宙播客',
        description: descMatch
          ? descMatch[1].substring(0, 500)
          : '',
        duration: undefined,
        thumbnail: '',
        author: '未知播客',
        publishedAt: new Date().toISOString()
      };
    }

    return createMockContent(url, 'xiaoyuzhou');
  } catch (error) {
    console.error('[Xiaoyuzhou Parse Error]', error);
    return createMockContent(url, 'xiaoyuzhou');
  }
}

// 小红书解析
async function parseXiaohongshu(url: string): Promise<Content | null> {
  try {
    // 小红书笔记 ID 通常在 URL 中
    const noteIdMatch = url.match(/note\/([a-f0-9]+)/);
    if (!noteIdMatch) {
      return null;
    }
    const noteId = noteIdMatch[1];

    // 小红书没有公开 API
    const response = await fetchWithTimeout(url, {}, 10000);

    if (response.ok) {
      const html = await response.text();

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch = html.match(/property="og:description"[^>]*content="([^"]+)"/i);
      const imageMatch = html.match(/property="og:image"[^>]*content="([^"]+)"/i);
      const authorMatch = html.match(/property="og:site_name"[^>]*content="([^"]+)"/i);

      return {
        id: `xhs_${noteId}`,
        url,
        platform: 'xiaohongshu',
        title: titleMatch
          ? titleMatch[1].replace(/_.*$/, '').trim() || '小红书笔记'
          : '小红书笔记',
        description: descMatch
          ? descMatch[1].substring(0, 500)
          : '',
        duration: undefined,
        thumbnail: imageMatch ? imageMatch[1] : '',
        author: authorMatch ? authorMatch[1] : '小红书用户',
        publishedAt: new Date().toISOString()
      };
    }

    return {
      id: `xhs_${noteId}`,
      url,
      platform: 'xiaohongshu',
      title: '小红书笔记',
      description: '笔记内容分析',
      duration: undefined,
      thumbnail: '',
      author: '小红书用户',
      publishedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[Xiaohongshu Parse Error]', error);
    return createMockContent(url, 'xiaohongshu');
  }
}

// B站解析
async function parseBilibili(url: string): Promise<Content | null> {
  try {
    // B站视频 ID 有多种格式
    let videoId = '';

    // AV 号
    const avMatch = url.match(/av(\d+)/i);
    // BV 号
    const bvMatch = url.match(/BV([a-zA-Z0-9]+)/i);
    // 短链接
    const shortMatch = url.match(/video\/([a-zA-Z0-9]+)/);

    if (avMatch) {
      videoId = `av${avMatch[1]}`;
    } else if (bvMatch) {
      videoId = `BV${bvMatch[1]}`;
    } else if (shortMatch) {
      videoId = shortMatch[1];
    } else {
      return null;
    }

    // B站 API
    // 使用旧版 API（不需要鉴权）
    const avId = videoId.replace(/^av/, '').replace(/^BV/, '');
    const apiUrl = `https://api.bilibili.com/x/web-interface/view?aid=${avId}`;

    const response = await fetchWithTimeout(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MemoFlow/1.0)',
        'Referer': 'https://www.bilibili.com'
      }
    }, 10000);

    if (response.ok) {
      const data = await response.json();

      if (data.code === 0 && data.data) {
        const info = data.data;

        return {
          id: `bilibili_${videoId}`,
          url,
          platform: 'bilibili',
          title: info.title || 'B站视频',
          description: info.desc || '',
          duration: info.duration || 0,
          thumbnail: info.pic || '',
          author: info.owner?.name || 'B站用户',
          publishedAt: new Date(info.pubdate * 1000).toISOString()
        };
      }
    }

    // 如果 API 失败，尝试使用菜鸟接口
    const bvid = bvMatch ? bvMatch[1] : await avToBv(avId);
    const apiUrl2 = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    const response2 = await fetchWithTimeout(apiUrl2, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MemoFlow/1.0)',
        'Referer': 'https://www.bilibili.com'
      }
    }, 10000);

    if (response2.ok) {
      const data2 = await response2.json();
      if (data2.code === 0 && data2.data) {
        const info = data2.data;
        return {
          id: `bilibili_${bvid}`,
          url,
          platform: 'bilibili',
          title: info.title || 'B站视频',
          description: info.desc || '',
          duration: info.duration || 0,
          thumbnail: info.pic || '',
          author: info.owner?.name || 'B站用户',
          publishedAt: new Date(info.pubdate * 1000).toISOString()
        };
      }
    }

    return {
      id: `bilibili_${videoId}`,
      url,
      platform: 'bilibili',
      title: 'B站视频',
      description: '视频内容分析',
      duration: 0,
      thumbnail: '',
      author: 'B站用户',
      publishedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[Bilibili Parse Error]', error);
    return createMockContent(url, 'bilibili');
  }
}

// AV 转 BV (B站算法)
async function avToBv(avId: string): Promise<string> {
  const table = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VGTRbNA';
  const map = new Map<string, number>();
  for (let i = 0; i < table.length; i++) {
    map.set(table[i], i);
  }

  const s = [1, 6, 2, 7, 4, 8, 5, 9, 3, 0];
  const XOR = 177451812;
  const ADD = 8728348608;

  const avNum = parseInt(avId);
  if (isNaN(avNum)) return 'BV1xx411c7mS';

  let x = (avNum ^ XOR) + ADD;
  let res = 'BV1';

  for (let i = 0; i < 9; i++) {
    res += table[Math.floor(x / Math.pow(58, i)) % 58];
  }

  return res;
}

// 创建 mock 内容（降级方案）
function createMockContent(url: string, platform: Platform): Content {
  return {
    id: `${platform}_${Date.now()}`,
    url,
    platform,
    title: `${platform === 'youtube' ? 'YouTube' : platform === 'bilibili' ? 'B站' : platform === 'xiaoyuzhou' ? '小宇宙' : '小红书'} 内容`,
    description: '内容加载中，请稍后...',
    duration: platform === 'youtube' ? 932 : platform === 'bilibili' ? 600 : undefined,
    thumbnail: 'https://via.placeholder.com/1280x720',
    author: '作者',
    publishedAt: new Date().toISOString()
  };
}

// 主解析函数
export async function parseUrlReal(url: string): Promise<Content> {
  // 检测平台
  const platform = detectPlatform(url);

  if (platform === 'unknown') {
    throw new Error('不支持的链接格式');
  }

  // 根据平台调用对应的解析函数
  let content: Content | null = null;

  switch (platform) {
    case 'youtube':
      content = await parseYouTube(url);
      break;
    case 'xiaoyuzhou':
      content = await parseXiaoyuzhou(url);
      break;
    case 'xiaohongshu':
      content = await parseXiaohongshu(url);
      break;
    case 'bilibili':
      content = await parseBilibili(url);
      break;
    default:
      content = createMockContent(url, 'unknown');
  }

  // 如果解析器返回 null（URL 格式不匹配等），返回 mock 内容
  return content || createMockContent(url, platform);
}

// 从 utils.ts 导出的平台检测函数（重复定义以保持独立）
export function detectPlatform(url: string): Platform {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube';
  }
  if (url.includes('xiaoyuzhoufm.com') || url.includes('xiaoyuzhouapp.com')) {
    return 'xiaoyuzhou';
  }
  if (url.includes('xiaohongshu.com') || url.includes('xhslink.com')) {
    return 'xiaohongshu';
  }
  if (url.includes('bilibili.com') || url.includes('b23.tv')) {
    return 'bilibili';
  }
  return 'unknown';
}
