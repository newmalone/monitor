import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Layout, List, Popconfirm, Space, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, MessageOutlined } from '@ant-design/icons';
import AgentChat from '../components/AgentChat';
import QuickActions from '../components/QuickActions';
import type { AgentMessage, ConversationSummary } from '../services/agentApi';
import { getConversations, getConversation, deleteConversation } from '../services/agentApi';
import './AgentPage.css';

const { Text } = Typography;
const { Sider, Content } = Layout;

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

export default function AgentPage() {
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const list = await getConversations();
      setConversationList(list);
    } catch {
      // silently ignore
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await getConversation(id);
      const mapped: AgentMessage[] = (data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        metadata: m.metadata,
      }));
      setMessages(mapped);
      setCurrentConversationId(id);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setCurrentConversationId(undefined);
    setMessages([]);
  }, []);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await deleteConversation(id);
        if (currentConversationId === id) {
          handleNewChat();
        }
        await loadConversations();
      } catch {
        // silently ignore
      }
    },
    [currentConversationId, handleNewChat, loadConversations]
  );

  const handleMessagesChange = useCallback((newMessages: AgentMessage[]) => {
    setMessages(newMessages);
  }, []);

  const handleConversationIdChange = useCallback((id: string) => {
    setCurrentConversationId(id);
  }, []);

  const handleQuickAction = useCallback(
    (query: string) => {
      // Trigger send via the chat component by adding to messages
      // We need to pass this through - but since AgentChat handles its own send,
      // we'll simulate by setting a temporary state.
      // Instead, let's use a ref approach or just call the chat directly.
      // The simplest way: dispatch a custom event that AgentChat listens to.
      window.dispatchEvent(new CustomEvent('agent-send', { detail: query }));
    },
    []
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return (
    <Layout className="agent-page-layout">
      <Sider width={280} className="agent-sidebar" theme="light" collapsedWidth={0}>
        <div className="agent-sidebar-header">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleNewChat} block>
            新建对话
          </Button>
        </div>
        <div className="agent-sidebar-content">
          {conversationList.length === 0 ? (
            <Empty description="暂无对话记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List<ConversationSummary>
              dataSource={conversationList}
              renderItem={(item) => {
                const isActive = item.id === currentConversationId;
                return (
                  <List.Item
                    className={`agent-conversation-item ${isActive ? 'active' : ''}`}
                    onClick={() => loadConversation(item.id)}
                    actions={[
                      <Popconfirm
                        key="delete"
                        title="确定删除此对话？"
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleDeleteConversation(item.id);
                        }}
                        okText="删除"
                        cancelText="取消"
                      >
                        <DeleteOutlined
                          className="agent-conversation-delete"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>,
                    ]}
                  >
                    <div className="agent-conversation-info">
                      <div className="agent-conversation-title">
                        <MessageOutlined />
                        <Text ellipsis>{item.title || '新对话'}</Text>
                      </div>
                      <div className="agent-conversation-meta">
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {item.messageCount} 条消息 · {formatRelativeTime(item.updatedAt)}
                        </Text>
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </Sider>
      <Content className="agent-main-content">
        <div className="agent-chat-wrapper">
          <AgentChat
            messages={messages}
            conversationId={currentConversationId}
            onMessagesChange={handleMessagesChange}
            onConversationIdChange={handleConversationIdChange}
          />
        </div>
        <QuickActions onSendMessage={handleQuickAction} />
      </Content>
    </Layout>
  );
}
