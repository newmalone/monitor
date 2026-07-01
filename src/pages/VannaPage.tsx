import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Input, Button, message, Spin, Empty, Tag, Avatar, Space, Tooltip,
  Popconfirm, Drawer, Collapse, Segmented, message as antMessage,
} from 'antd';
import {
  SendOutlined, RobotOutlined, UserOutlined,
  BarChartOutlined, LineChartOutlined, PieChartOutlined, TableOutlined,
  DeleteOutlined, PlusOutlined, ToolOutlined, SearchOutlined,
  ClearOutlined, MenuOutlined, StopOutlined,
  CopyOutlined, ReloadOutlined, LikeOutlined, DislikeOutlined,
  ThunderboltOutlined, DatabaseOutlined, AlertOutlined,
  SettingOutlined, CodeOutlined, CheckOutlined,
  BulbOutlined, QuestionCircleOutlined, BookOutlined,
} from '@ant-design/icons';
import { Line, Column, Pie } from '@ant-design/charts';
import {
  askVannaStream,
  getVannaConversations,
  deleteVannaConversation,
  clearAllConversations,
  getVannaStatus,
  createVannaConversation,
  VannaStatus as VannaStatusType,
  ConversationItem,
} from '../services/vannaApi';
import styles from './VannaPage.module.css';

const { TextArea } = Input;

const QUICK_CATEGORIES = [
  {
    key: 'device',
    icon: <DatabaseOutlined />,
    title: '设备数据',
    subtitle: '设备状态 · 在线率',
    color: '#1677ff',
    gradient: 'linear-gradient(135deg, #1677ff 0%, #4096ff 100%)',
    items: [
      { icon: '📊', label: '今日在线率', desc: '设备在线百分比', question: '今天的设备在线率是多少？' },
      { icon: '⚫', label: '离线设备', desc: '当前所有离线列表', question: '列出所有当前离线的设备' },
      { icon: '🏭', label: 'TOP5 厂商', desc: '设备数最多厂商', question: '设备数量最多的 5 个厂商是哪些？' },
    ],
  },
  {
    key: 'fault',
    icon: <AlertOutlined />,
    title: '故障分析',
    subtitle: '故障统计 · 异常检测',
    color: '#ff4d4f',
    gradient: 'linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%)',
    items: [
      { icon: '🔴', label: '高故障设备', desc: '7 天内故障最多', question: '近 7 天故障次数最多的 10 台设备' },
      { icon: '⚠️', label: '故障趋势', desc: '本周 vs 上周对比', question: '本周故障率与上周对比情况' },
      { icon: '🛠️', label: '故障类型', desc: '故障占比分布', question: '本月各类故障的占比分布' },
    ],
  },
  {
    key: 'trend',
    icon: <LineChartOutlined />,
    title: '趋势预测',
    subtitle: '在线趋势 · 增长分析',
    color: '#722ed1',
    gradient: 'linear-gradient(135deg, #722ed1 0%, #9254de 100%)',
    items: [
      { icon: '📈', label: '7 天趋势', desc: '在线率变化曲线', question: '近 7 天在线率变化趋势' },
      { icon: '📉', label: '新增设备', desc: '30 天日增趋势', question: '近 30 天每日新增设备数趋势' },
      { icon: '🔮', label: '月度对比', desc: '本月 vs 上月', question: '本月与上月设备数对比' },
    ],
  },
  {
    key: 'system',
    icon: <SettingOutlined />,
    title: '系统状态',
    subtitle: '区域 · 协议 · 存储',
    color: '#13c2c2',
    gradient: 'linear-gradient(135deg, #13c2c2 0%, #36cfc9 100%)',
    items: [
      { icon: '🗺️', label: '区域分布', desc: '区域设备与在线率', question: '各区域设备数量与在线率对比' },
      { icon: '🌐', label: '网络协议', desc: '协议类型分布', question: '各协议类型设备数量分布' },
      { icon: '💾', label: '存储用量', desc: '数据表容量', question: '当前数据库各表的数据量' },
    ],
  },
];

