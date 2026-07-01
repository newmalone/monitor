/**
 * Vanna AI 智能问答前端 API 服务
 */

const API_BASE = '/api';

export interface VannaAskRequest {
  question: string;
  userId?: string;
  conversationId?: string;
}

export interface VannaAskResponse {
  answer: string;
  sql?: string;
  data?: any[];
  chart?: {
    type: string;
    config: any;
  };
  conversation_id: string;
}

export interface TrainDDLRequest {
  ddl_sql: string;
}

export interface TrainSQLRequest {
  question: string;
  sql: string;
}

export interface TrainDocRequest {
  content: string;
  tags?: string[];
}

export interface VannaStatus {
  status: string;
  llm_provider: string;
  trained: boolean;
  tables: string[];
  memory_size: number;
}

export interface ConversationItem {
  id: string;
  title: string;
  last_message: string;
  created_at: string;
  updated_at?: string;
  turn_count: number;
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    try {
      const err = JSON.parse(text);
      throw new Error(err.error || err.message || '请求失败');
    } catch {
      throw new Error(text || '请求失败');
    }
  }
  return res.json();
}

/**
 * 发送自然语言问题到 Vanna
 */
export async function askVanna(
  question: string,
  conversationId?: string,
  userId?: string
): Promise<VannaAskResponse> {
  const body: VannaAskRequest = {
    question,
    userId: userId || 'web-user',
  };
  if (conversationId) {
    body.conversationId = conversationId;
  }

  const res = await fetch(`${API_BASE}/vanna/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return handleResponse(res);
}

/**
 * SSE 事件类型
 */
export type StreamEvent =
  | { type: 'conversation_id'; data: string }
  | { type: 'content'; data: string }
  | { type: 'sql'; data: string }
  | { type: 'data'; data: string }
  | { type: 'validation'; data: string }
  | { type: 'done'; data: string }
  | { type: 'error'; data: string }
  | { type: 'other'; event: string; data: string };

export interface StreamHandlers {
  onConversationId?: (id: string) => void;
  onContent?: (chunk: string) => void;
  onSql?: (sql: string) => void;
  onData?: (dataJson: string) => void;
  onValidation?: (validationJson: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

/**
 * 流式发送自然语言问题（SSE）
 * 后端事件格式：event: <type>\ndata: <payload>\n\n
 */
export async function askVannaStream(
  question: string,
  handlers: StreamHandlers,
  conversationId?: string,
  userId?: string
): Promise<AbortController> {
  const body: VannaAskRequest = {
    question,
    userId: userId || 'web-user',
  };
  if (conversationId) {
    body.conversationId = conversationId;
  }

  const controller = new AbortController();

  try {
    const response = await fetch(`${API_BASE}/vanna/ask/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      handlers.onError?.(text || '请求失败');
      return controller;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      handlers.onError?.('无法读取流式响应');
      return controller;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';

    const process = async () => {
      let eventCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // flush
          if (buffer.trim()) {
            handleLine(buffer.trim(), currentEvent, handlers);
          }
          console.log(`[SSE] Stream ended, total events: ${eventCount}`);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const raw of lines) {
          const line = raw.replace(/\r$/, '');
          if (!line) {
            // 空行表示一个事件结束
            currentEvent = 'message';
            continue;
          }
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            eventCount++;
            if (currentEvent === 'content') {
              console.log(`[SSE] content event #${eventCount}: "${data.slice(0, 50)}..."`);
            }
            handleLine(data, currentEvent, handlers);
            currentEvent = 'message';
          }
        }
      }
    };

    process().catch((e) => {
      handlers.onError?.(e?.message || '流式读取失败');
    });
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      handlers.onError?.(error.message || '流式请求失败');
    }
  }

  return controller;
}

function handleLine(data: string, event: string, handlers: StreamHandlers) {
  switch (event) {
    case 'conversation_id':
      handlers.onConversationId?.(data);
      break;
    case 'content': {
      // 后端可能发送 JSON 包裹的内容，尝试解析
      let text = data;
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed === 'string') {
          text = parsed;
        } else if (parsed && typeof parsed.content === 'string') {
          text = parsed.content;
        } else if (parsed && typeof parsed.text === 'string') {
          text = parsed.text;
        } else if (parsed && typeof parsed.data === 'string') {
          text = parsed.data;
        } else if (parsed && typeof parsed.answer === 'string') {
          text = parsed.answer;
        }
      } catch {
        // data 不是 JSON，直接使用原始文本
      }
      handlers.onContent?.(text);
      break;
    }
    case 'sql':
      handlers.onSql?.(data);
      break;
    case 'data':
      handlers.onData?.(data);
      break;
    case 'validation':
      handlers.onValidation?.(data);
      break;
    case 'done':
      handlers.onDone?.();
      break;
    case 'error':
      handlers.onError?.(data);
      break;
    default:
      // 忽略未知事件
      break;
  }
}

/**
 * 训练 DDL 语句
 */
export async function trainDDL(ddlSql: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/vanna/train/ddl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ddl_sql: ddlSql }),
  });
  return handleResponse(res);
}

