import { useState } from 'react';
import { Card, Table, Tag, Input, Select, Button } from 'antd';
import { WifiOutlined, ApiOutlined, AlertOutlined, SearchOutlined } from '@ant-design/icons';
import { Device } from '../types';

interface DeviceTableProps {
  devices: Device[];
}

export const DeviceTable = ({ devices }: DeviceTableProps) => {
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');

  const enabledDevices = devices.filter(d => d.enabled === '启用');
  const regions = [...new Set(enabledDevices.map(d => d.region).filter(Boolean))];
  const manufacturers = [...new Set(enabledDevices.map(d => d.manufacturerName).filter(Boolean))];

  const filteredDevices = enabledDevices.filter(device => {
    if (searchText && !device.deviceCode.includes(searchText) && !device.productName.includes(searchText)) return false;
    if (statusFilter && device.status !== statusFilter) return false;
    if (regionFilter && device.region !== regionFilter) return false;
    if (manufacturerFilter && device.manufacturerName !== manufacturerFilter) return false;
    return true;
  });

  const statusColors: Record<string, string> = { 在线: 'success', 离线: 'error', 异常: 'warning' };
  const statusIcons: Record<string, JSX.Element> = { 在线: <WifiOutlined />, 离线: <ApiOutlined />, 异常: <AlertOutlined /> };

  const columns = [
    { title: '设备编号', dataIndex: 'deviceCode', key: 'deviceCode', width: 120 },
    { title: '产品名称', dataIndex: 'productName', key: 'productName', width: 150 },
    { title: '厂商', dataIndex: 'manufacturerName', key: 'manufacturerName', width: 100 },
    { title: '类型', dataIndex: 'deviceTypeName', key: 'deviceTypeName', width: 120 },
    { title: '区域', dataIndex: 'region', key: 'region', width: 80 },
    { title: '位置', dataIndex: 'location', key: 'location', width: 150 },
    { title: 'IP地址', dataIndex: 'ipAddress', key: 'ipAddress', width: 120 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => <Tag color={statusColors[s]}>{statusIcons[s]} {s}</Tag> },
    { title: '启用状态', dataIndex: 'enabled', key: 'enabled', width: 80 },
  ];

  return (
    <Card className="device-table-card" title={`设备列表（已启用设备: ${enabledDevices.length} 台）`}>
      <div className="filter-bar">
        <Input placeholder="搜索设备编号/名称" prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 250 }} />
        <Select placeholder="状态" value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }} options={['', '在线', '离线', '异常'].map(v => ({ value: v, label: v || '全部' }))} />
        <Select placeholder="区域" value={regionFilter} onChange={setRegionFilter} style={{ width: 120 }} options={[{ value: '', label: '全部' }, ...regions.map(r => ({ value: r, label: r }))]} />
        <Select placeholder="厂商" value={manufacturerFilter} onChange={setManufacturerFilter} style={{ width: 120 }} options={[{ value: '', label: '全部' }, ...manufacturers.map(m => ({ value: m, label: m }))]} />
        <Button onClick={() => { setSearchText(''); setStatusFilter(''); setRegionFilter(''); setManufacturerFilter(''); }} style={{ marginLeft: 'auto' }}>重置</Button>
      </div>
      <Table columns={columns} dataSource={filteredDevices.map(d => ({ ...d, key: d.id }))} pagination={{ pageSize: 10 }} scroll={{ x: 1200 }} />
    </Card>
  );
};
