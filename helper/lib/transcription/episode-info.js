'use strict';

function extractEpisodeId(url) {
  const match = String(url || '').match(/episode\/([a-f0-9]+)/i);
  return match ? match[1] : '';
}

function createTimeoutSignal(timeoutMs, signal) {
  if (!signal) return AbortSignal.timeout(timeoutMs);
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  }
  return signal;
}

async function fetchFromOfficialApi(episodeId, signal) {
  try {
    const response = await fetch('https://api.xiaoyuzhoufm.com/v1/episode/get', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'okhttp/4.7.2',
        applicationid: 'app.podcast.cosmos',
        'app-version': '1.6.0',
      },
      body: JSON.stringify({ eid: episodeId }),
      signal: createTimeoutSignal(10000, signal),
    });

    if (!response.ok) return null;
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
    if (signal?.aborted) throw error;
    return null;
  }
}

async function fetchFromPageHtml(episodeId, signal) {
  try {
    const response = await fetch(`https://www.xiaoyuzhoufm.com/episode/${episodeId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: createTimeoutSignal(15000, signal),
    });
    if (!response.ok) return null;
    const html = await response.text();

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const episode =
          nextData?.props?.pageProps?.episode ||
          nextData?.props?.pageProps?.data?.episode ||
          nextData?.props?.pageProps;
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
      } catch {}
    }

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
    if (signal?.aborted) throw error;
    return null;
  }
}

async function fetchFromThirdPartyApi(episodeId, signal) {
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
    if (signal?.aborted) throw error;
    return null;
  }
}

async function fetchEpisodeInfo(url, signal) {
  const episodeId = extractEpisodeId(url);
  if (!episodeId) {
    throw new Error('无效的小宇宙链接格式，请确认链接包含 /episode/ 路径');
  }

  const fromApi = await fetchFromOfficialApi(episodeId, signal);
  if (fromApi) return fromApi;
  const fromPage = await fetchFromPageHtml(episodeId, signal);
  if (fromPage) return fromPage;
  const fromThird = await fetchFromThirdPartyApi(episodeId, signal);
  if (fromThird) return fromThird;

  throw new Error('无法获取播客音频链接，请检查链接是否正确或稍后重试');
}

module.exports = {
  extractEpisodeId,
  createTimeoutSignal,
  fetchFromOfficialApi,
  fetchFromPageHtml,
  fetchFromThirdPartyApi,
  fetchEpisodeInfo,
};