function groupConversationsByTime(convs: ConversationItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups: Record<string, ConversationItem[]> = { 今日: [], 昨日: [], 本周: [], 更早: [] };
  for (const c of convs) {
    const t = new Date(c.updated_at || c.created_at || Date.now());
    if (t >= today) groups['今日'].push(c);
    else if (t >= yesterday) groups['昨日'].push(c);
    else if (t >= weekAgo) groups['本周'].push(c);
    else groups['更早'].push(c);
  }
  return groups;
}

function generateFollowups(lastAnswer: string, lastQuestion: string): string[] {
  const followups: string[] = [];
  const a = lastAnswer || '';
  const q = lastQuestion || '';

  const regionMatch = a.match(/([\u4e00-\u9fa5]{2,4}区|[\u4e00-\u9fa5]{2,4}市)/);
  if (regionMatch) {
    followups.push(`${regionMatch[1]}的设备中哪些厂商最多？`);
  }

  const vendorMatch = a.match(/(海康威视|大华|宇视|华为|中兴|烽火)/);
  if (vendorMatch) {
    followups.push(`${vendorMatch[1]}设备各状态分布如何？`);
  }

  if (/\d+\.?\d*%/.test(a)) {
    followups.push('影响这个比例的主要因素是什么？');
  }

  if (q.includes('在线')) followups.push('离线的设备主要分布在哪里？');
  else if (q.includes('离线')) followups.push('这些设备离线多久了？');
  else if (q.includes('故障')) followups.push('故障率最高的设备类型是什么？');
  else if (q.includes('趋势')) followups.push('预测下个月的趋势会如何变化？');
  else if (q.includes('TOP') || q.includes('最多')) followups.push('这些设备的共同特征是什么？');
  else followups.push('能从其他维度再分析一下吗？');

  const generic = [
    '用图表展示这个数据',
    '按时间维度细化分析',
    '对比上月同期数据',
  ];
  for (const g of generic) {
    if (followups.length >= 3) break;
    if (!followups.includes(g)) followups.push(g);
  }

  return followups.slice(0, 3);
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  data?: any[];
  chart?: { type: string; config: any };
  validation?: { status: string; row_count: number; is_anomaly: boolean; reason?: string };
  feedback?: 'like' | 'dislike' | null;
  timestamp: string;
  streaming?: boolean;
  thinking?: {
    sql?: string;
    data?: any[];
    validation?: any;
  };
}

function TypingCursor() {
  return <span style={{ fontWeight: 'bold', color: '#1664FF' }}>▊</span>;
}

type MarkdownLib = {
  ReactMarkdown: any;
  remarkGfm: any;
  rehypeHighlight: any;
};

let markdownLibCache: MarkdownLib | null = null;
let markdownLibPromise: Promise<MarkdownLib> | null = null;

