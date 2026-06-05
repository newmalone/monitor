import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Input, List, Space, Spin, Tag, Typography, Table, Collapse, Row, Col, Statistic, Progress, Divider, Popover, Dropdown, message as antMessage } from 'antd';
import { SendOutlined, DownloadOutlined, FileExcelOutlined, FileWordOutlined, FileTextOutlined } from '@ant-design/icons';
import type { AgentMessage, ChatResponse, ReportData } from '../services/agentApi';
import { sendChatMessage, exportReport, downloadReport } from '../services/agentApi';

const { Text, Title } = Typography;

const RESPONSE_TYPE_MAP: Record<string, { color: string; label: string }> = {
  stats: { color: 'blue', label: '统计查询' },
  comparison: { color: 'green', label: '数据对比' },
  qa: { color: 'orange', label: '知识问答' },
  devices: { color: 'purple', label: '设备查询' },
  report: { color: 'red', label: '报告生成' },
  troubleshooting: { color: 'volcano', label: '故障排查' },
  diagnosis: { color: 'magenta', label: '故障诊断' },
  trend: { color: 'cyan', label: '趋势分析' },
  help: { color: 'lime', label: '帮助' },
  default: { color: 'default', label: '智能回复' },
};

function getResponseTypeInfo(type: string) {
  return RESPONSE_TYPE_MAP[type] || RESPONSE_TYPE_MAP.default;
}

function formatTime(timestamp?: string): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function renderContent(text: string): JSX.Element {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} style={{ margin: '4px 0', paddingLeft: 20 }}>
          {listItems.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      inList = true;
      listItems.push(trimmed.replace(/^[-•]\s*/, ''));
    } else {
      flushList();
      if (trimmed) {
        elements.push(<div key={i}>{trimmed}</div>);
      } else {
        elements.push(<div key={i} style={{ height: 8 }} />);
      }
    }
  });
  flushList();

  return <>{elements}</>;
}

/** Enhanced stats card with visual indicators */
function StatsDisplay({ data, date }: { data: Record<string, any>; date?: string }) {
  const stats = {
    totalCount: data.totalCount ?? 0,
    onlineCount: data.onlineCount ?? 0,
    offlineCount: data.offlineCount ?? 0,
    abnormalCount: data.abnormalCount ?? 0,
    enabledCount: data.enabledCount ?? 0,
    onlineRate: data.onlineRate ?? 0,
  };

  const rateColor = stats.onlineRate >= 90 ? '#52c41a' : stats.onlineRate >= 70 ? '#faad14' : '#ff4d4f';

  return (
    <Card size="small" style={{ marginTop: 8, background: '#fafbff' }} bordered={false}>
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary">{date || '统计数据'}</Text>
      </div>
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Statistic title="设备总数" value={stats.totalCount} suffix="台" valueStyle={{ fontSize: 20 }} />
        </Col>
        <Col span={8}>
          <Statistic title="在线设备" value={stats.onlineCount} suffix="台" valueStyle={{ color: '#52c41a', fontSize: 20 }} />
        </Col>
        <Col span={8}>
          <Statistic title="在线率" value={stats.onlineRate} suffix="%" valueStyle={{ color: rateColor, fontSize: 20 }} />
        </Col>
      </Row>
      <Progress percent={stats.onlineRate} strokeColor={rateColor} size="small" style={{ marginTop: 12 }} />
      <Divider style={{ margin: '8px 0' }} />
      <Row gutter={8}>
        <Col span={8}>
          <Statistic title="离线" value={stats.offlineCount} valueStyle={{ color: '#ff4d4f', fontSize: 16 }} />
        </Col>
        <Col span={8}>
          <Statistic title="异常" value={stats.abnormalCount} valueStyle={{ color: '#fa8c16', fontSize: 16 }} />
        </Col>
        <Col span={8}>
          <Statistic title="启用" value={stats.enabledCount} valueStyle={{ fontSize: 16 }} />
        </Col>
      </Row>
    </Card>
  );
}

