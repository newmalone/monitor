class ContextBuilder {
  buildPrompt(query, searchResults, conversationContext = {}) {
    const systemPrompt = this._buildSystemPrompt(searchResults);
    const userPrompt = this._buildUserPrompt(query, conversationContext);

    return {
      system: systemPrompt,
      user: userPrompt,
    };
  }

  formatResponse(searchResults, answer) {
    const sources = this._extractSources(searchResults);
    const hasAnswer = !!(answer && answer.trim().length > 0);
    const confidence = this._calculateConfidence(searchResults, hasAnswer);

    return {
      message: answer || '抱歉，未找到相关信息来回答您的问题。',
      sources,
      hasAnswer,
      confidence,
    };
  }

  _buildSystemPrompt(searchResults) {
    let prompt = '你是设备监控系统助手。以下信息可能与用户的问题相关：\n\n';

    if (searchResults && searchResults.length > 0) {
      prompt += '### 参考知识\n\n';
      searchResults.forEach((result, index) => {
        const source = result.metadata?.title || '未知来源';
        const chunkIdx = result.metadata?.chunkIndex !== undefined ? result.metadata.chunkIndex + 1 : '';
        prompt += `[来源 ${index + 1}] ${source}${chunkIdx ? ` (第${chunkIdx}段)` : ''}\n`;
        prompt += `${result.text}\n\n`;
        prompt += `相关度: ${(result.score * 100).toFixed(1)}%\n\n---\n\n`;
      });
    } else {
      prompt += '⚠️ 未找到相关的参考知识。\n\n';
    }

    prompt += `请根据以上参考信息回答用户的问题。如果参考信息不足以回答问题，请明确告知用户，并尝试提供一些一般性建议。
回答时请引用相关的来源编号，例如"[来源1]"。
保持回答简洁、专业、有帮助。`;

    return prompt;
  }

  _buildUserPrompt(query, conversationContext) {
    let prompt = `用户问题：${query}\n\n`;

    if (conversationContext && conversationContext.recentMessages) {
      const recent = conversationContext.recentMessages.slice(-3);
      if (recent.length > 0) {
        prompt += '### 对话上下文\n';
        for (const msg of recent) {
          const role = msg.role === 'user' ? '用户' : '助手';
          prompt += `${role}: ${msg.content}\n`;
        }
        prompt += '\n';
      }
    }

    prompt += '请结合参考信息给出回答。';
    return prompt;
  }

  _extractSources(searchResults) {
    if (!searchResults || searchResults.length === 0) {
      return [];
    }

    return searchResults.map((result, index) => ({
      index: index + 1,
      title: result.metadata?.title || '未知来源',
      category: result.metadata?.category || '',
      chunkIndex: result.metadata?.chunkIndex,
      score: result.score,
      snippet: result.text?.slice(0, 200),
    }));
  }

  _calculateConfidence(searchResults, hasAnswer) {
    if (!searchResults || searchResults.length === 0) {
      return 0.1;
    }

    const topScore = searchResults[0]?.score || 0;
    const resultCount = searchResults.length;

    let baseConfidence = Math.min(topScore * 1.5, 0.9);
    if (resultCount >= 3) {
      baseConfidence += 0.05;
    }
    if (hasAnswer) {
      baseConfidence += 0.1;
    }

    return Math.min(Math.round(baseConfidence * 100) / 100, 0.95);
  }
}

export default ContextBuilder;
