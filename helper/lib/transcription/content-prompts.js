'use strict';

const MAX_CONTENT_PROMPT_TRANSCRIPT_CHARS = 18000;
const DEFAULT_CONTENT_PLATFORM = 'redbook';

const POINT_EXTRACTION_PROFILES = {
  redbook: {
    platformName: '小红书',
    promptRole:
      '你是一名擅长提炼“小红书可传播观点”的资深内容编辑，尤其擅长从播客、访谈、演讲、视频转录中提炼出有立场、可讨论、可引用、适合平台传播的表达。',
    platformContext: [
      '你的任务不是做中性总结，而是提炼出适合小红书传播语境的观点。',
      '优先输出适合做标题、封面文案、小标题、正文开头、评论区讨论点的表达。',
      '优先考虑“认知反差、情绪张力、冲突感、态度感、可引用性”，而不是完整复述原文。',
    ],
    pointRules: [
      '每个观点都必须立场鲜明，不能模糊、不能正确但无聊、不能只是总结原文。',
      '优先提炼带有“冲突感、认知反差、态度判断、价值取舍”的表达。',
      '如果原文表达偏平，请主动挖掘其中最值得讨论的潜台词，并用更锋利但不失真的方式重写。',
      '不要写“这很重要”“值得思考”“说明了一个趋势”这类空泛句子。',
      '观点必须让人一眼看懂，并且具备“想转发、想评论、想反驳”的潜力。',
    ],
    controversialRules: [
      '必须具备反常识、逆主流或挑战惯性认知的特点。',
      '不要为了争议而争议，必须能在原文中找到依据。',
      '优先输出“第一眼不认同，但细想有道理”的观点。',
    ],
    quoteRules: [
      '金句要短、狠、准，适合直接引用、做标题、配图或短视频字幕。',
      '尽量控制在 12-30 字，优先使用短句、对比句、判断句。',
      '避免解释性语言、空话和废话，保留节奏感和判断感。',
    ],
    outputCounts: {
      viralPoints: 5,
      controversialPoints: 3,
      quotes: 10,
    },
  },
  twitter: {
    platformName: 'Twitter/X',
    promptRole:
      '你是一名擅长提炼“适合 Twitter/X 传播的锋利观点”的内容编辑，擅长把长内容压缩成可讨论、可转发、可做线程展开的判断。',
    platformContext: [
      '优先输出适合做推文开头、线程主张、观点型短句的表达。',
      '强调结论先行、判断明确、信息密度高，减少修饰。',
    ],
    pointRules: [
      '每个观点都必须像一句能单独发出的推文主张，短、硬、清晰。',
      '避免套话和空泛洞察，优先输出能激发讨论的判断。',
      '如果原文信息很多，优先提炼最值得被转发和引用的核心结论。',
    ],
    controversialRules: [
      '优先选择能够挑战共识、制造讨论张力的判断。',
      '争议点必须能被原文支持，不能脱离上下文硬造观点。',
    ],
    quoteRules: [
      '金句尽量短，优先一句话一个判断。',
      '适合截图传播或拆成线程中的单条推文。',
    ],
    outputCounts: {
      viralPoints: 5,
      controversialPoints: 3,
      quotes: 10,
    },
  },
};

function clipTranscript(transcript, maxChars = MAX_CONTENT_PROMPT_TRANSCRIPT_CHARS) {
  const normalized = String(transcript || '').trim();
  const clipped = normalized.slice(0, maxChars);
  return {
    text: clipped,
    clipped: normalized.length > clipped.length,
  };
}

function resolvePointExtractionProfile(platform) {
  const normalized = String(platform || '').trim().toLowerCase();
  return POINT_EXTRACTION_PROFILES[normalized] || POINT_EXTRACTION_PROFILES[DEFAULT_CONTENT_PLATFORM];
}

