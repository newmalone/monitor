import { useState } from 'react';
import { Button, Space, Tabs, Typography } from 'antd';

const { Text } = Typography;

interface QuickAction {
  label: string;
  query: string;
}

interface ActionCategory {
  key: string;
  label: string;
  actions: QuickAction[];
}

const categories: ActionCategory[] = [
  {
    key: 'query',
    label: '数据查询',
    actions: [
      { label: '今天在线设备', query: '今天在线设备有多少' },
      { label: '统计在线率', query: '统计今天的在线率' },
      { label: '离线设备列表', query: '查看离线设备列表' },
      { label: '按厂商统计', query: '按厂商统计在线率' },
    ],
  },
  {
    key: 'comparison',
    label: '对比分析',
    actions: [
      { label: '昨日对比', query: '昨天和今天的在线率对比' },
      { label: '近两天对比', query: '对比近两天的设备变化' },
      { label: '本周趋势', query: '查看本周趋势' },
    ],
  },
  {
    key: 'troubleshoot',
    label: '故障排查',
    actions: [
      { label: '异常设备', query: '有哪些异常设备' },
      { label: '设备离线排查', query: '设备离线排查' },
      { label: '故障率统计', query: '最近故障率统计' },
    ],
  },
  {
    key: 'report',
    label: '报告生成',
    actions: [
      { label: '今日日报', query: '生成今日日报' },
      { label: '本周周报', query: '生成本周周报' },
    ],
  },
];

interface QuickActionsProps {
  onSendMessage: (query: string) => void;
}

export default function QuickActions({ onSendMessage }: QuickActionsProps) {
  const [activeTab, setActiveTab] = useState('query');

  const currentCategory = categories.find((c) => c.key === activeTab);

  return (
    <div className="agent-quick-actions">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="small"
        items={categories.map((c) => ({
          key: c.key,
          label: c.label,
        }))}
      />
      <div className="agent-quick-actions-grid">
        {currentCategory?.actions.map((action) => (
          <Button
            key={action.query}
            size="small"
            onClick={() => onSendMessage(action.query)}
            className="agent-quick-action-btn"
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
