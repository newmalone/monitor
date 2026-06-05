import { Device, Statistics, ManufacturerStats, RegionStats, DeviceTypeStats } from '../types';

export function getStatistics(devices: Device[]): Statistics {
  const enabledDevices = devices.filter(d => d.enabled === '启用');
  const total = enabledDevices.length;
  const online = enabledDevices.filter(d => d.status === '在线').length;
  const offline = enabledDevices.filter(d => d.status === '离线').length;
  const abnormal = enabledDevices.filter(d => d.status === '异常').length;

  return {
    total,
    online,
    offline,
    abnormal,
    onlineRate: total > 0 ? Math.round((online / total) * 100) : 0,
    offlineRate: total > 0 ? Math.round((offline / total) * 100) : 0,
    abnormalRate: total > 0 ? Math.round((abnormal / total) * 100) : 0
  };
}

export function getManufacturerStats(devices: Device[]): ManufacturerStats[] {
  const enabledDevices = devices.filter(d => d.enabled === '启用');
  const map = new Map<string, { total: number; online: number; offline: number; abnormal: number }>();

  enabledDevices.forEach(d => {
    const key = d.manufacturerName || '未知';
    if (!map.has(key)) {
      map.set(key, { total: 0, online: 0, offline: 0, abnormal: 0 });
    }
    const stats = map.get(key)!;
    stats.total++;
    if (d.status === '在线') stats.online++;
    else if (d.status === '离线') stats.offline++;
    else if (d.status === '异常') stats.abnormal++;
  });

  return Array.from(map.entries()).map(([name, stats]) => ({
    name,
    ...stats,
    onlineRate: stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0
  })).sort((a, b) => b.total - a.total);
}

export function getRegionStats(devices: Device[]): RegionStats[] {
  const enabledDevices = devices.filter(d => d.enabled === '启用');
  const map = new Map<string, { total: number; online: number; offline: number; abnormal: number }>();

  enabledDevices.forEach(d => {
    const key = d.region || '未知';
    if (!map.has(key)) {
      map.set(key, { total: 0, online: 0, offline: 0, abnormal: 0 });
    }
    const stats = map.get(key)!;
    stats.total++;
    if (d.status === '在线') stats.online++;
    else if (d.status === '离线') stats.offline++;
    else if (d.status === '异常') stats.abnormal++;
  });

  return Array.from(map.entries()).map(([name, stats]) => ({
    name,
    ...stats
  })).sort((a, b) => b.total - a.total);
}

export function getDeviceTypeStats(devices: Device[]): DeviceTypeStats[] {
  const enabledDevices = devices.filter(d => d.enabled === '启用');
  const map = new Map<string, { total: number; online: number; offline: number; abnormal: number }>();

  enabledDevices.forEach(d => {
    const key = d.deviceTypeName || '未知';
    if (!map.has(key)) {
      map.set(key, { total: 0, online: 0, offline: 0, abnormal: 0 });
    }
    const stats = map.get(key)!;
    stats.total++;
    if (d.status === '在线') stats.online++;
    else if (d.status === '离线') stats.offline++;
    else if (d.status === '异常') stats.abnormal++;
  });

  return Array.from(map.entries()).map(([name, stats]) => ({
    name,
    ...stats
  })).sort((a, b) => b.total - a.total);
}
