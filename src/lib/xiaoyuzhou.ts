// 小宇宙播客工具
// 功能：从 episode URL 提取播客信息，包括音频链接和元数据

export interface XiaoyuzhouEpisode {
  title: string;
  description: string;
  audioUrl: string;
  duration?: number;
  pubDate?: string;
  author: string;
  thumbnail?: string;
}

interface FetchEpisodeOptions {
  signal?: AbortSignal;
}

function createTimeoutSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  if (!signal) {
    return AbortSignal.timeout(timeoutMs);
  }

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const abortFromParent = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      abortFromParent();
    } else {
      signal.addEventListener('abort', abortFromParent, { once: true });
    }
  }

  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeout);
  }, { once: true });

  return controller.signal;
}

/**
 * 从小宇宙页面 URL 提取 episode ID
 * 格式：https://www.xiaoyuzhoufm.com/episode/{episodeId}
 */
function extractEpisodeId(url: string): string {
  const match = url.match(/episode\/([a-f0-9]+)/i);
  return match ? match[1] : '';
}

/**
 * 获取播客信息 - 多策略尝试
 */
export async function fetchEpisodeInfo(
  episodeUrl: string,
  options: FetchEpisodeOptions = {},
): Promise<XiaoyuzhouEpisode> {
  const episodeId = extractEpisodeId(episodeUrl);

  if (!episodeId) {
    throw new Error('无效的小宇宙链接格式，请确认链接包含 /episode/ 路径');
  }

  // 策略1: 调用小宇宙官方 API
  const fromApi = await fetchFromOfficialApi(episodeId, options.signal);
  if (fromApi) return fromApi;

  // 策略2: 从页面 HTML 中提取数据
  const fromPage = await fetchFromPageHtml(episodeId, options.signal);
  if (fromPage) return fromPage;

  // 策略3: 尝试第三方 API
  const fromThirdParty = await fetchFromThirdPartyApi(episodeId, options.signal);
  if (fromThirdParty) return fromThirdParty;

  throw new Error('无法获取播客音频链接，请检查链接是否正确或稍后重试');
}

/**
 * 策略1: 调用小宇宙官方 API
 */
async function fetchFromOfficialApi(
  episodeId: string,
  signal?: AbortSignal,
): Promise<XiaoyuzhouEpisode | null> {
  try {
    const response = await fetch('https://api.xiaoyuzhoufm.com/v1/episode/get', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'okhttp/4.7.2',
        'applicationid': 'app.podcast.cosmos',
        'app-version': '1.6.0',
      },
      body: JSON.stringify({ eid: episodeId }),
      signal: createTimeoutSignal(10000, signal),
    });

    if (!response.ok) {
      console.log(`Official API returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    const audioUrl = data?.data?.enclosure?.url || data?.enclosure?.url || data?.mediaUrl || '';
    if (!audioUrl) return null;

    return {
      title: data?.data?.title || data?.title || '未知标题',
      description: data?.data?.description || data?.data?.shownotes || data?.description || '',
      audioUrl,
      duration: data?.data?.duration ? Math.floor(data.data.duration) : undefined,
      pubDate: data?.data?.pubDate || new Date().toISOString(),
      author: data?.data?.podcast?.author || data?.author || '未知作者',
      thumbnail: data?.data?.image?.picUrl || data?.data?.podcast?.image?.picUrl || '',
    };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    console.log('Official API failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 策略2: 从小宇宙页面 HTML 中提取 __NEXT_DATA__
 */
async function fetchFromPageHtml(
  episodeId: string,
  signal?: AbortSignal,
): Promise<XiaoyuzhouEpisode | null> {
  try {
    const response = await fetch(`https://www.xiaoyuzhoufm.com/episode/${episodeId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: createTimeoutSignal(15000, signal),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // 尝试从 __NEXT_DATA__ 提取
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const episode = nextData?.props?.pageProps?.episode ||
                        nextData?.props?.pageProps?.data?.episode ||
                        nextData?.props?.pageProps;

        if (episode) {
          const audioUrl = episode?.enclosure?.url || episode?.mediaUrl || episode?.audioUrl || '';
          if (audioUrl) {
            return {
              title: episode.title || '未知标题',
              description: episode.description || episode.shownotes || '',
              audioUrl,
              duration: episode.duration ? Math.floor(episode.duration) : undefined,
              pubDate: episode.pubDate || new Date().toISOString(),
              author: episode?.podcast?.author || '未知作者',
              thumbnail: episode?.image?.picUrl || episode?.podcast?.image?.picUrl || '',
            };
          }
        }
      } catch {
        // JSON 解析失败，继续尝试其他方式
      }
    }

    // 尝试从 og:audio meta 标签提取
    const ogAudioMatch = html.match(/<meta\s+property="og:audio"\s+content="([^"]+)"/);
    if (ogAudioMatch) {
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
      return {
        title: titleMatch?.[1] || '未知标题',
        description: '',
        audioUrl: ogAudioMatch[1],
        author: '未知作者',
      };
    }

    // 尝试从页面中提取任何 m4a/mp3 链接
    const audioLinkMatch = html.match(/https?:\/\/[^\s"'<>]*?\.(?:m4a|mp3)(?:\?[^\s"'<>]*)?/);
    if (audioLinkMatch) {
      return {
        title: '未知标题',
        description: '',
        audioUrl: audioLinkMatch[0],
        author: '未知作者',
      };
    }

    return null;
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    console.log('Page HTML extraction failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 策略3: 第三方 API (music.moon.fm)
 */
async function fetchFromThirdPartyApi(
  episodeId: string,
  signal?: AbortSignal,
): Promise<XiaoyuzhouEpisode | null> {
  try {
    const response = await fetch(`https://music.moon.fm/api/v1/episodes/${episodeId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: createTimeoutSignal(10000, signal),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const audioUrl = data.audioUrl || data.playback_url || data.enclosure_url || '';
    if (!audioUrl) return null;

    return {
      title: data.title || '未知标题',
      description: data.description || data.shownotes || '',
      audioUrl,
      duration: data.duration ? Math.floor(data.duration / 1000) : undefined,
      pubDate: data.pubDate || data.publishedAt || new Date().toISOString(),
      author: data.podcast?.author || data.author || '未知作者',
      thumbnail: data.podcast?.coverImage?.urlPattern || data.coverImageUrl || '',
    };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    console.log('Third-party API failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
