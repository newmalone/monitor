import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorsDir = path.join(__dirname, '../../data_agent/vectors');
const DEFAULT_FILE = path.join(vectorsDir, 'knowledge.json');

const EMBEDDING_DIM = 1024;

class VectorStore {
  constructor(filePath = DEFAULT_FILE) {
    this.filePath = filePath;
    this.vectors = new Map(); // id -> { id, embedding, text, metadata }
  }

  async init() {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content);
      for (const item of (data.vectors || [])) {
        this.vectors.set(item.id, item);
      }
    } catch {
      // File doesn't exist or is invalid, start fresh
      await this.save();
    }
  }

  async add(id, text, embedding, metadata = {}) {
    this.vectors.set(id, {
      id,
      embedding,
      text,
      metadata,
      createdAt: new Date().toISOString(),
    });
    await this.save();
  }

  async addBatch(documents) {
    for (const doc of documents) {
      this.vectors.set(doc.id, {
        id: doc.id,
        embedding: doc.embedding,
        text: doc.text,
        metadata: doc.metadata || {},
        createdAt: doc.createdAt || new Date().toISOString(),
      });
    }
    await this.save();
  }

  async search(queryEmbedding, topK = 5) {
    const results = [];
    for (const [id, doc] of this.vectors) {
      if (!doc.embedding || doc.embedding.length !== queryEmbedding.length) {
        continue;
      }
      const similarity = this._cosineSimilarity(queryEmbedding, doc.embedding);
      results.push({
        id: doc.id,
        text: doc.text,
        metadata: doc.metadata,
        score: similarity,
      });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async delete(id) {
    const existed = this.vectors.has(id);
    this.vectors.delete(id);
    if (existed) {
      await this.save();
    }
    return existed;
  }

  count() {
    return this.vectors.size;
  }

  async save() {
    const data = {
      vectors: Array.from(this.vectors.values()),
      embeddingDim: EMBEDDING_DIM,
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  _cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) {
      return 0;
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export default VectorStore;
