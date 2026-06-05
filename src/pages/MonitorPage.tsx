import { useEffect, useMemo, useState } from 'react';
import { Col, Row, Tag } from 'antd';
import { ChartPanel } from '../components/ChartPanel';
import { DeviceMap } from '../components/DeviceMap';
import { DeviceTable } from '../components/DeviceTable';
import { FileUploader } from '../components/FileUploader';
import { StatsCard } from '../components/StatsCard';
import { DailyReportDeviceStat, Device, SignalStat } from '../types';
import { getLatestSnapshot, getSnapshotDevices } from '../services/api';
import { getDeviceTypeStats, getManufacturerStats, getRegionStats, getStatistics } from '../services/stats';

export const MonitorPage = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [lastUpdate, setLastUpdate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActiveData();
  }, []);

  const loadActiveData = async () => {
    setLoading(true);
    try {
      const activeDate = sessionStorage.getItem('activeSnapshotDate');
      let devices: Device[] = [];
      let date = '';

      if (activeDate) {
        devices = await getSnapshotDevices(activeDate);
        date = activeDate;
      }

      if (devices.length === 0) {
        const snapshot = await getLatestSnapshot();
        if (snapshot) {
          devices = snapshot.devices;
          date = snapshot.date;
        }
      }

      if (devices.length > 0) {
        setDevices(devices);
        setLastUpdate(date);
      } else {
        setDevices([]);
        setLastUpdate('');
      }
    } catch (e) {
      console.error('加载数据失败', e);
    }
    setLoading(false);
  };

  const handleDataLoaded = async (newDevices: Device[], snapshotDate: string) => {
    setDevices(newDevices);
    setLastUpdate(snapshotDate);
    sessionStorage.setItem('activeSnapshotDate', snapshotDate);
  };

  const stats = getStatistics(devices);
  const manufacturerStats = getManufacturerStats(devices);
  const regionStats = getRegionStats(devices);
  const deviceTypeStats = getDeviceTypeStats(devices);

  const dailyReportStats: DailyReportDeviceStat[] = useMemo(() => {
    return deviceTypeStats.map((item) => ({
      name: item.name,
      online: item.online,
      onlineRate: item.total > 0 ? Math.round((item.online / item.total) * 10000) / 100 : 0,
      offline: item.offline,
      offlineRate: item.total > 0 ? Math.round((item.offline / item.total) * 10000) / 100 : 0,
      abnormal: item.abnormal,
      abnormalRate: item.total > 0 ? Math.round((item.abnormal / item.total) * 10000) / 100 : 0,
      total: item.total,
    }));
  }, [deviceTypeStats]);

  const signalStats: SignalStat[] = useMemo(() => {
    return [
      { name: '正常', count: 0, rate: 0 },
      { name: '异常', count: 0, rate: 0 },
      { name: '合计', count: 0, rate: 0 },
    ];
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 className="page-title">设备状态监控</h2>
          <p style={{ margin: '4px 0 0 0', color: '#999', fontSize: 13 }}>实时监控已启用设备的运行状态</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tag color="blue">当前数据日期：{lastUpdate || '无数据'}</Tag>
          {sessionStorage.getItem('activeSnapshotDate') && <Tag color="purple">历史调取模式</Tag>}
        </div>
      </div>

      <Row gutter={16}>
        <Col span={24}><FileUploader onDataLoaded={handleDataLoaded} /></Col>
      </Row>

      {devices.length > 0 && (
        <>
          <Row gutter={16}><Col span={24}><StatsCard statistics={stats} /></Col></Row>
          <Row gutter={16}><Col span={24}><ChartPanel manufacturerStats={manufacturerStats} regionStats={regionStats} deviceTypeStats={deviceTypeStats} dailyReportStats={dailyReportStats} signalStats={signalStats} /></Col></Row>
          <Row gutter={16}><Col span={24}><DeviceMap devices={devices} /></Col></Row>
          <Row gutter={16}><Col span={24}><DeviceTable devices={devices} /></Col></Row>
        </>
      )}

      {!loading && devices.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, color: '#999' }}>
          <p style={{ fontSize: 18 }}>暂无数据</p>
          <p>请上传设备数据文件开始监控</p>
        </div>
      )}
    </div>
  );
};
