import type {
  LanguageModelProvider,
  LanguageModelProviderConfig,
  LanguageModelSettings,
} from "@/types";

export interface LanguageModelProviderMeta {
  id: LanguageModelProvider;
  label: string;
  description: string;
  apiKeyPlaceholder: string;
  modelSuggestions: string[];
}

export const LANGUAGE_MODEL_PROVIDER_ORDER: LanguageModelProvider[] = [
  "openai",
  "claude",
  "gemini",
  "qwen",
  "zhipu",
];

export const LANGUAGE_MODEL_PROVIDER_META: Record<LanguageModelProvider, LanguageModelProviderMeta> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    description: "GPT 系列模型，适合通用对话、总结和推理任务。",
    apiKeyPlaceholder: "sk-...",
    modelSuggestions: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
  },
  claude: {
    id: "claude",
    label: "Claude",
    description: "Anthropic Claude 模型，适合长文本理解与稳健写作。",
    apiKeyPlaceholder: "sk-ant-...",
    modelSuggestions: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-3-7-sonnet-latest"],
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    description: "Gemini 多模态模型，适合通用生成与快速推理。",
    apiKeyPlaceholder: "AIza...",
    modelSuggestions: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
  qwen: {
    id: "qwen",
    label: "Qwen",
    description: "通义千问文本模型。",
    apiKeyPlaceholder: "sk-...",
    modelSuggestions: ["qwen-plus", "qwen-max", "qwen-turbo"],
  },
  zhipu: {
    id: "zhipu",
    label: "ZhiPu AI",
    description: "智谱 GLM 模型，适合中文场景与通用文本任务。",
    apiKeyPlaceholder: "填写智谱 API Key",
    modelSuggestions: ["glm-4.5-flash", "glm-4.5", "glm-4-flash"],
  },
};

export const DEFAULT_LANGUAGE_MODEL_PROVIDER_CONFIGS: Record<
  LanguageModelProvider,
  LanguageModelProviderConfig
> = {
  openai: {
    apiKey: "",
    apiKeyConfigured: false,
    model: "gpt-4.1-mini",
    baseUrl: "https://api.openai.com/v1",
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
  claude: {
    apiKey: "",
    apiKeyConfigured: false,
    model: "claude-sonnet-4-5",
    baseUrl: "https://api.anthropic.com/v1",
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
  gemini: {
    apiKey: "",
    apiKeyConfigured: false,
    model: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
  qwen: {
    apiKey: "",
    apiKeyConfigured: false,
    model: "qwen-plus",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
  zhipu: {
    apiKey: "",
    apiKeyConfigured: false,
    model: "glm-4.5-flash",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    temperature: 0.7,
    maxTokens: 4096,
    enabled: false,
  },
};

export function createDefaultLanguageModelSettings(): LanguageModelSettings {
  return {
    providers: {
      openai: { ...DEFAULT_LANGUAGE_MODEL_PROVIDER_CONFIGS.openai },
      claude: { ...DEFAULT_LANGUAGE_MODEL_PROVIDER_CONFIGS.claude },
      gemini: { ...DEFAULT_LANGUAGE_MODEL_PROVIDER_CONFIGS.gemini },
      qwen: { ...DEFAULT_LANGUAGE_MODEL_PROVIDER_CONFIGS.qwen },
      zhipu: { ...DEFAULT_LANGUAGE_MODEL_PROVIDER_CONFIGS.zhipu },
    },
  };
}
