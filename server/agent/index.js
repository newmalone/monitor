import express from 'express';
import { randomUUID } from 'crypto';
import LLMClient from './llm_client.js';
import AgentRouter from './router.js';
import cache from './cache.js';
import * as intent from './intent.js';
import * as conversation from './conversation.js';
const { getConversation, addMessage, createConversation, listConversations } = conversation;
import * as security from './security.js';
import { getContext, extractEntities } from './memory/short_term.js';
import { getUserPreference, recordQuery } from './memory/long_term.js';
import { saveAgentData, listAgentData, deleteAgentData } from '../db_agent.js';
import skillsModule from './skills/index.js';
import { initRAG, queryKnowledge } from './rag/index.js';

const router = express.Router();
const llmClient = new LLMClient();

// Initialize modules (lazy init on first request)
let agentRouterInstance = null;
let initializationPromise = null;

async function ensureInitialized() {
  if (agentRouterInstance) return agentRouterInstance;

  if (!initializationPromise) {
    initializationPromise = (async () => {
      // Init Skills
      await skillsModule.init();
      console.log('[Agent] Skills module initialized');

      // Init RAG
      try {
        await initRAG(llmClient);
        console.log('[Agent] RAG module initialized');
      } catch (err) {
        console.warn('[Agent] RAG init failed, will use fallback:', err.message);
      }

      // Create router with modules wired in
      agentRouterInstance = new AgentRouter({
        skillsModule,
        ragModule: {
          async query(userInput, params) {
            try {
              return await queryKnowledge(userInput, {
                chat: (msgs, opts) => llmClient.chat(msgs, opts),
                conversationContext: params?.conversationContext,
              });
            } catch (err) {
              console.warn('[Agent] RAG query failed:', err.message);
              return { message: '抱歉，知识库检索失败，请稍后重试。', sources: [] };
            }
          },
        },
      });

      console.log('[Agent] All modules initialized');
      return agentRouterInstance;
    })();
  }

  return initializationPromise;
}

