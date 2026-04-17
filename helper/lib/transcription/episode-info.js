'use strict';

const PODCAST_SOURCE = Object.freeze({
  XIAOYUZHOU: 'xiaoyuzhou',
  APPLE_EPISODE: 'apple-episode',
  APPLE_SHOW: 'apple-show',
  APPLE_INVALID: 'apple-invalid',
  UNKNOWN: 'unknown',
});

const APPLE_EPISODE_ONLY_ERROR =
  '当前仅支持 Apple Podcasts 单集链接，请打开具体单集后重新分享链接。';
const APPLE_INVALID_LINK_ERROR = '无效的 Apple Podcasts 链接，请确认链接包含节目和单集信息。';
const APPLE_EPISODE_PARSE_ERROR =
  '暂时无法从该 Apple 链接解析出单集音频，请确认是单集分享链接后重试。';

function parseUrl(url) {
  try {
    return new URL(String(url || '').trim());
  } catch {
    return null;
  }
}

function extractXiaoyuzhouEpisodeId(url) {
  const match = String(url || '').match(/episode\/([a-f0-9]+)/i);
  return match ? match[1] : '';
}

function extractEpisodeId(url) {
  return extractXiaoyuzhouEpisodeId(url);
}

function detectPodcastSource(url) {
  const parsedUrl = parseUrl(url);

  if (parsedUrl) {
    if (parsedUrl.hostname === 'podcasts.apple.com') {
      const hasCollectionId = /\/id(\d+)/i.test(parsedUrl.pathname);
      const trackId = parsedUrl.searchParams.get('i');

      if (!hasCollectionId) {
        return PODCAST_SOURCE.APPLE_INVALID;
      }

      if (!trackId) {
        return PODCAST_SOURCE.APPLE_SHOW;
      }

      if (!/^\d+$/.test(trackId)) {
        return PODCAST_SOURCE.APPLE_INVALID;
      }

      return PODCAST_SOURCE.APPLE_EPISODE;
    }

    if (
      (parsedUrl.hostname === 'www.xiaoyuzhoufm.com' || parsedUrl.hostname === 'xiaoyuzhoufm.com') &&
      extractXiaoyuzhouEpisodeId(parsedUrl.pathname)
    ) {
      return PODCAST_SOURCE.XIAOYUZHOU;
    }
  }

  if (extractXiaoyuzhouEpisodeId(url)) {
    return PODCAST_SOURCE.XIAOYUZHOU;
  }

  return PODCAST_SOURCE.UNKNOWN;
}

function extractApplePodcastIds(url) {
  const parsedUrl = parseUrl(url);
  if (!parsedUrl || parsedUrl.hostname !== 'podcasts.apple.com') {
    throw new Error(APPLE_INVALID_LINK_ERROR);
  }

  const collectionMatch = parsedUrl.pathname.match(/\/id(\d+)/i);
  const trackId = parsedUrl.searchParams.get('i');

  if (collectionMatch && !trackId) {
    throw new Error(APPLE_EPISODE_ONLY_ERROR);
  }

  if (!collectionMatch || !trackId || !/^\d+$/.test(trackId)) {
    throw new Error(APPLE_INVALID_LINK_ERROR);
  }

  return {
    collectionId: collectionMatch[1],
    trackId,
  };
}

function createTimeoutSignal(timeoutMs, signal) {
  if (!signal) return AbortSignal.timeout(timeoutMs);
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  }
  return signal;
}

function isTimeoutError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return error.name === 'TimeoutError' || message.includes('timeout') || message.includes('timed out');
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

async function fetchXiaoyuzhouEpisodeInfo(url, signal) {
  const episodeId = extractXiaoyuzhouEpisodeId(url);
  if (!episodeId) {
    throw new Error('无效的小宇宙单集链接，请确认链接包含 /episode/ 路径');
  }

  const fromApi = await fetchFromOfficialApi(episodeId, signal);
  if (fromApi) return fromApi;
  const fromPage = await fetchFromPageHtml(episodeId, signal);
  if (fromPage) return fromPage;
  const fromThird = await fetchFromThirdPartyApi(episodeId, signal);
  if (fromThird) return fromThird;

  throw new Error('无法获取播客音频链接，请检查链接是否正确或稍后重试');
}