/** Breakdown display (by manufacturer/type/region) */
function BreakdownDisplay({ breakdowns }: { breakdowns?: Record<string, any> }) {
  if (!breakdowns) return null;

  const sectionMap: Record<string, { label: string; items: any[] }> = {
    byManufacturer: { label: '按厂商', items: breakdowns.byManufacturer || [] },
    byDeviceType: { label: '按设备类型', items: breakdowns.byDeviceType || [] },
    byRegion: { label: '按区域', items: breakdowns.byRegion || [] },
  };

  const validSections = Object.entries(sectionMap).filter(([, v]) => v.items.length > 0);
  if (validSections.length === 0) return null;

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '总数', dataIndex: 'totalCount', key: 'totalCount', width: 80 },
    { title: '在线', dataIndex: 'onlineCount', key: 'onlineCount', width: 80 },
    {
      title: '在线率',
      dataIndex: 'onlineRate',
      key: 'onlineRate',
      width: 100,
      render: (rate: number) => (
        <Progress
          percent={Math.min(rate, 100)}
          size="small"
          strokeColor={rate >= 90 ? '#52c41a' : rate >= 70 ? '#faad14' : '#ff4d4f'}
          format={() => `${rate}%`}
        />
      ),
    },
  ];

  return (
    <Collapse
      items={validSections.map(([key, section]) => ({
        key,
        label: `${section.label} (${section.items.length}项)`,
        children: (
          <Table
            dataSource={section.items}
            columns={columns}
            rowKey="name"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        ),
      }))}
      style={{ marginTop: 8 }}
      bordered={false}
      defaultActiveKey={[]}
    />
  );
}

/** Enhanced comparison display */
function ComparisonDisplay({ data }: { data: Record<string, any> }) {
  if (!data || (!data.date1 && !data.date1Stats)) return null;

  const date1Stats = data.date1 || data.date1Stats;
  const date2Stats = data.date2 || data.date2Stats;
  const diff = data.diff || {};

  if (!date1Stats || !date2Stats) return null;

  const compareColumns = [
    { title: '指标', dataIndex: 'metric', key: 'metric', width: 100 },
    { title: date1Stats.date || '日期1', key: 'date1', width: 120, render: (_: any, record: any) => record.date1Value },
    { title: date2Stats.date || '日期2', key: 'date2', width: 120, render: (_: any, record: any) => record.date2Value },
    { title: '变化', key: 'diff', render: (_: any, record: any) => {
      const d = record.diff;
      if (typeof d !== 'number') return '-';
      const color = d > 0 ? '#52c41a' : d < 0 ? '#ff4d4f' : '#999';
      return <Text style={{ color, fontWeight: 600 }}>{d > 0 ? `+${d}` : d}</Text>;
    }},
  ];

  const compareData = [
    { metric: '设备总数', date1Value: date1Stats.totalCount, date2Value: date2Stats.totalCount, diff: diff.totalCount },
    { metric: '在线设备', date1Value: date1Stats.onlineCount, date2Value: date2Stats.onlineCount, diff: diff.onlineCount },
    { metric: '离线设备', date1Value: date1Stats.offlineCount, date2Value: date2Stats.offlineCount, diff: diff.offlineCount },
    { metric: '在线率(%)', date1Value: `${date1Stats.onlineRate}%`, date2Value: `${date2Stats.onlineRate}%`, diff: diff.onlineRate },
  ];

  return (
    <Card size="small" style={{ marginTop: 8, background: '#f6ffed' }} bordered={false}>
      <Table
        dataSource={compareData}
        columns={compareColumns}
        rowKey="metric"
        size="small"
        pagination={false}
      />
    </Card>
  );
}

/** Devices display with full table */
function DevicesDisplay({ devices, total, hasMore }: { devices: any[]; total?: number; hasMore?: boolean }) {
  if (!devices || devices.length === 0) return null;

  const columns = [
    { title: '设备名称', dataIndex: 'location', key: 'location', ellipsis: true },
    { title: '设备编号', dataIndex: 'deviceCode', key: 'deviceCode' },
    { title: '类型', dataIndex: 'deviceTypeName', key: 'deviceTypeName' },
    { title: '厂商', dataIndex: 'manufacturerName', key: 'manufacturerName' },
    { title: '区域', dataIndex: 'region', key: 'region' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => {
        const color = s === '在线' ? 'success' : s === '离线' ? 'error' : 'warning';
        return <Tag color={color}>{s}</Tag>;
      },
    },
  ];

  return (
    <div style={{ marginTop: 8 }}>
      <Text type="secondary" style={{ marginBottom: 4, display: 'block' }}>
        共 {total || devices.length} 台设备{hasMore ? '（显示前50条）' : ''}
      </Text>
      <Table
        dataSource={devices}
        columns={columns}
        rowKey={(r: any) => r.id || r.deviceCode || r.ipAddress || Math.random()}
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: false }}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
}

