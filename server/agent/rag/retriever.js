import config from '../../config/agent.js';
import { randomUUID } from 'crypto';

const EMBEDDING_DIM = 1024;

class Retriever {
  constructor(vectorStore, llmClient) {
    this.vectorStore = vectorStore;
    this.llmClient = llmClient;
    this.embeddingEnabled = true;
  }

  async init() {
    await this.vectorStore.init();
    // Test embedding API on first call
    if (this.embeddingEnabled && (!config.llm?.apiKey || !config.llm?.baseUrl)) {
      this.embeddingEnabled = false;
      console.warn('[RAG] Embedding API not configured, falling back to keyword search');
    }
  }

  async search(query, options = {}) {
    const topK = options.topK || 5;
    const useEmbedding = options.useEmbedding !== false && this.embeddingEnabled;

    let vectorResults = [];
    let keywordResults = [];

    // Parallel: try vector search and keyword search
    const promises = [];

    if (useEmbedding) {
      promises.push(
        this._getEmbedding(query)
          .then(embedding => this.vectorStore.search(embedding, topK))
          .catch(err => {
            console.warn('[RAG] Vector search failed, falling back to keyword:', err.message);
            this.embeddingEnabled = false;
            return [];
          })
      );
    }

    promises.push(this.searchKeyword(query, topK));

    const results = await Promise.all(promises);

    if (useEmbedding) {
      vectorResults = results[0] || [];
      keywordResults = results[1] || [];
    } else {
      keywordResults = results[0] || [];
    }

    return this._mergeResults(vectorResults, keywordResults, topK);
  }

  async searchKeyword(query, topK = 5) {
    const queryTerms = this._extractTerms(query);
    const results = [];

    for (const [id, doc] of this.vectorStore.vectors) {
      if (!doc.text) continue;
      const lowerText = doc.text.toLowerCase();
      let matchScore = 0;

      for (const term of queryTerms) {
        if (term.length < 2) continue;
        const lowerTerm = term.toLowerCase();
        const count = this._countOccurrences(lowerText, lowerTerm);
        if (count > 0) {
          matchScore += count * Math.sqrt(lowerTerm.length);
        }
      }

      if (matchScore > 0) {
        results.push({
          id: doc.id,
          text: doc.text,
          metadata: doc.metadata,
          score: matchScore,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async addKnowledge(id, text, metadata = {}) {
    if (!this.embeddingEnabled) {
      // Fallback: store without embedding, keyword search will still work
      const doc = {
        id,
        text,
        metadata,
        embedding: new Array(EMBEDDING_DIM).fill(0),
      };
      await this.vectorStore.add(id, text, doc.embedding, metadata);
      return doc;
    }

    try {
      const embedding = await this._getEmbedding(text);
      await this.vectorStore.add(id, text, embedding, metadata);
      return { id, embedding, metadata };
    } catch (err) {
      console.warn('[RAG] Failed to embed knowledge, storing without vector:', err.message);
      const doc = {
        id,
        text,
        metadata,
        embedding: new Array(EMBEDDING_DIM).fill(0),
      };
      await this.vectorStore.add(id, text, doc.embedding, metadata);
      return doc;
    }
  }

  async removeKnowledge(id) {
    return this.vectorStore.delete(id);
  }

  async _mergeResults(vectorResults, keywordResults, topK) {
    const seen = new Set();
    const merged = [];

    // Weight vector results higher (0.7) vs keyword (0.3)
    const vectorWeight = 0.7;
    const keywordWeight = 0.3;

    // Normalize scores
    const maxVectorScore = vectorResults.length > 0 ? Math.max(...vectorResults.map(r => r.score)) : 1;
    const maxKeywordScore = keywordResults.length > 0 ? Math.max(...keywordResults.map(r => r.score)) : 1;

    const keywordMap = new Map(keywordResults.map(r => [r.id, r]));

    for (const vr of vectorResults) {
      const normScore = vr.score / maxVectorScore;
      const kw = keywordMap.get(vr.id);
      const combinedScore = kw
        ? normScore * vectorWeight + (kw.score / maxKeywordScore) * keywordWeight
        : normScore * vectorWeight;

      merged.push({
        ...vr,
        score: combinedScore,
        hasVectorMatch: true,
        hasKeywordMatch: !!kw,
      });
      seen.add(vr.id);
    }

    for (const kr of keywordResults) {
      if (!seen.has(kr.id)) {
        merged.push({
          ...kr,
          score: (kr.score / maxKeywordScore) * keywordWeight,
          hasVectorMatch: false,
          hasKeywordMatch: true,
        });
      }
    }

    merged.sort((a, b) => b.score - a.score);
    return merged.slice(0, topK);
  }

  async _getEmbedding(text) {
    const { baseUrl, apiKey } = config.llm;
    const model = config.llm.embeddingModel || 'deepseek-embedder';

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text,
        encoding_format: 'float',
      }),
      signal: AbortSignal.timeout(config.llm.timeout || 10000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Embedding API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data.data || data.data.length === 0) {
      throw new Error('Embedding API returned no embeddings');
    }

    return data.data[0].embedding;
  }

  _extractTerms(text) {
    // Split by whitespace and common delimiters, filter short tokens
    return text
      .split(/[\s,，.。;；:：!！?？、\n\r]+/)
      .filter(t => t.length >= 2)
      .filter((t, i, arr) => arr.indexOf(t) === i); // deduplicate
  }

  _countOccurrences(text, term) {
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(term, pos)) !== -1) {
      count++;
      pos += term.length;
    }
    return count;
  }
}

export default Retriever;