async function fetchAppleLookupResults(collectionId, signal) {
  const lookupUrl = new URL('https://itunes.apple.com/lookup');
  lookupUrl.searchParams.set('id', String(collectionId));
  lookupUrl.searchParams.set('media', 'podcast');
  lookupUrl.searchParams.set('entity', 'podcastEpisode');
  lookupUrl.searchParams.set('limit', '200');

  let response;
  try {
    response = await fetch(lookupUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      signal: createTimeoutSignal(5000, signal),
    });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    if (isTimeoutError(error)) {
      throw new Error('网络请求超时，请稍后重试');
    }

    throw new Error(APPLE_EPISODE_PARSE_ERROR);
  }

  if (!response.ok) {
    throw new Error(APPLE_EPISODE_PARSE_ERROR);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(APPLE_EPISODE_PARSE_ERROR);
  }

  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) {
    throw new Error('该内容在您所在地区不可用');
  }

  return results;
}

async function validateAppleAudioUrl(audioUrl, signal) {
  if (!audioUrl) {
    throw new Error(APPLE_EPISODE_PARSE_ERROR);
  }

  try {
    const response = await fetch(audioUrl, {
      method: 'HEAD',
      redirect: 'manual',
      signal: createTimeoutSignal(5000, signal),
    });

    if (response.status === 200) {
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.startsWith('audio/')) {
        throw new Error(APPLE_EPISODE_PARSE_ERROR);
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && error.message === APPLE_EPISODE_PARSE_ERROR) {
      throw error;
    }
  }
}

function mapAppleEpisodeInfo(results, episode) {
  const collectionInfo =
    results.find(
      (item) => item && String(item.collectionId || '') === String(episode.collectionId || '') && !item.trackId,
    ) || results[0];

  const rawDuration = Number.parseInt(String(episode.trackTimeMillis || ''), 10);
  return {
    title: episode.trackName || collectionInfo?.collectionName || '未知标题',
    description: episode.description || '',
    audioUrl: episode.episodeUrl || '',
    duration: Number.isFinite(rawDuration) && rawDuration > 0 ? Math.floor(rawDuration / 1000) : undefined,
    pubDate: episode.releaseDate || new Date().toISOString(),
    author: episode.artistName || collectionInfo?.collectionName || '未知作者',
    thumbnail:
      episode.artworkUrl600 ||
      episode.artworkUrl100 ||
      collectionInfo?.artworkUrl600 ||
      collectionInfo?.artworkUrl100 ||
      '',
  };
}

async function fetchAppleEpisodeInfo(url, signal) {
  const { collectionId, trackId } = extractApplePodcastIds(url);
  const results = await fetchAppleLookupResults(collectionId, signal);
  const episode = results.find((item) => String(item?.trackId || '') === String(trackId));

  if (!episode) {
    throw new Error(APPLE_EPISODE_PARSE_ERROR);
  }

  const mappedEpisode = mapAppleEpisodeInfo(results, episode);
  if (!mappedEpisode.audioUrl) {
    throw new Error(APPLE_EPISODE_PARSE_ERROR);
  }

  await validateAppleAudioUrl(mappedEpisode.audioUrl, signal);
  return mappedEpisode;
}

async function fetchEpisodeInfo(url, signal) {
  const source = detectPodcastSource(url);

  if (source === PODCAST_SOURCE.XIAOYUZHOU) {
    return fetchXiaoyuzhouEpisodeInfo(url, signal);
  }

  if (source === PODCAST_SOURCE.APPLE_EPISODE) {
    return fetchAppleEpisodeInfo(url, signal);
  }

  if (source === PODCAST_SOURCE.APPLE_SHOW) {
    throw new Error(APPLE_EPISODE_ONLY_ERROR);
  }

  if (source === PODCAST_SOURCE.APPLE_INVALID) {
    throw new Error(APPLE_INVALID_LINK_ERROR);
  }

  throw new Error('无效的播客链接格式，请确认是小宇宙或 Apple Podcasts 单集链接');
}

module.exports = {
  detectPodcastSource,
  extractXiaoyuzhouEpisodeId,
  extractEpisodeId,
  extractApplePodcastIds,
  createTimeoutSignal,
  fetchFromOfficialApi,
  fetchFromPageHtml,
  fetchFromThirdPartyApi,
  fetchXiaoyuzhouEpisodeInfo,
  fetchAppleEpisodeInfo,
  fetchEpisodeInfo,
};