/** Report display with download buttons */
function ReportDisplay({ data }: { data: Record<string, any> }) {
  const [exporting, setExporting] = useState(false);

  const report = data.report || data;
  const title = report.title || '设备监控报告';
  const date = report.date || '';
  const summary = report.summary || '';
  const stats = report.stats || {};
  const breakdowns = report.breakdowns || {};

  const handleExport = async (format: 'csv' | 'xlsx' | 'word') => {
    setExporting(true);
    try {
      await exportReport({ title, date, summary, stats, breakdowns }, format);
      antMessage.success(`已导出 ${format.toUpperCase()} 文件`);
    } catch (err: any) {
      antMessage.error(`导出失败: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const menuItems = [
    { key: 'csv', label: '导出 CSV', icon: <FileExcelOutlined />, onClick: () => handleExport('csv') },
    { key: 'xlsx', label: '导出 Excel', icon: <FileExcelOutlined />, onClick: () => handleExport('xlsx') },
    { key: 'word', label: '导出 Word', icon: <FileWordOutlined />, onClick: () => handleExport('word') },
  ];

  return (
    <Card size="small" style={{ marginTop: 8 }} bordered={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <Title level={5} style={{ margin: '0 0 4px 0' }}>{title}</Title>
          <Text type="secondary">{date}</Text>
        </div>
        <Dropdown menu={{ items: menuItems }} placement="bottomRight">
          <Button type="primary" icon={<DownloadOutlined />} loading={exporting}>
            下载
          </Button>
        </Dropdown>
      </div>

      <Card size="small" style={{ background: '#f6ffed', marginBottom: 12 }}>
        <Text>{summary}</Text>
      </Card>

      {Object.keys(stats).length > 0 && !stats.date1 && (
        <StatsDisplay data={stats} date={date} />
      )}

      {breakdowns && Object.keys(breakdowns).length > 0 && (
        <BreakdownDisplay breakdowns={breakdowns} />
      )}
    </Card>
  );
}

/** Trend display */
function TrendDisplay({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '总数', dataIndex: 'totalCount', key: 'totalCount', width: 80 },
    { title: '在线', dataIndex: 'onlineCount', key: 'onlineCount', width: 80 },
    {
      title: '在线率',
      dataIndex: 'onlineRate',
      key: 'onlineRate',
      render: (rate: number) => (
        <Progress
          percent={Math.min(rate, 100)}
          size="small"
          strokeColor={rate >= 90 ? '#52c41a' : rate >= 70 ? '#faad14' : '#ff4d4f'}
          format={() => `${rate}%`}
        />
      ),
    },
  ];

  return <Table dataSource={data} columns={columns} rowKey="date" size="small" pagination={false} style={{ marginTop: 8 }} />;
}

interface AgentChatProps {
  messages: AgentMessage[];
  conversationId?: string;
  onMessagesChange: (messages: AgentMessage[]) => void;
  onConversationIdChange: (id: string) => void;
}

export default function AgentChat({
  messages,
  conversationId,
  onMessagesChange,
  onConversationIdChange,
}: AgentChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const doSend = useCallback(async (text: string) => {
    if (!text || loading) return;

    setInputValue('');
    setLoading(true);

    const userMsg: AgentMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...messages, userMsg];
    onMessagesChange(updatedMessages);

    try {
      const res: ChatResponse = await sendChatMessage(text, conversationId);
      if (res.success) {
        onConversationIdChange(res.conversationId);

        const assistantMsg: AgentMessage = {
          role: 'assistant',
          content: res.response.data.message || res.response.data.text || '收到请求，正在处理...',
          timestamp: res.response.timestamp,
          metadata: {
            intent: res.intent.intent,
            routeType: res.response.type,
            stats: res.response.data.stats,
            devices: res.response.data.devices,
            breakdowns: res.response.data.breakdowns,
            report: res.response.data.report,
            trend: res.response.data.trend,
            sources: res.response.data.sources,
          },
        };
        onMessagesChange([...updatedMessages, assistantMsg]);
      }
    } catch (err: any) {
      const errMsg: AgentMessage = {
        role: 'assistant',
        content: `请求失败: ${err.message || '未知错误'}`,
        timestamp: new Date().toISOString(),
        metadata: { routeType: 'error' },
      };
      onMessagesChange([...updatedMessages, errMsg]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, conversationId, onMessagesChange, onConversationIdChange]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (text) {
      doSend(text);
    }
  }, [inputValue, doSend]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) {
        doSend(detail);
      }
    };
    window.addEventListener('agent-send', handler);
    return () => window.removeEventListener('agent-send', handler);
  }, [doSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessageContent = (msg: AgentMessage): JSX.Element => {
    const routeType = msg.metadata?.routeType || '';
    const stats = msg.metadata?.stats;
    const devices = msg.metadata?.devices;
    const breakdowns = msg.metadata?.breakdowns;
    const report = msg.metadata?.report;
    const trend = msg.metadata?.trend;

    const parts: JSX.Element[] = [];
    parts.push(<div key="text">{renderContent(msg.content)}</div>);

    if (routeType === 'report' && report) {
      parts.push(<ReportDisplay key="report" data={report} />);
    } else if (routeType === 'stats' && stats) {
      parts.push(<StatsDisplay key="stats" data={stats} date={stats.date} />);
      if (breakdowns) {
        parts.push(<BreakdownDisplay key="breakdown" breakdowns={breakdowns} />);
      }
    } else if (routeType === 'comparison' && stats) {
      parts.push(<ComparisonDisplay key="comparison" data={stats} />);
    } else if (routeType === 'devices' && devices && devices.length > 0) {
      parts.push(<DevicesDisplay key="devices" devices={devices} total={msg.metadata?.total} hasMore={msg.metadata?.hasMore} />);
    } else if (routeType === 'trend' && trend) {
      parts.push(<TrendDisplay key="trend" data={trend} />);
    }

    return <>{parts}</>;
  };

  return (
    <div className="agent-chat-container">
      <div className="agent-chat-messages" ref={listRef}>
        {messages.length === 0 && !loading ? (
          <div className="agent-chat-empty">
            <Title level={4} style={{ marginBottom: 8 }}>设备监控智能助手</Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              支持统计查询、数据对比、报表生成、故障诊断等
            </Text>
            <div style={{ marginTop: 16 }}>
              <Space direction="vertical" size={4}>
                {[
                  '今天在线设备有多少',
                  '昨天和今天的在线率对比',
                  '生成今日日报',
                  '有哪些异常设备',
                ].map(q => (
                  <Button
                    key={q}
                    type="link"
                    size="small"
                    onClick={() => doSend(q)}
                    style={{ padding: 0 }}
                  >
                    {q}
                  </Button>
                ))}
              </Space>
            </div>
          </div>
        ) : (
          <List<AgentMessage>
            dataSource={messages}
            renderItem={(msg) => {
              const isUser = msg.role === 'user';
              const typeInfo = !isUser ? getResponseTypeInfo(msg.metadata?.routeType || '') : null;

              return (
                <div className={`agent-message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
                  {!isUser && typeInfo && (
                    <Tag color={typeInfo.color} style={{ marginBottom: 4 }}>
                      {typeInfo.label}
                    </Tag>
                  )}
                  <div className="agent-message-text">{renderMessageContent(msg)}</div>
                  <div className="agent-message-time">
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {formatTime(msg.timestamp)}
                    </Text>
                  </div>
                </div>
              );
            }}
          />
        )}
        {loading && (
          <div className="agent-message-bubble assistant-bubble">
            <Spin size="small" />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              思考中...
            </Text>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="agent-chat-input">
        <Input.TextArea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题，按 Enter 发送..."
          autoSize={{ minRows: 1, maxRows: 4 }}
          disabled={loading}
          className="agent-chat-textarea"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={loading}
          disabled={!inputValue.trim()}
          className="agent-chat-send-btn"
        />
      </div>
    </div>
  );
}
