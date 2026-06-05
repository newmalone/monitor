import { Card, Col, Progress, Row, Table } from 'antd';
import { DailyReportDeviceStat, DeviceTypeStats, ManufacturerStats, RegionStats, SignalStat } from '../types';

interface ChartPanelProps {
  manufacturerStats: ManufacturerStats[];
  regionStats: RegionStats[];
  deviceTypeStats: DeviceTypeStats[];
  dailyReportStats: DailyReportDeviceStat[];
  signalStats: SignalStat[];
}

export const ChartPanel = ({ manufacturerStats, regionStats, deviceTypeStats, dailyReportStats, signalStats }: ChartPanelProps) => {
  return (
    <Row gutter={16}>
      <Col span={24}>
        <Card title="路侧设备在线情况日统计（参考日报格式）" size="small" className="chart-card">
          <Table
            pagination={false}
            rowKey="name"
            dataSource={dailyReportStats}
            columns={[
              { title: '设备类型', dataIndex: 'name', key: 'name' },
              { title: '在线数量', dataIndex: 'online', key: 'online' },
              { title: '在线占比', dataIndex: 'onlineRate', key: 'onlineRate', render: (v: number) => `${v}%` },
              { title: '离线数量', dataIndex: 'offline', key: 'offline' },
              { title: '离线占比', dataIndex: 'offlineRate', key: 'offlineRate', render: (v: number) => `${v}%` },
              { title: '异常数量', dataIndex: 'abnormal', key: 'abnormal' },
              { title: '异常占比', dataIndex: 'abnormalRate', key: 'abnormalRate', render: (v: number) => `${v}%` },
              { title: '合计', dataIndex: 'total', key: 'total' },
            ]}
          />
        </Card>
      </Col>

      <Col span={24}>
        <Card title="信号机治理情况日统计（预留区）" size="small" className="chart-card">
          <Table
            pagination={false}
            rowKey="name"
            dataSource={signalStats}
            columns={[
              { title: '路口状态', dataIndex: 'name', key: 'name' },
              { title: '数量', dataIndex: 'count', key: 'count' },
              { title: '占比', dataIndex: 'rate', key: 'rate', render: (v: number) => `${v}%` },
            ]}
          />
        </Card>
      </Col>

      <Col span={12}>
        <Card title="厂商设备分布（已启用）" size="small" className="chart-card">
          <Table
            columns={[
              { title: '厂商', dataIndex: 'name', key: 'name' },
              { title: '总数', dataIndex: 'total', key: 'total' },
              { title: '在线率', dataIndex: 'onlineRate', key: 'onlineRate', render: (v: number) => <Progress percent={v} size="small" strokeColor={v >= 90 ? '#52c41a' : v >= 70 ? '#faad14' : '#ff4d4f'} /> },
              { title: '在线', dataIndex: 'online', key: 'online' },
              { title: '离线', dataIndex: 'offline', key: 'offline' },
              { title: '异常', dataIndex: 'abnormal', key: 'abnormal' },
            ]}
            dataSource={manufacturerStats.map((m, i) => ({ ...m, key: i }))}
            pagination={false}
            size="small"
          />
        </Card>
      </Col>

      <Col span={6}>
        <Card title="区域设备分布（已启用）" size="small" className="chart-card">
          <Table
            columns={[
              { title: '区域', dataIndex: 'name', key: 'name' },
              { title: '设备数', dataIndex: 'total', key: 'total' },
              { title: '在线', dataIndex: 'online', key: 'online' },
              { title: '离线', dataIndex: 'offline', key: 'offline' },
              { title: '异常', dataIndex: 'abnormal', key: 'abnormal' },
            ]}
            dataSource={regionStats.map((r, i) => ({ ...r, key: i }))}
            pagination={false}
            size="small"
          />
        </Card>
      </Col>

      <Col span={6}>
        <Card title="设备类型分布（已启用）" size="small" className="chart-card">
          <Table
            columns={[
              { title: '类型', dataIndex: 'name', key: 'name' },
              { title: '总数', dataIndex: 'total', key: 'total' },
              { title: '在线', dataIndex: 'online', key: 'online' },
              { title: '离线', dataIndex: 'offline', key: 'offline' },
              { title: '异常', dataIndex: 'abnormal', key: 'abnormal' },
            ]}
            dataSource={deviceTypeStats.map((t, i) => ({ ...t, key: i }))}
            pagination={false}
            size="small"
          />
        </Card>
      </Col>
    </Row>
  );
};