async function loadMarkdownLib(): Promise<MarkdownLib> {
  if (markdownLibCache) return markdownLibCache;
  if (!markdownLibPromise) {
    markdownLibPromise = Promise.all([
      import('react-markdown'),
      import('remark-gfm'),
      import('rehype-highlight'),
    ]).then(([rm, gf, hl]) => {
      markdownLibCache = {
        ReactMarkdown: rm.default,
        remarkGfm: gf.default,
        rehypeHighlight: hl.default,
      };
      if (typeof document !== 'undefined' && !document.querySelector('link[data-hl-theme]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css';
        link.setAttribute('data-hl-theme', 'github-dark');
        document.head.appendChild(link);
      }
      return markdownLibCache;
    });
  }
  return markdownLibPromise;
}

function MarkdownView({ content, streaming }: { content: string; streaming?: boolean }) {
  const [lib, setLib] = useState<MarkdownLib | null>(markdownLibCache);

  useEffect(() => {
    if (lib) return;
    let cancelled = false;
    loadMarkdownLib().then((l) => { if (!cancelled) setLib(l); });
    return () => { cancelled = true; };
  }, [lib]);

  if (!lib) {
    return (
      <div style={{ fontSize: 14, lineHeight: 1.7, color: '#1F2329' }}>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{content}</pre>
        {streaming && <TypingCursor />}
      </div>
    );
  }

  const { ReactMarkdown: RM, remarkGfm: GFM, rehypeHighlight: HLH } = lib;
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: '#1F2329' }}>
      <RM
        remarkPlugins={[GFM]}
        rehypePlugins={[HLH]}
        components={{
          code({ inline, className, children, ...props }: any) {
            const value = String(children).replace(/\n$/, '');
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match) {
              return <CodeBlock language={match[1]} value={value} />;
            }
            return <code className={className} {...props}>{children}</code>;
          },
          table({ children }: any) {
            return (
              <div style={{ overflowX: 'auto', margin: '12px 0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </RM>
      {streaming && <TypingCursor />}
    </div>
  );
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ margin: '12px 0', borderRadius: 8, overflow: 'hidden', background: '#F5F7FA' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: '#F0F2F5', fontSize: 12, color: '#646A73'
      }}>
        <span><CodeOutlined /> {language}</span>
        <button onClick={handleCopy} style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 12, color: '#646A73', display: 'flex', alignItems: 'center', gap: 4
        }}>
          {copied ? <><CheckOutlined /> 已复制</> : <><CopyOutlined /> 复制</>}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '12px 16px', overflowX: 'auto' }}>
        <code className={`language-${language}`}>{value}</code>
      </pre>
    </div>
  );
}

