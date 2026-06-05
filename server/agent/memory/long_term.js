import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', '..', 'data_agent', 'long_term');

async function ensureDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

function getUserPrefsFilePath(userId) {
  return path.join(dataDir, `preferences_${userId}.json`);
}

function getQueriesFilePath() {
  return path.join(dataDir, 'queries.json');
}

export async function getUserPreference(userId) {
  await ensureDir();
  const filePath = getUserPrefsFilePath(userId);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { userId, preferences: {}, updatedAt: null };
  }
}

export async function updateUserPreference(userId, preferences) {
  await ensureDir();
  const filePath = getUserPrefsFilePath(userId);
  let existing = {};

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    existing = JSON.parse(data);
  } catch {
    existing = { userId, preferences: {} };
  }

  existing.preferences = {
    ...existing.preferences,
    ...preferences,
  };
  existing.updatedAt = new Date().toISOString();

  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf-8');
  return existing;
}

export async function getFrequentQueries(userId, limit = 10) {
  await ensureDir();
  const filePath = getQueriesFilePath();
  let queries = [];

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    queries = JSON.parse(data);
  } catch {
    return [];
  }

  const userQueries = queries.filter(q => q.userId === userId);

  // Aggregate by query text
  const aggregated = {};
  for (const q of userQueries) {
    if (!aggregated[q.query]) {
      aggregated[q.query] = { query: q.query, intent: q.intent, count: 0 };
    }
    aggregated[q.query].count += 1;
    if (q.intent) {
      aggregated[q.query].intent = q.intent;
    }
  }

  return Object.values(aggregated)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function recordQuery(userId, query, intent = null) {
  await ensureDir();
  const filePath = getQueriesFilePath();
  let queries = [];

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    queries = JSON.parse(data);
  } catch {
    queries = [];
  }

  queries.push({
    userId,
    query,
    intent,
    timestamp: new Date().toISOString(),
  });

  // Keep only last 5000 records
  if (queries.length > 5000) {
    queries = queries.slice(-5000);
  }

  await fs.writeFile(filePath, JSON.stringify(queries, null, 2), 'utf-8');
}
