import config from '../config/agent.js';

class LLMClient {
  constructor(customConfig = {}) {
    this.config = {
      ...config.llm,
      ...customConfig,
    };
  }

  async chat(messages, options = {}) {
    const { maxTokens = 1024, temperature = 0.7 } = options;

    const body = {
      model: this.config.model,
      messages: this._formatMessages(messages),
      max_tokens: maxTokens,
      temperature,
    };

    if (this.config.provider === 'deepseek') {
      body.stream = options.stream || false;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`LLM API error (${response.status}): ${errorText}`);
      }

      if (options.stream) {
        return response.body;
      }

      const data = await response.json();

      // Check if the response has an error structure
      if (data.error) {
        throw new Error(`LLM API error: ${typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error)}`);
      }

      return this._parseResponse(data);
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error('LLM API request timeout');
      }
      throw error;
    }
  }

  async parseIntent(userInput, context = {}) {
    const systemPrompt = `你是一个智能意图识别助手。请分析用户的输入，识别其意图并提取相关参数。

支持的意图类型（intent）：
- query_stats: 查询统计数据（如在线率、故障率等）
- query_devices: 查询设备列表或设备信息
- generate_report: 生成报告
- compare_data: 数据对比分析
- knowledge_qa: 知识问答
- help: 帮助请求
- other: 其他

请返回JSON格式：
{
  "intent": "意图类型",
  "params": {
    "date": "日期（如果有）",
    "manufacturer": "厂商（如果有）",
    "deviceType": "设备类型（如果有）",
    "region": "区域（如果有）",
    "metric": "指标名称（如果有）"
  },
  "confidence": 0.0-1.0的置信度
}

只返回JSON，不要包含其他内容。`;

    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    if (context && context.recentMessages && context.recentMessages.length > 0) {
      messages.push(...context.recentMessages.slice(-5));
    }

    messages.push({ role: 'user', content: userInput });

    try {
      const result = await this.chat(messages, { maxTokens: 512, temperature: 0.1 });
      return this._parseIntentResult(result);
    } catch (error) {
      console.error('Intent parsing failed:', error.message);
      return this._fallbackIntent(userInput);
    }
  }

  _formatMessages(messages) {
    if (Array.isArray(messages)) {
      return messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content,
      }));
    }
    return [{ role: 'user', content: messages }];
  }

  _parseResponse(data) {
    if (!data.choices || data.choices.length === 0) {
      throw new Error('LLM API returned no choices');
    }

    const choice = data.choices[0];
    return {
      content: choice.message?.content || '',
      finishReason: choice.finish_reason,
      usage: data.usage,
    };
  }

  _parseIntentResult(result) {
    let content = result.content.trim();

    // Remove markdown code fences if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    try {
      const parsed = JSON.parse(content);
      return {
        intent: parsed.intent || 'other',
        params: parsed.params || {},
        confidence: parsed.confidence || 0.5,
      };
    } catch {
      return this._fallbackIntent(content);
    }
  }

  _fallbackIntent(userInput) {
    const lower = userInput.toLowerCase();

    if (lower.includes('统计') || lower.includes('在线率') || lower.includes('故障率') || lower.includes('多少')) {
      return { intent: 'query_stats', params: {}, confidence: 0.5 };
    }
    if (lower.includes('报告') || lower.includes('报表')) {
      return { intent: 'generate_report', params: {}, confidence: 0.5 };
    }
    if (lower.includes('设备') || lower.includes('列表')) {
      return { intent: 'query_devices', params: {}, confidence: 0.5 };
    }
    if (lower.includes('对比') || lower.includes('比较')) {
      return { intent: 'compare_data', params: {}, confidence: 0.5 };
    }
    if (lower.includes('帮助') || lower.includes('怎么') || lower.includes('如何')) {
      return { intent: 'help', params: {}, confidence: 0.5 };
    }

    return { intent: 'other', params: {}, confidence: 0.3 };
  }
}

export default LLMClient;
