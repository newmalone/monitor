const API_BASE = '/api';

export interface AgentMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  metadata?: {
    intent?: string;
    routeType?: string;
    stats?: any;
    devices?: any[];
    sources?: any[];
  };
}

export interface ChatResponse {
  success: boolean;
  conversationId: string;
  intent: { intent: string; params: Record<string, any>; confidence: number };
  response: {
    type: string;
    data: { message: string; [key: string]: any };
    timestamp: string;
  };
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

export async function sendChatMessage(message: string, conversationId?: string): Promise<ChatResponse> {
  const body: { message: string; conversationId?: string; userId?: string } = {
    message,
    userId: 'web-user',
  };
  if (conversationId) {
    body.conversationId = conversationId;
  }

  const res = await fetch(`${API_BASE}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return handleResponse(res);
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export async function getConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(`${API_BASE}/agent/conversations`);
  const data = await handleResponse(res);
  return data.conversations || [];
}

export async function getConversation(id: string): Promise<{ id: string; title: string; messages: any[] }> {
  const res = await fetch(`${API_BASE}/agent/conversations/${id}`);
  const data = await handleResponse(res);
  return data.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/agent/conversations/${id}`, {
    method: 'DELETE',
  });
  await handleResponse(res);
}

export interface ReportData {
  title: string;
  date: string;
  summary: string;
  stats: Record<string, any>;
  breakdowns?: {
    byManufacturer?: any[];
    byDeviceType?: any[];
    byRegion?: any[];
  };
}

export async function exportReport(reportData: ReportData, format: 'csv' | 'xlsx' | 'word' | 'json' = 'csv'): Promise<void> {
  const res = await fetch(`${API_BASE}/agent/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportData, format }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || '导出失败');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  const contentDisposition = res.headers.get('content-disposition');
  let filename = `report_${Date.now()}.${format}`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?(.+?)"?$/);
    if (match) filename = match[1].replace(/['"]/g, '');
  }

  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function downloadReport(type: string, date?: string, format: 'csv' | 'xlsx' | 'word' = 'csv'): Promise<void> {
  const params = new URLSearchParams({ type });
  if (date) params.append('date', date);
  params.append('format', format);

  const url = `${API_BASE}/agent/export/download?${params.toString()}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