function buildPointExtractionPrompt(record, platform = DEFAULT_CONTENT_PLATFORM) {
  const transcript = String(record?.transcript || '').trim();
  if (!transcript) {
    throw new Error('当前转录内容为空，无法提炼观点');
  }

  const profile = resolvePointExtractionProfile(platform);
  const { text, clipped } = clipTranscript(transcript);
  const clippedHint = clipped
    ? `\n注意：以下转录内容过长，已截断；请优先提取信息密度高、最适合${profile.platformName}传播的观点。`
    : '';

  return [
    profile.promptRole,
    clippedHint,
    '',
    '请基于以下内容，提炼出适合目标平台传播的表达。',
    '',
    `目标平台：${profile.platformName}`,
    '',
    '平台目标：',
    ...profile.platformContext.map((line) => `- ${line}`),
    '',
    `转录标题：${record?.title || '未命名转录'}`,
    '',
    '转录内容：',
    text,
    '',
    '输出要求：',
    '',
    '一、关于“有传播力的观点”',
    ...profile.pointRules.map((line) => `- ${line}`),
    '',
    '二、关于“有争议或反直觉的观点”',
    ...profile.controversialRules.map((line) => `- ${line}`),
    '',
    '三、关于“可以直接引用的金句”',
    ...profile.quoteRules.map((line) => `- ${line}`),
    '',
    '四、整体要求',
    '- 所有内容都必须来源于原文，不得编造原文中不存在的信息、经历或结论。',
    '- 允许对原文进行提纯、重写和强化，但不能改变原意。',
    '- 不要重复表达同一个意思；每条都应有清晰区别。',
    '- sourceText 尽量截取最能支撑该观点的原文片段，避免过长。',
    '- sourceTimestamp 请尽量给出最接近的位置；如果原文没有明确时间戳，也要给出估计位置。',
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
    '1. theme 输出 1 条',
    `2. viralPoints 目标输出 ${profile.outputCounts.viralPoints} 条、controversialPoints 目标输出 ${profile.outputCounts.controversialPoints} 条、quotes 目标输出 ${profile.outputCounts.quotes} 条；如果原文信息不足，可以少输出，绝不能为了凑数而编造、重复或硬拆观点`,
    '3. 每条观点和金句都必须附带 sourceText 与 sourceTimestamp',
    '4. text 字段必须是提炼、重写后的结果，不要直接照抄原文大段句子',
    '5. 文案保持简洁、具体、有立场，便于后续直接用于内容创作',
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
    '你是一名小红书爆款写手。',
    '请根据用户选择的观点，生成一篇“容易被点赞、收藏、转发”的小红书笔记。',
    '',
    `转录标题：${record?.title || '未命名转录'}`,
    '',
    '用户选择的观点：',
    formatSelectedPoints(selectedPoints),
    '',
    '写作要求：',
    '1. 标题必须具备以下至少一种特征：',
    '   - 反差感，例如“越努力越失败”这类认知反转',
    '   - 结果导向，例如“我用 X 方法做到了 Y”',
    '   - 情绪触发，例如焦虑、顿悟、震惊、清醒、后悔',
    '2. 标题要抓人，但不能脱离原文事实，不做标题党。',
    '3. 正文结构必须清晰：',
    '   - 开头先抛出问题、痛点或直接下结论',
    '   - 中间拆成 3-5 个分点表达',
    '   - 每一点都要简洁、明确、有信息量，不要大段空话',
    '   - 结尾要有一句总结，并附带一个自然的互动问题或互动引导',
    '4. 风格必须像真实用户分享经验或感受：',
    '   - 不要写得像文章、演讲稿或报告',
    '   - 不要出现明显 AI 腔、模板腔、正确废话',
    '   - 语言口语化、自然，有轻微情绪但不过度表演',
    '5. 内容必须建立在用户选择的观点上，可以重写、组织和强化表达，但不能编造原文中不存在的信息。',
    '6. 正文请控制在 400-700 字，分段清晰，便于直接发布后修改。',
    '7. 可适度使用 emoji、序号、短句、换行来增强阅读节奏，但不要堆砌。',
    '8. 如果素材本身偏理性，请优先把它改写成“亲历感 + 判断感 + 可执行建议”的表达。',
    '',
    '请特别注意：',
    '- 开头前 2 句必须有钩子，能让用户继续往下看。',
    '- 中间每个分点都尽量写成“一个判断 + 一句解释”或“一个问题 + 一个结论”。',
    '- 结尾互动不要生硬，像真实博主在评论区发问。',
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
    '1. title 输出 1 条，控制在 20 字以内，优先让人产生点击欲',
    '2. content 输出 1 条，正文 400-700 字，必须符合“开头-分点-结尾互动”的结构',
    '3. 不允许编造原文中不存在的信息，不要做脱离事实的强夸张改写',
    '4. 整体语气要像真人，不要出现“首先/其次/最后/总的来说”这类强模板连接词',
    '5. tags 输出 3-5 个，保留井号前的纯标签文本即可',
  ].join('\n');
}

module.exports = {
  DEFAULT_CONTENT_PLATFORM,
  MAX_CONTENT_PROMPT_TRANSCRIPT_CHARS,
  resolvePointExtractionProfile,
  clipTranscript,
  buildPointExtractionPrompt,
  buildRedbookPrompt,
};
