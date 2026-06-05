import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data_agent', 'conversations');

async function ensureDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

function getFilePath(id) {
  return path.join(dataDir, `${id}.json`);
}

export async function saveConversation(conversation) {
  await ensureDir();
  const filePath = getFilePath(conversation.id);
  const data = {
    ...conversation,
    updatedAt: new Date().toISOString(),
  };
  if (!data.createdAt) {
    data.createdAt = data.updatedAt;
  }
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

export async function getConversation(id) {
  const filePath = getFilePath(id);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function listConversations() {
  await ensureDir();
  try {
    const files = await fs.readdir(dataDir);
    const conversations = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = await fs.readFile(path.join(dataDir, file), 'utf-8');
          conversations.push(JSON.parse(data));
        } catch {
          // skip invalid files
        }
      }
    }
    return conversations.sort((a, b) => {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  } catch {
    return [];
  }
}

export async function deleteConversation(id) {
  const filePath = getFilePath(id);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function addMessage(conversationId, role, content, metadata = {}) {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  if (!conversation.messages) {
    conversation.messages = [];
  }

  conversation.messages.push({
    role,
    content,
    metadata,
    timestamp: new Date().toISOString(),
  });

  return await saveConversation(conversation);
}

export async function createConversation(title = 'New Conversation', userId = 'default', initialMessage = null) {
  await ensureDir();
  const id = randomUUID();
  const conversation = {
    id,
    title,
    userId,
    messages: [],
  };

  if (initialMessage) {
    conversation.messages.push({
      role: 'user',
      content: initialMessage,
      timestamp: new Date().toISOString(),
    });
  }

  return await saveConversation(conversation);
}
