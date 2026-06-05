import { useEffect, useState } from 'react';
import { Button, Card, Empty, message, Popconfirm, Space, Table } from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { deleteSnapshot, getAllSnapshots } from '../services/api';

export const HistoryPage = () => {
  const [snapshots, setSnapshots] = useState<{ date: string; sourceFile: string; importedAt: string; totalCount: number; enabledCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const all = await getAllSnapshots();
      setSnapshots(all);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleDelete = async (date: string) => {
    await deleteSnapshot(date);
    message.success(`已删除 ${date} 的数据`);
    loadHistory();
  };

  const handleUse = (date: string) => {
    sessionStorage.setItem('activeSnapshotDate', date);
    message.success(`已切换到 ${date} 的历史数据`);
    navigate('/');
  };

  const dataSource = snapshots.map((s) => ({
    key: s.date,
    date: s.date,
    sourceFile: s.sourceFile,
    total: s.enabledCount,
    totalAll: s.totalCount,
    importedAt: s.importedAt,
  }));

  const columns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    { title: '来源文件', dataIndex: 'sourceFile', key: 'sourceFile', width: 200, ellipsis: true },
    { title: '已启用设备', dataIndex: 'total', key: 'total', width: 100 },
    { title: '总设备数', dataIndex: 'totalAll', key: 'totalAll', width: 100 },
    { title: '导入时间', dataIndex: 'importedAt', key: 'importedAt', width: 160 },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: unknown, record: { date: string }) => (
        <Space>
          <Button type="primary" onClick={() => handleUse(record.date)}>重新调取使用</Button>
          <Popconfirm title="确定删除该日数据？" onConfirm={() => handleDelete(record.date)}>
            <Button danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 className="page-title">导入历史查询</h2>
          <p style={{ margin: '4px 0 0 0', color: '#999', fontSize: 13 }}>查看和管理已导入的历史数据快照</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadHistory}>刷新</Button>
      </div>

      {dataSource.length === 0 && !loading && <Empty description="暂无导入历史记录" />}

      {dataSource.length > 0 && (
        <Card className="history-card">
          <Table columns={columns} dataSource={dataSource} loading={loading} pagination={{ pageSize: 20 }} />
        </Card>
      )}
    </div>
  );
};