/**
 * 训练 SQL 对（问题+SQL）
 */
export async function trainSQL(
  question: string,
  sql: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/vanna/train/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, sql }),
  });
  return handleResponse(res);
}

/**
 * 训练业务文档
 */
export async function trainDoc(
  content: string,
  tags?: string[]
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/vanna/train/doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, tags }),
  });
  return handleResponse(res);
}

/**
 * 获取训练状态
 */
export async function getTrainStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/vanna/train/status`);
  return handleResponse(res);
}

/**
 * 获取 Vanna 服务状态
 */
export async function getVannaStatus(): Promise<VannaStatus> {
  const res = await fetch(`${API_BASE}/vanna/status`);
  return handleResponse(res);
}

/**
 * 获取对话列表
 */
export async function getVannaConversations(
  userId?: string
): Promise<ConversationItem[]> {
  const uid = userId || 'web-user';
  const res = await fetch(
    `${API_BASE}/vanna/conversations?user_id=${uid}`
  );
  const data = await handleResponse(res);
  // 后端直接返回数组，不是 { conversations: [...] }
  return Array.isArray(data) ? data : (data.conversations || []);
}

/**
 * 创建新对话（不发起提问，直接生成空白对话）
 */
export async function createVannaConversation(
  userId?: string
): Promise<{ conversation_id: string; user_id: string; created_at: string; title: string }> {
  const uid = userId || 'web-user';
  const res = await fetch(
    `${API_BASE}/vanna/conversations/new?userId=${uid}`,
    { method: 'POST' }
  );
  return handleResponse(res);
}

/**
 * 获取对话详情
 */
export async function getVannaConversation(
  id: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/vanna/conversations/${id}`);
  return handleResponse(res);
}

/**
 * 删除对话
 */
export async function deleteVannaConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vanna/conversations/${id}`, {
    method: 'DELETE',
  });
  await handleResponse(res);
}

/**
 * 生成图表配置
 */
export async function generateChart(
  sql: string,
  chartType?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/vanna/chart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, chart_type: chartType }),
  });
  return handleResponse(res);
}

// ==================== 新增：对话管理增强 ====================

/**
 * 获取对话消息列表（分页）
 */
export async function getConversationMessages(
  id: string,
  offset = 0,
  limit = 50
): Promise<{ total: number; messages: any[] }> {
  const res = await fetch(
    `${API_BASE}/vanna/conversations/${id}/messages?offset=${offset}&limit=${limit}`
  );
  return handleResponse(res);
}

/**
 * 清空用户所有对话
 */
export async function clearAllConversations(
  userId?: string
): Promise<{ status: string; message: string; count: number }> {
  const res = await fetch(
    `${API_BASE}/vanna/conversations/clear_all?userId=${userId || 'web-user'}`,
    { method: 'POST' }
  );
  return handleResponse(res);
}

// ==================== 新增：训练管理增强 ====================

export interface TrainingDataItem {
  id: string;
  type: 'ddl' | 'sql' | 'doc';
  content: any;
  created_at?: string;
}

export interface TrainingHistoryEntry {
  timestamp: string;
  status: 'success' | 'error';
  ddl_count: number;
  sql_count: number;
  doc_count: number;
  total: number;
}

/**
 * 获取训练历史
 */
export async function getTrainingHistory(): Promise<TrainingHistoryEntry[]> {
  const res = await fetch(`${API_BASE}/vanna/training/history`);
  return handleResponse(res);
}

/**
 * 获取训练数据（分页+过滤）
 */
export async function getTrainingData(
  params?: { type?: 'ddl' | 'sql' | 'doc'; page?: number; page_size?: number }
): Promise<{ total: number; data: TrainingDataItem[] }> {
  const qs = new URLSearchParams();
  if (params?.type) qs.set('type', params.type);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  const res = await fetch(`${API_BASE}/vanna/training/data?${qs.toString()}`);
  return handleResponse(res);
}

/**
 * 更新训练数据（SQL 对）
 */
export async function updateTrainingData(
  id: string,
  data: { question?: string; sql?: string; ddl?: string; documentation?: string }
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/vanna/training/data/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

/**
 * 删除训练数据
 */
export async function deleteTrainingData(id: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/vanna/training/data/${id}`, {
    method: 'DELETE',
  });
  return handleResponse(res);
}

/**
 * 运行基准测试（训练前后效果对比）
 */
export async function runBenchmark(): Promise<{
  before: { success_rate: number; results: any[] };
  after: { success_rate: number; results: any[] };
  improvement: number;
}> {
  const res = await fetch(`${API_BASE}/vanna/training/benchmark`);
  return handleResponse(res);
}

/**
 * 从 JSON 设备数据生成训练 SQL
 */
export async function generateTrainingFromJSON(
  params?: { days?: number; auto_train?: boolean }
): Promise<{ generated: number; trained: number; pairs: any[] }> {
  const res = await fetch(`${API_BASE}/vanna/training/generate_from_json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || { days: 7, auto_train: true }),
  });
  return handleResponse(res);
}
