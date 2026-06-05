import { Card, Row, Col, Tag, Progress } from 'antd';
import { DashboardOutlined, WifiOutlined, AlertOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { Statistics } from '../types';

interface StatsCardProps {
  statistics: Statistics;
}

export const StatsCard = ({ statistics }: StatsCardProps) => {
  const { total, online, offline, abnormal, onlineRate, offlineRate, abnormalRate } = statistics;

  const cards = [
    { title: '已启用设备总数', value: total, icon: <DashboardOutlined />, color: '#1890ff' },
    { title: '在线设备', value: online, icon: <WifiOutlined />, color: '#52c41a', rate: onlineRate },
    { title: '离线设备', value: offline, icon: <CloseCircleOutlined />, color: '#ff4d4f', rate: offlineRate },
    { title: '异常设备', value: abnormal, icon: <AlertOutlined />, color: '#faad14', rate: abnormalRate },
  ];

  return (
    <Card className="stats-card" title="设备状态概览（仅统计已启用设备）">
      <Row gutter={16}>
        {cards.map((card, index) => (
          <Col span={6} key={index}>
            <div className="stat-item" style={{ borderColor: card.color }}>
              <div className="stat-icon" style={{ color: card.color }}>{card.icon}</div>
              <div className="stat-info">
                <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
                <div className="stat-label">{card.title}</div>
              </div>
              {card.rate !== undefined && (
                <Progress percent={card.rate} strokeColor={card.color} size={80} type="circle" format={p => `${p}%`} />
              )}
            </div>
          </Col>
        ))}
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={24}>
          <div className="status-summary">
            <div className="status-item"><Tag icon={<CheckCircleOutlined />} color="success">在线</Tag><span>{online} 台 ({onlineRate}%)</span></div>
            <div className="status-item"><Tag icon={<CloseCircleOutlined />} color="error">离线</Tag><span>{offline} 台 ({offlineRate}%)</span></div>
            <div className="status-item"><Tag icon={<AlertOutlined />} color="warning">异常</Tag><span>{abnormal} 台 ({abnormalRate}%)</span></div>
          </div>
        </Col>
      </Row>
    </Card>
  );
};