function ThinkingProcess({ thinking }: { thinking: NonNullable<ChatMessage['thinking']> }) {
  const items = [
    thinking.sql && {
      key: 'sql',
      label: (
        <span style={{ fontSize: 12, color: '#646A73', fontWeight: 500 }}>
          <CodeOutlined /> 生成的 SQL
        </span>
      ),
      children: <pre style={{
        background: '#F5F7FA', padding: '8px 12px', borderRadius: 6,
        fontFamily: 'Consolas, monospace', fontSize: 12, margin: 0, overflowX: 'auto'
      }}>{thinking.sql}</pre>,
    },
    thinking.data && thinking.data.length > 0 && {
      key: 'data',
      label: (
        <span style={{ fontSize: 12, color: '#646A73', fontWeight: 500 }}>
          <DatabaseOutlined /> 查询数据 ({thinking.data.length} 行)
        </span>
      ),
      children: (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {Object.keys(thinking.data[0]).map((k) => (
                  <th key={k} style={{
                    padding: '8px 12px', textAlign: 'left', background: '#F7F8FA',
                    fontWeight: 600, borderBottom: '1px solid #E5E7EB'
                  }}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {thinking.data.slice(0, 10).map((row: any, i: number) => (
                <tr key={i}>
                  {Object.values(row).map((v: any, j: number) => (
                    <td key={j} style={{ padding: '6px 12px', borderBottom: '1px solid #F0F2F5' }}>
                      {String(v ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {thinking.data.length > 10 && (
            <div style={{ fontSize: 12, color: '#8F959E', padding: '8px 12px' }}>
              仅显示前 10 行，共 {thinking.data.length} 行
            </div>
          )}
        </div>
      ),
    },
    thinking.validation && {
      key: 'validation',
      label: (
        <span style={{ fontSize: 12, color: '#646A73', fontWeight: 500 }}>
          <BulbOutlined /> 结果验证: {thinking.validation.status} ({thinking.validation.row_count} 行)
          {thinking.validation.is_anomaly && <Tag color="orange" style={{ marginLeft: 8 }}>异常</Tag>}
        </span>
      ),
      children: (
        <pre style={{
          background: '#F5F7FA', padding: '8px 12px', borderRadius: 6,
          fontFamily: 'Consolas, monospace', fontSize: 12, margin: 0
        }}>
          {JSON.stringify(thinking.validation, null, 2)}
        </pre>
      ),
    },
  ].filter(Boolean) as any[];

  if (items.length === 0) return null;

  return (
    <Collapse
      ghost
      style={{ marginBottom: 12, border: '1px solid #F0F2F5', borderRadius: 8, overflow: 'hidden' }}
      items={[
        {
          key: 'think',
          label: (
            <span style={{ fontSize: 12, color: '#646A73' }}>
              <QuestionCircleOutlined /> 查看思考过程 ({items.length} 步)
            </span>
          ),
          children: <Collapse ghost items={items} />,
        },
      ]}
    />
  );
}

function RecommendedFollowups({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.suggestArea}>
      <div className={styles.suggestLabel}>
        <BulbOutlined /> 你可能还想问
      </div>
      <div className={styles.suggestButtons}>
        {items.map((q, i) => (
          <button key={i} className={styles.suggestBtn} onClick={() => onPick(q)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function VannaPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [status, setStatus] = useState<VannaStatusType | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [chartType, setChartType] = useState<string>('auto');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedContent]);

  useEffect(() => {
    loadStatus();
    loadConversations();
  }, []);

  const loadStatus = async () => {
    try { setStatus(await getVannaStatus()); } catch {}
  };

  const loadConversations = async () => {
    try {
      const result = await getVannaConversations();
      console.log('[Vanna] 对话列表:', result?.length ?? 0, '条');
      setConversations(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error('[Vanna] 加载对话列表失败:', err);
      setConversations([]);
    }
  };

  const followups = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.streaming);
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastAssistant || !lastUser) return [];
    return generateFollowups(lastAssistant.content, lastUser.content);
  }, [messages]);

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setStreamedContent('');

    const assistantId = `assistant_${Date.now()}`;
    const placeholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      streaming: true,
    };
    setMessages((prev) => [...prev, placeholder]);

    const think = { sql: undefined as string | undefined, data: undefined as any[] | undefined, validation: undefined as any };

    const controller = await askVannaStream(
      text,
      {
        onConversationId: (id) => setConversationId(id),
        onContent: (chunk) => {
          setStreamedContent((prev) => prev + chunk);
        },
        onSql: (sql) => {
          think.sql = sql;
        },
        onData: (json) => {
          try { think.data = JSON.parse(json); } catch {}
        },
        onValidation: (json) => {
          try { think.validation = JSON.parse(json); } catch {}
        },
        onDone: () => {
          const finalContent = streamedContentRef.current;
          console.log(`[Vanna] onDone: assistantId=${assistantId}, contentLength=${finalContent.length}, sql=${think.sql ? 'yes' : 'no'}, data=${think.data ? 'yes' : 'no'}`);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: finalContent || '(无内容)',
                    sql: think.sql,
                    data: think.data,
                    validation: think.validation,
                    thinking: { sql: think.sql, data: think.data, validation: think.validation },
                    streaming: false,
                  }
                : m
            )
          );
          setStreamedContent('');
          setStreaming(false);
          loadConversations();
        },
        onError: (err) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: streamedContentRef.current || `❌ ${err}`, streaming: false }
                : m
            )
          );
          setStreamedContent('');
          setStreaming(false);
        },
      },
      conversationId
    );

    abortRef.current = controller;
  }, [input, streaming, conversationId]);

  const streamedContentRef = useRef('');
  useEffect(() => { streamedContentRef.current = streamedContent; }, [streamedContent]);

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, content: streamedContentRef.current + '\n\n[已停止]', streaming: false } : m))
    );
    setStreamedContent('');
  };

  const handleNewConversation = async () => {
    setMessages([]);
    setStreamedContent('');
    setMobileDrawerOpen(false);
    setInput('');
    try {
      const r = await createVannaConversation();
      setConversationId(r?.conversation_id);
      antMessage.success('新对话已创建');
      loadConversations();
    } catch (e: any) {
      setConversationId(undefined);
      antMessage.error(e?.message || '创建失败');
    }
  };

  const handleSelectConversation = (id: string) => {
    setConversationId(id);
    setMessages([]);
    setStreamedContent('');
    setMobileDrawerOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteVannaConversation(id);
      loadConversations();
      if (conversationId === id) handleNewConversation();
      antMessage.success('对话已删除');
    } catch { antMessage.error('删除失败'); }
  };

  const handleClearAll = async () => {
    try {
      const r = await clearAllConversations();
      loadConversations();
      handleNewConversation();
      antMessage.success(r.message);
    } catch { antMessage.error('清空失败'); }
  };

  const handleQuickQuestion = (q: string) => {
    if (streaming) return;
    handleSend(q);
  };

  const handleRegenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      setMessages((prev) => prev.filter((m) => m.id !== lastUser.id));
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant) setMessages((prev) => prev.filter((m) => m.id !== lastAssistant.id));
      setTimeout(() => handleSend(lastUser.content), 100);
    }
  };

  const handleFeedback = (msgId: string, type: 'like' | 'dislike') => {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, feedback: type } : m));
    antMessage.success(type === 'like' ? '感谢您的反馈 👍' : '已记录，我们会持续优化');
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => antMessage.success('已复制到剪贴板'));
  };

  const renderChart = (chart: any, data: any[]) => {
    if (!data || data.length === 0) return null;

    const columns = Object.keys(data[0]);
    if (columns.length < 2) return null;

    let xField = columns[0];
    let yField = columns[1];
    let seriesField: string | undefined = undefined;

    if (chart?.config) {
      xField = chart.config.xField || chart.config.angleField || xField;
      yField = chart.config.yField || chart.config.colorField || yField;
      seriesField = chart.config.seriesField;
    }

    const numericFields = columns.filter((col) => {
      const v = data[0][col];
      return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)));
    });
    if (numericFields.length > 0) {
      yField = numericFields[0];
      xField = columns.find((c) => c !== yField) || xField;
    }

    const t = chart?.type || (chartType === 'auto' ? 'column' : chartType);
    const cfg = { data, height: 280, autoFit: true } as any;

    try {
      switch (t) {
        case 'line':
          return (
            <div className={styles.chartContainer}>
              <Line
                {...cfg}
                xField={xField}
                yField={yField}
                seriesField={seriesField}
                smooth
                legend={{ position: 'top' }}
                point={{ size: 3 }}
              />
            </div>
          );
        case 'pie':
          return (
            <div className={styles.chartContainer}>
              <Pie
                {...cfg}
                angleField={yField}
                colorField={xField}
                radius={0.8}
                label={{ type: 'outer', content: '{name}\n{percentage}' }}
                legend={{ position: 'right' }}
              />
            </div>
          );
        case 'bar':
        case 'column':
        default:
          return (
            <div className={styles.chartContainer}>
              <Column
                {...cfg}
                xField={xField}
                yField={yField}
                seriesField={seriesField}
                label={{ position: 'top' }}
                legend={{ position: 'top' }}
                color="#1677FF"
              />
            </div>
          );
      }
    } catch (e) {
      console.warn('[Chart] render error:', e);
      return null;
    }
  };

  const renderMessage = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return (
        <div key={msg.id} className={styles.messageRowUser}>
          <div className={styles.bubbleUser}>
            <div>{msg.content}</div>
          </div>
          <Avatar className={`${styles.avatar} ${styles.avatarUser}`} icon={<UserOutlined />} />
        </div>
      );
    }

    const displayContent = msg.streaming ? streamedContent : msg.content;

    return (
      <div key={msg.id} className={styles.messageRowAssistant}>
        <Avatar className={`${styles.avatar} ${styles.avatarAssistant}`} icon={<RobotOutlined />} />
        <div className={styles.bubbleAssistantWrap}>
          <div className={styles.bubbleAssistant}>
            {msg.thinking && (msg.thinking.sql || msg.thinking.data || msg.thinking.validation) && (
              <ThinkingProcess thinking={msg.thinking} />
            )}

            {displayContent ? (
              <MarkdownView content={displayContent} streaming={msg.streaming} />
            ) : msg.streaming ? (
              <div className={styles.loadingRow}>
                <Spin size="small" /> <span style={{ marginLeft: 8, color: '#999' }}>正在生成...</span>
              </div>
            ) : null}

            {msg.data && msg.data.length > 0 && !msg.streaming && (
              <div className={styles.chartSection}>
                <div className={styles.chartToolbar}>
                  <Segmented
                    size="small"
                    value={chartType === 'auto' ? (msg.chart?.type || 'column') : chartType}
                    onChange={(v) => setChartType(v as string)}
                    options={[
                      { value: 'column', icon: <BarChartOutlined />, label: '柱状' },
                      { value: 'line', icon: <LineChartOutlined />, label: '折线' },
                      { value: 'pie', icon: <PieChartOutlined />, label: '饼图' },
                      { value: 'table', icon: <TableOutlined />, label: '表格' },
                    ]}
                  />
                </div>
                {(chartType === 'table' || msg.chart?.type === 'table') ? (
                  <div className={styles.tableContainer}>
                    <table className={styles.dataTable}>
                      <thead>
                        <tr>{Object.keys(msg.data[0]).map((k) => <th key={k}>{k}</th>)}</tr>
                      </thead>
                      <tbody>
                        {msg.data.map((row: any, i: number) => (
                          <tr key={i}>
                            {Object.values(row).map((v: any, j: number) => <td key={j}>{String(v ?? '')}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : renderChart(msg.chart, msg.data)}
              </div>
            )}
          </div>

          {!msg.streaming && msg.content && (
            <div className={styles.actionBar}>
              <Tooltip title="复制">
                <button className={styles.actionBtn} onClick={() => handleCopy(msg.content)}>
                  <CopyOutlined />
                </button>
              </Tooltip>
              <Tooltip title="有帮助">
                <button
                  className={styles.actionBtn}
                  onClick={() => handleFeedback(msg.id, 'like')}
                  style={msg.feedback === 'like' ? { color: '#1664FF' } : {}}
                >
                  <LikeOutlined />
                </button>
              </Tooltip>
              <Tooltip title="没帮助">
                <button
                  className={styles.actionBtn}
                  onClick={() => handleFeedback(msg.id, 'dislike')}
                  style={msg.feedback === 'dislike' ? { color: '#F53F3F' } : {}}
                >
                  <DislikeOutlined />
                </button>
              </Tooltip>
              <Tooltip title="重新生成">
                <button className={styles.actionBtn} onClick={handleRegenerate}>
                  <ReloadOutlined />
                </button>
              </Tooltip>
            </div>
          )}

          {!msg.streaming && msg === messages[messages.length - 1] && followups.length > 0 && (
            <RecommendedFollowups items={followups} onPick={handleQuickQuestion} />
          )}
        </div>
      </div>
    );
  };

  const hasContent = messages.length > 0;
  const isWelcome = !hasContent;

  const [convSearch, setConvSearch] = useState('');

  const filteredConvs = useMemo(() => {
    if (!convSearch.trim()) return conversations;
    const q = convSearch.toLowerCase();
    return conversations.filter((c) => (c.title || '').toLowerCase().includes(q));
  }, [conversations, convSearch]);

  const groupedConvs = useMemo(() => groupConversationsByTime(filteredConvs), [filteredConvs]);

  const renderConvItem = (conv: ConversationItem) => (
    <div
      key={conv.id}
      className={`${styles.convItem} ${conv.id === conversationId ? styles.convItemActive : ''}`}
      onClick={() => handleSelectConversation(conv.id)}
    >
      <div className={styles.convTitle}>{conv.title || '新对话…'}</div>
      <Popconfirm
        title="确定删除此对话？"
        description="删除后无法恢复。"
        onConfirm={(e) => { e?.stopPropagation(); handleDeleteConversation(conv.id); }}
        onCancel={(e) => e?.stopPropagation()}
        okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
      >
        <button
          className={styles.convDel}
          onClick={(e) => e.stopPropagation()}
        >
          <DeleteOutlined />
        </button>
      </Popconfirm>
    </div>
  );

  const sidebarContent = (
    <>
      <div className={styles.sidebarHeader}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}><RobotOutlined /></div>
          <span>Vanna AI</span>
        </div>
      </div>

      <button className={styles.newChatBtn} onClick={handleNewConversation}>
        <PlusOutlined /> 新对话
      </button>

      {conversations.length > 0 && (
        <div style={{ padding: '0 12px 8px' }}>
          <Input
            size="small"
            placeholder="搜索对话…"
            value={convSearch}
            onChange={(e) => setConvSearch(e.target.value)}
            prefix={<SearchOutlined style={{ color: '#8F959E' }} />}
            allowClear
          />
        </div>
      )}

      <div className={styles.convList}>
        {filteredConvs.length === 0 ? (
          <Empty
            description={convSearch ? '没有匹配的对话' : '暂无对话历史'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 20 }}
          />
        ) : (
          Object.entries(groupedConvs).map(([label, items]) =>
            items.length === 0 ? null : (
              <div key={label}>
                <div className={styles.sectionLabel}>{label}</div>
                {items.map(renderConvItem)}
              </div>
            )
          )
        )}
      </div>

      {conversations.length > 0 && (
        <div className={styles.sidebarFooter}>
          <div className={styles.userAvatar}>管</div>
          <div className={styles.userName}>管理员</div>
          <Popconfirm
            title="清空所有对话历史？"
            description="此操作不可恢复。"
            onConfirm={handleClearAll} okText="清空" cancelText="取消" okButtonProps={{ danger: true }}
          >
            <Tooltip title="清空全部">
              <button className={styles.iconBtn} onClick={(e) => e.stopPropagation()}>
                <ClearOutlined />
              </button>
            </Tooltip>
          </Popconfirm>
        </div>
      )}
    </>
  );

  const EXAMPLES = [
    { icon: '🔍', text: '朝阳区海康威视设备在线率', color: '#1677ff' },
    { icon: '📈', text: '本月设备增长趋势', color: '#722ed1' },
    { icon: '⚠️', text: '近 7 天高故障设备', color: '#ff4d4f' },
    { icon: '🗺️', text: '各区域设备分布', color: '#13c2c2' },
  ];

  const WelcomeScreen = (
    <div className={styles.welcome}>
      <div className={styles.welcomeLogo}><RobotOutlined /></div>
      <h1 className={styles.welcomeTitle}>您好！我是 Vanna</h1>
      <p className={styles.welcomeDesc}>用自然语言直接查询设备数据 · 支持多轮对话 · SQL 自动生成</p>

      <div className={styles.promptCards}>
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            type="button"
            className={styles.promptCard}
            onClick={() => { setInput(ex.text); inputRef.current?.focus(); }}
          >
            <div className={styles.promptCardIcon}>{ex.icon}</div>
            <div className={styles.promptCardTitle}>{ex.text}</div>
            <div className={styles.promptCardDesc}>点击开始提问</div>
          </button>
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: 720, marginTop: 32 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16,
        }}>
          {QUICK_CATEGORIES.map((cat) => (
            <div key={cat.key} style={{
              padding: 16, border: '1px solid #F0F2F5', borderRadius: 10,
              background: '#FAFBFC', textAlign: 'left'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: cat.color + '15', color: cat.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                }}>
                  {cat.icon}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1F2329' }}>{cat.title}</div>
                  <div style={{ fontSize: 12, color: '#8F959E' }}>{cat.subtitle}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cat.items.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleQuickQuestion(item.question)}
                    style={{
                      padding: '8px 10px', border: '1px solid #F0F2F5',
                      borderRadius: 6, background: '#FFFFFF', cursor: 'pointer',
                      fontSize: 12, color: '#1F2329', textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = cat.color;
                      e.currentTarget.style.color = cat.color;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#F0F2F5';
                      e.currentTarget.style.color = '#1F2329';
                    }}
                  >
                    <span style={{ marginRight: 6 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {status && (
        <div style={{ marginTop: 24, fontSize: 12, color: '#8F959E', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: status.trained ? '#52c41a' : '#fa8c16'
            }} />
            {status.trained ? '已训练' : '未训练'}
          </span>
          <span>·</span>
          <span>LLM <strong style={{ color: '#1F2329' }}>{status.llm_provider}</strong></span>
          <span>·</span>
          <span>训练数据 <strong style={{ color: '#1F2329' }}>{status.memory_size}</strong> 条</span>
          <span>·</span>
          <span>数据表 <strong style={{ color: '#1F2329' }}>{status.tables.length}</strong></span>
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        {sidebarContent}
      </aside>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              className={`${styles.iconBtn} ${styles.mobileMenuBtn}`}
              onClick={() => setMobileDrawerOpen(true)}
            >
              <MenuOutlined />
            </button>
            <div className={styles.modelSelect}>
              <RobotOutlined style={{ color: '#1664FF' }} />
              智能数据分析
              {status && (
                <Tag color={status.trained ? 'green' : 'orange'} style={{ marginLeft: 8 }}>
                  {status.trained ? '已训练' : '未训练'}
                </Tag>
              )}
            </div>
          </div>
          <div className={styles.topbarRight}>
            <button className={styles.topbarBtn} onClick={() => navigate('/vanna/train')}>
              <ToolOutlined /> 训练管理
            </button>
          </div>
        </div>

        {isWelcome ? (
          WelcomeScreen
        ) : (
          <>
            <div className={styles.chatArea}>
              <div className={styles.chatInner}>
                {messages.map((msg) => renderMessage(msg))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </>
        )}

        <div className={styles.inputArea}>
          <div className={styles.inputWrapper}>
            <div className={`${styles.inputBox} ${inputFocused ? styles.inputBoxFocused : ''}`}>
              <TextArea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={isWelcome ? "试着问：朝阳区海康威视设备在线率多少？" : "输入您的问题..."}
                autoSize={{ minRows: 1, maxRows: 4 }}
                maxLength={500}
                onPressEnter={(e) => {
                  if (e.shiftKey) return;
                  e.preventDefault();
                  handleSend();
                }}
                className={styles.inputTextarea}
              />
              <div className={styles.inputToolbar}>
                <div className={styles.inputTools}>
                  <button className={styles.toolBtn} type="button">
                    <ThunderboltOutlined />
                  </button>
                </div>
                {streaming ? (
                  <button
                    className={styles.sendBtn}
                    style={{ background: '#F53F3F' }}
                    onClick={handleStop}
                  >
                    <StopOutlined />
                  </button>
                ) : (
                  <button
                    className={styles.sendBtn}
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                  >
                    <SendOutlined />
                  </button>
                )}
              </div>
            </div>
            <div style={{
              textAlign: 'center', marginTop: 8, fontSize: 12, color: '#8F959E'
            }}>
              按 <kbd style={{
                padding: '1px 6px', background: '#F0F2F5', borderRadius: 4,
                fontSize: 11, fontFamily: 'monospace'
              }}>Enter</kbd> 发送，<kbd style={{
                padding: '1px 6px', background: '#F0F2F5', borderRadius: 4,
                fontSize: 11, fontFamily: 'monospace'
              }}>Shift</kbd>+<kbd style={{
                padding: '1px 6px', background: '#F0F2F5', borderRadius: 4,
                fontSize: 11, fontFamily: 'monospace'
              }}>Enter</kbd> 换行
              {streaming && <span style={{ marginLeft: 12 }}>生成中…</span>}
            </div>
          </div>
        </div>
      </div>

      <Drawer
        title="历史会话"
        placement="left"
        width={280}
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        {sidebarContent}
      </Drawer>
    </div>
  );
}
