import path from 'path';
import { fileURLToPath } from 'url';
import VectorStore from './vector_store.js';
import DocumentProcessor from './document_processor.js';
import Retriever from './retriever.js';
import ContextBuilder from './context_builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectorStore = new VectorStore(path.join(__dirname, '../../data_agent/vectors/knowledge.json'));
const documentProcessor = new DocumentProcessor();

let retriever;
let contextBuilder;
let initialized = false;

async function initRAG(llmClient) {
  if (initialized) {
    return;
  }

  retriever = new Retriever(vectorStore, llmClient);
  contextBuilder = new ContextBuilder();

  await retriever.init();
  initialized = true;

  console.log(`[RAG] Initialized with ${vectorStore.count()} vector documents`);
}

async function queryKnowledge(userQuery, options = {}) {
  if (!initialized) {
    throw new Error('RAG module not initialized. Call initRAG() first.');
  }

  const topK = options.topK || 5;
  const conversationContext = options.conversationContext || {};

  const searchResults = await retriever.search(userQuery, { topK });
  const prompt = contextBuilder.buildPrompt(userQuery, searchResults, conversationContext);

  let answer = '';
  try {
    const { chat } = options;
    if (chat && typeof chat === 'function') {
      const result = await chat([
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ], {
        maxTokens: options.maxTokens || 1024,
        temperature: 0.3,
      });
      answer = result.content || '';
    }
  } catch (err) {
    console.warn('[RAG] LLM generation failed:', err.message);
    answer = '';
  }

  return contextBuilder.formatResponse(searchResults, answer);
}

async function addKnowledge(id, text, metadata = {}) {
  if (!initialized) {
    throw new Error('RAG module not initialized. Call initRAG() first.');
  }
  return retriever.addKnowledge(id, text, metadata);
}

async function removeKnowledge(id) {
  if (!initialized) {
    throw new Error('RAG module not initialized. Call initRAG() first.');
  }
  return retriever.removeKnowledge(id);
}

async function processDocument(title, content, options = {}) {
  return documentProcessor.processText(title, content, options);
}

export {
  vectorStore,
  documentProcessor,
  retriever,
  contextBuilder,
  initRAG,
  queryKnowledge,
  addKnowledge,
  removeKnowledge,
  processDocument,
};
