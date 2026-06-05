import fs from 'fs/promises';
import { randomUUID } from 'crypto';

class DocumentProcessor {
  async processText(title, content, options = {}) {
    const cleaned = cleanText(content);
    const chunks = chunkText(cleaned, options.chunkSize || 500, options.overlap || 50);
    const metadata = extractMetadata(content, { title, ...options });

    return chunks.map((chunk, index) => ({
      id: randomUUID(),
      title: title || metadata.title || 'untitled',
      chunkIndex: index,
      text: chunk,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
      },
    }));
  }

  async processUpload(filePath, options = {}) {
    const rawContent = await fs.readFile(filePath, 'utf-8');
    const title = options.title || path.basename(filePath);
    return this.processText(title, rawContent, options);
  }

  async processUploadFile(filePath, options = {}) {
    return this.processUpload(filePath, options);
  }
}

function chunkText(text, chunkSize = 500, overlap = 50) {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const words = text.split(/(\s+)/);
  const chunks = [];
  let currentChunk = '';
  let charCount = 0;

  for (const word of words) {
    if (charCount + word.length > chunkSize && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      // Keep overlap by taking last portion
      const overlapStart = Math.max(0, currentChunk.length - overlap);
      currentChunk = currentChunk.slice(overlapStart);
      charCount = currentChunk.length;
    }
    currentChunk += word;
    charCount += word.length;
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function cleanText(text) {
  if (!text) return '';

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractMetadata(content, options = {}) {
  const metadata = {
    title: options.title || '',
    category: options.category || 'general',
    tags: options.tags || [],
    source: options.source || 'manual',
    contentType: options.contentType || 'text',
    wordCount: content ? content.length : 0,
    createdAt: options.createdAt || new Date().toISOString(),
  };

  if (options.userId) {
    metadata.userId = options.userId;
  }

  return metadata;
}

export default DocumentProcessor;