// POST /api/agent/chat - main chat endpoint
router.post('/api/agent/chat', async (req, res) => {
  try {
    const { message, conversationId, userId = 'default' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Validate input
    const validation = security.validateInput(message);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    if (!security.hasPermission(userId, 'chat', 'write')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Ensure modules are initialized
    const agentRouter = await ensureInitialized();

    // Check intent cache
    const cacheKey = `intent:${Buffer.from(message).toString('base64').slice(0, 32)}`;
    const cachedIntent = cache.getQueryCache(cacheKey);

    // Manage conversation
    let currentConversationId = conversationId;
    let conversationData = null;

    if (currentConversationId) {
      conversationData = await getConversation(currentConversationId);
    } else {
      const newConv = await createConversation(message.slice(0, 50), userId, message);
      currentConversationId = newConv.id;
      conversationData = newConv;
    }

    let parsedIntent;
    if (cachedIntent) {
      parsedIntent = cachedIntent;
    } else {
      const context = {
        recentMessages: conversationData ? getContext(currentConversationId, conversationData) : [],
        entities: conversationData ? extractEntities(conversationData.messages) : {},
        userPreferences: await getUserPreference(userId),
      };
      parsedIntent = await intent.parseIntent(message, context, llmClient);
      cache.setQueryCache(cacheKey, parsedIntent);
    }

    // Route based on intent
    const routeResult = await agentRouter.route(parsedIntent, {
      userInput: message,
      conversationId: currentConversationId,
      userId,
    });

    // Sanitize output
    if (routeResult.data && routeResult.data.message) {
      routeResult.data.message = security.sanitizeOutput(routeResult.data.message);
    }

    // Save messages
    if (currentConversationId) {
      if (!conversationId) {
        await addMessage(currentConversationId, 'assistant', routeResult.data?.message || JSON.stringify(routeResult.data), { intent: parsedIntent, routeType: routeResult.type });
      } else {
        await addMessage(currentConversationId, 'user', message);
        await addMessage(currentConversationId, 'assistant', routeResult.data?.message || JSON.stringify(routeResult.data), { intent: parsedIntent, routeType: routeResult.type });
      }
    }

    recordQuery(userId, message, parsedIntent.intent).catch(() => {});

    res.json({
      success: true,
      conversationId: currentConversationId,
      intent: parsedIntent,
      response: routeResult,
    });
  } catch (error) {
    console.error('Agent chat error:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// POST /api/agent/chat/stream - streaming chat endpoint (SSE)
router.post('/api/agent/chat/stream', async (req, res) => {
  try {
    const { message, conversationId, userId = 'default' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const validation = security.validateInput(message);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Ensure modules are initialized
    const agentRouter = await ensureInitialized();

    let conversationData = null;
    let currentConversationId = conversationId;

    if (currentConversationId) {
      conversationData = await getConversation(currentConversationId);
    } else {
      const newConv = await createConversation(message.slice(0, 50), userId, message);
      currentConversationId = newConv.id;
      conversationData = newConv;
    }

    const context = {
      recentMessages: conversationData ? getContext(currentConversationId, conversationData) : [],
      entities: conversationData ? extractEntities(conversationData.messages) : {},
    };

    const parsedIntent = await intent.parseIntent(message, context, llmClient);

    res.write(`event: intent\ndata: ${JSON.stringify({ intent: parsedIntent, conversationId: currentConversationId })}\n\n`);

    const routeResult = await agentRouter.route(parsedIntent, {
      userInput: message,
      conversationId: currentConversationId,
      userId,
    });

    const responseMessage = routeResult.data?.message || JSON.stringify(routeResult.data);
    const words = responseMessage.split('');

    for (let i = 0; i < words.length; i++) {
      if (!res.writableEnded) {
        res.write(`event: chunk\ndata: ${JSON.stringify({ content: words[i], index: i })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    res.write(`event: done\ndata: ${JSON.stringify({ complete: true, conversationId: currentConversationId })}\n\n`);
    res.end();

    if (currentConversationId && !conversationId) {
      addMessage(currentConversationId, 'assistant', responseMessage, { intent: parsedIntent, routeType: routeResult.type }).catch(() => {});
    } else if (currentConversationId) {
      addMessage(currentConversationId, 'user', message).catch(() => {});
      addMessage(currentConversationId, 'assistant', responseMessage, { intent: parsedIntent, routeType: routeResult.type }).catch(() => {});
    }

    recordQuery(userId, message, parsedIntent.intent).catch(() => {});
  } catch (error) {
    console.error('Agent stream chat error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// GET /api/agent/conversations - list conversations
router.get('/api/agent/conversations', async (req, res) => {
  try {
    const { userId = 'default' } = req.query;
    const conversations = await listConversations();
    res.json({ success: true, conversations });
  } catch (error) {
    console.error('List conversations error:', error.message);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// GET /api/agent/conversations/:id - get conversation
router.get('/api/agent/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const conv = await getConversation(id);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ success: true, conversation: conv });
  } catch (error) {
    console.error('Get conversation error:', error.message);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// DELETE /api/agent/conversations/:id - delete conversation
router.delete('/api/agent/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId = 'default' } = req.query;

    if (!security.hasPermission(userId, 'chat', 'write')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const deleted = await deleteAgentData('conversations', id);
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    console.error('Delete conversation error:', error.message);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// POST /api/agent/knowledge/upload - upload knowledge document
router.post('/api/agent/knowledge/upload', async (req, res) => {
  try {
    const { title, content, category, userId = 'default', tags = [] } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    if (!security.hasPermission(userId, 'knowledge', 'write')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const id = randomUUID();
    const knowledge = await saveAgentData('knowledge', id, {
      title,
      content,
      category: category || 'general',
      tags,
      userId,
      status: 'active',
    });

    // Also add to RAG vector store
    try {
      await ensureInitialized();
      const { addKnowledge, processDocument } = await import('./rag/index.js');
      const chunks = await processDocument(title, content);
      for (const chunk of chunks) {
        await addKnowledge(`${id}-${chunk.index}`, chunk.text, {
          title,
          category,
          tags,
          chunkIndex: chunk.index,
          totalChunks: chunks.length,
        });
      }
    } catch (err) {
      console.warn('[Agent] Failed to add to RAG store:', err.message);
    }

    res.json({ success: true, knowledge });
  } catch (error) {
    console.error('Upload knowledge error:', error.message);
    res.status(500).json({ error: 'Failed to upload knowledge' });
  }
});

// GET /api/agent/knowledge - list knowledge documents
router.get('/api/agent/knowledge', async (req, res) => {
  try {
    const { category, tag } = req.query;
    const knowledgeList = await listAgentData('knowledge');

    let filtered = knowledgeList;
    if (category) {
      filtered = filtered.filter(k => k.category === category);
    }
    if (tag) {
      filtered = filtered.filter(k => k.tags && k.tags.includes(tag));
    }

    res.json({ success: true, knowledge: filtered });
  } catch (error) {
    console.error('List knowledge error:', error.message);
    res.status(500).json({ error: 'Failed to list knowledge' });
  }
});

// GET /api/agent/status - agent status check
router.get('/api/agent/status', async (req, res) => {
  const initialized = agentRouterInstance !== null;
  res.json({
    success: true,
    initialized,
    skillsInitialized: skillsModule.initialized,
    cacheSize: cache._getStoreSize?.() ?? 0,
  });
});

// POST /api/agent/export - export report
router.post('/api/agent/export', async (req, res) => {
  try {
    const { reportData, format = 'json' } = req.body;
    if (!reportData || !reportData.stats) {
      return res.status(400).json({ error: 'Report data is required' });
    }

    const exportService = await import('./export.js');
    const result = await exportService.exportReport(reportData, format);

    if (format === 'csv' || format === 'word' || format === 'xlsx') {
      res.setHeader('Content-Type', result.contentType);
      const filename = encodeURIComponent(result.filename);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
      return res.send(result.buffer);
    }

    res.json({ success: true, data: result.content, filename: result.filename, contentType: result.contentType });
  } catch (error) {
    console.error('Export error:', error.message);
    res.status(500).json({ error: 'Export failed', message: error.message });
  }
});

// GET /api/agent/export/download - direct download report
router.get('/api/agent/export/download', async (req, res) => {
  try {
    const { type, date } = req.query;
    if (!type) {
      return res.status(400).json({ error: 'Report type is required' });
    }

    // Generate report data on the fly
    const reportResult = await skillsModule.generateReport({ type, date }, {});
    if (!reportResult.data || !reportResult.data.report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const format = req.query.format || 'csv';
    const exportService = await import('./export.js');
    const result = await exportService.exportReport(reportResult.data.report, format);

    res.setHeader('Content-Type', result.contentType);
    const filename = encodeURIComponent(result.filename);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
    res.send(result.buffer);
  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({ error: 'Download failed', message: error.message });
  }
});

export default router;
