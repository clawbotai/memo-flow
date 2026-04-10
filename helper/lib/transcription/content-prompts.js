'use strict';

const MAX_CONTENT_PROMPT_TRANSCRIPT_CHARS = 18000;

function clipTranscript(transcript, maxChars = MAX_CONTENT_PROMPT_TRANSCRIPT_CHARS) {
  const normalized = String(transcript || '').trim();
  const clipped = normalized.slice(0, maxChars);
  return {
    text: clipped,
    clipped: normalized.length > clipped.length,
  };
}

function buildPointExtractionPrompt(record) {
  const transcript = String(record?.transcript || '').trim();
  if (!transcript) {
    throw new Error('当前转录内容为空，无法提炼观点');
  }

  const { text, clipped } = clipTranscript(transcript);
  const clippedHint = clipped
    ? '\n注意：以下转录内容过长，已截断；请优先提取信息密度高、适合传播的观点。'
    : '';

  return [
    '你是一个内容分析专家。请分析以下播客/视频转录内容，提取可传播的观点。',
    clippedHint,
    '',
    `转录标题：${record?.title || '未命名转录'}`,
    '',
    '转录内容：',
    text,
    '',
    '请按以下 JSON 格式返回（只返回 JSON，不要输出其他解释内容）：',
    '',
    '{',
    '  "theme": "用一句话概括核心主题",',
    '  "viralPoints": [',
    '    {',
    '      "text": "易于传播的观点 1",',
    '      "sourceText": "对应的原文片段",',
    '      "sourceTimestamp": "时间戳（如 02:34）"',
    '    }',
    '  ],',
    '  "controversialPoints": [',
    '    {',
    '      "text": "有争议/反常识的观点 1",',
    '      "sourceText": "对应的原文片段",',
    '      "sourceTimestamp": "时间戳（如 05:12）"',
    '    }',
    '  ],',
    '  "quotes": [',
    '    {',
    '      "text": "金句 1",',
    '      "sourceText": "对应的原文片段",',
    '      "sourceTimestamp": "时间戳（如 08:45）"',
    '    }',
    '  ]',
    '}',
    '',
    '要求：',
    '1. 所有观点必须来源于原文，不编造原文中不存在的信息',
    '2. 每条观点必须附带来源片段和时间戳；如果原文没有明确时间戳，也尽量给出最接近的位置',
    '3. viralPoints、controversialPoints、quotes 每个类别输出 3 到 8 条',
    '4. 文案保持简洁、自然、适合后续写作使用',
  ].join('\n');
}

function formatSelectedPoints(selectedPoints) {
  return selectedPoints.map((point, index) => {
    return [
      `${index + 1}. [${point.type}] ${point.text}`,
      point.sourceText ? `来源片段：${point.sourceText}` : '',
      point.sourceTimestamp ? `时间戳：${point.sourceTimestamp}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }).join('\n\n');
}

function buildRedbookPrompt(record, selectedPoints) {
  if (!Array.isArray(selectedPoints) || selectedPoints.length === 0) {
    throw new Error('未选择观点，无法生成小红书内容');
  }

  return [
    '你是一个小红书内容创作专家。请根据用户选择的观点，生成一篇小红书笔记。',
    '',
    `转录标题：${record?.title || '未命名转录'}`,
    '',
    '用户选择的观点：',
    formatSelectedPoints(selectedPoints),
    '',
    '请按以下 JSON 格式返回（只返回 JSON，不要输出其他解释内容）：',
    '',
    '{',
    '  "title": "吸引人的标题（20 字以内，可使用 emoji）",',
    '  "content": "正文内容（500-800 字，可分段）",',
    '  "tags": ["标签1", "标签2", "标签3"]',
    '}',
    '',
    '要求：',
    '1. 标题需要有吸引力，但不能脱离原文事实',
    '2. 正文 500-800 字，建议 3-5 段，口语化、自然、有阅读节奏',
    '3. 允许适度使用 emoji、分段符号和轻量情绪表达，但不要过度堆砌',
    '4. 不允许编造原文中不存在的信息，不要做强夸张改写',
    '5. tags 输出 3-5 个，保留井号前的纯标签文本即可',
  ].join('\n');
}

module.exports = {
  MAX_CONTENT_PROMPT_TRANSCRIPT_CHARS,
  clipTranscript,
  buildPointExtractionPrompt,
  buildRedbookPrompt,
};
