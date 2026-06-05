export default {
  llm: {
    provider: process.env.LLM_PROVIDER || 'deepseek',
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.LLM_MODEL || 'deepseek-chat',
    timeout: 10000,
  },
  conversation: {
    maxHistoryLength: 50,
    retentionDays: 30,
  },
  cache: {
    statsTTL: 5 * 60 * 1000,    // 5 min
    queryTTL: 30 * 1000,         // 30 sec
    intentTTL: 60 * 1000,        // 1 min
    maxSize: 1000,
  },
  security: {
    maxMessageLength: 2000,
    maxHistoryLength: 20,
  }
};
