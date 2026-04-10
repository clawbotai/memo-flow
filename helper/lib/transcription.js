'use strict';

module.exports = {
  ...require('./transcription/segments'),
  ...require('./transcription/task-context'),
  ...require('./transcription/episode-info'),
  ...require('./transcription/qwen-asr'),
  ...require('./transcription/llm-test'),
  ...require('./transcription/llm-provider'),
  ...require('./transcription/mindmap'),
  ...require('./transcription/content-prompts'),
  ...require('./transcription/content-points'),
  ...require('./transcription/content-generation'),
  ...require('./transcription/audio-pipeline'),
  ...require('./transcription/orchestrator'),
};
