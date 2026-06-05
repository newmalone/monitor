import { useEffect, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Empty, Space, Table, message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { ArrowDownOutlined, ArrowUpOutlined, SwapOutlined } from '@ant-design/icons';
import { ComparisonData, Device } from '../types';
import { buildComparisonBetween } from '../services/comparison';
import { getAllSnapshots, getSnapshotDevices } from '../services/api';

export const ComparePage = () => {
  const [snapshots, setSnapshots] = useState<{ date: string; sourceFile: string; importedAt: string; totalCount: number; enabledCount: number }[]>([]);
  const [dateA, setDateA] = useState<string>('');
  const [dateB, setDateB] = useState<string>('');
  const [devicesA, setDevicesA] = useState<Device[]>([]);
  const [devicesB, setDevicesB] = useState<Device[]>([]);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSnapshots();
  }, []);

  const loadSnapshots = async () => {
    setLoading(true);
    const all = await getAllSnapshots();
    setSnapshots(all);
    if (all.length >= 2) {
      setDateA(all[0].date);
      setDateB(all[1].date);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (dateA && dateB) {
      loadDevices();
    }
  }, [dateA, dateB]);

  const loadDevices = async () => {
    if (!dateA || !dateB) return;
    try {
      const [devA, devB] = await Promise.all([
        getSnapshotDevices(dateA),
        getSnapshotDevices(dateB),
      ]);
      setDevicesA(devA);
      setDevicesB(devB);
    } catch (e) {
      console.error('加载设备数据失败', e);
    }
  };

  useEffect(() => {
    if (devicesA.length > 0 && devicesB.length > 0) {
      setComparison(buildComparisonBetween('任意双日期对比', dateA, dateB, devicesA, devicesB));
    } else {
      setComparison(null);
    }
  }, [devicesA, devicesB]);

  const disabledDates = useMemo(() => snapshots.map(s => s.date), [snapshots]);

  const renderDiff = (a: number, b: number) => {
    const diff = a - b;
    if (diff === 0) return <span style={{ color: '#666' }}>0</span>;
    const color = diff > 0 ? '#52c41a' : '#ff4d4f';
    const icon = diff > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />;
    return <span style={{ color }}>{icon} {Math.abs(diff)}%</span>;
  };

  const disabledPickerDate = (current: Dayjs) => {
    const currentStr = current.format('YYYY-MM-DD');
    return !disabledDates.includes(currentStr);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 className="page-title">数据比对分析</h2>
          <p style={{ margin: '4px 0 0 0', color: '#999', fontSize: 13 }}>对比不同日期的设备运行状态变化</p>
        </div>
      </div>

      <Card className="comparison-card" style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <div>
            <div style={{ marginBottom: 8 }}>日期A</div>
            <DatePicker value={dateA ? dayjs(dateA) : null} onChange={(d) => setDateA(d ? d.format('YYYY-MM-DD') : '')} disabledDate={disabledPickerDate} />
          </div>
          <div>
            <div style={{ marginBottom: 8 }}>日期B</div>
            <DatePicker value={dateB ? dayjs(dateB) : null} onChange={(d) => setDateB(d ? d.format('YYYY-MM-DD') : '')} disabledDate={disabledPickerDate} />
          </div>
          <div style={{ paddingTop: 30 }}>
            <Button icon={<SwapOutlined />} onClick={() => { const a = dateA; setDateA(dateB); setDateB(a); }}>交换日期</Button>
          </div>
        </Space>
      </Card>

      {!comparison && !loading && <Empty description="请选择两个历史日期进行对比" />}

      {comparison && (
        <Card className="comparison-card" title={`${comparison.dateA} 对比 ${comparison.dateB}`}>
          <Table
            pagination={false}
            rowKey="metric"
            dataSource={[
              { metric: '已启用设备总数', a: comparison.overallA.total, b: comparison.overallB.total, diff: comparison.overallA.total - comparison.overallB.total },
              { metric: '在线率', a: `${comparison.overallA.onlineRate}%`, b: `${comparison.overallB.onlineRate}%`, diffNode: renderDiff(comparison.overallA.onlineRate, comparison.overallB.onlineRate) },
              { metric: '离线率', a: `${comparison.overallA.offlineRate}%`, b: `${comparison.overallB.offlineRate}%`, diffNode: renderDiff(comparison.overallB.offlineRate, comparison.overallA.offlineRate) },
              { metric: '异常率', a: `${comparison.overallA.abnormalRate}%`, b: `${comparison.overallB.abnormalRate}%`, diffNode: renderDiff(comparison.overallB.abnormalRate, comparison.overallA.abnormalRate) },
            ]}
            columns={[
              { title: '指标', dataIndex: 'metric', key: 'metric' },
              { title: comparison.dateA, dataIndex: 'a', key: 'a' },
              { title: comparison.dateB, dataIndex: 'b', key: 'b' },
              { title: '变化', key: 'diff', render: (_, r: any) => r.diffNode ?? r.diff },
            ]}
          />

          <div style={{ height: 16 }} />

          <Table
            pagination={false}
            rowKey="name"
            dataSource={comparison.manufacturerA.map((m) => {
              const mb = comparison.manufacturerB.find(x => x.name === m.name);
              return {
                name: m.name,
                a: `${m.onlineRate}%`,
                b: mb ? `${mb.onlineRate}%` : '-',
                diffNode: mb ? renderDiff(m.onlineRate, mb.onlineRate) : '-',
              };
            })}
            columns={[
              { title: '厂商在线率对比', dataIndex: 'name', key: 'name' },
              { title: comparison.dateA, dataIndex: 'a', key: 'a' },
              { title: comparison.dateB, dataIndex: 'b', key: 'b' },
              { title: '变化', dataIndex: 'diffNode', key: 'diffNode' },
            ]}
          />
        </Card>
      )}
    </div>
  );
};
