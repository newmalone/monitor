import { Device, ReportData, ReportOverallStats, ReportTypeStats, ReportJunctionLevelStats, DeviceChangeItem } from '../types';

const filterEnabledDevices = (devices: Device[]): Device[] => {
  return devices.filter(d => d.enabled === '启用');
};

const getReportOverallStats = (devices: Device[], date: string): ReportOverallStats => {
  const enabled = filterEnabledDevices(devices);
  const total = enabled.length;
  const online = enabled.filter(d => d.status === '在线').length;
  const offline = enabled.filter(d => d.status === '离线').length;
  const abnormal = enabled.filter(d => d.status === '异常').length;
  const onlineRate = total > 0 ? Math.round((online / total) * 10000) / 100 : 0;

  return {
    date,
    total,
    online,
    offline,
    abnormal,
    onlineRate,
  };
};

const getReportTypeStats = (devices: Device[], date: string): ReportTypeStats[] => {
  const enabled = filterEnabledDevices(devices);
  const typeMap = new Map<string, { online: number; offline: number; abnormal: number; total: number }>();

  enabled.forEach(device => {
    const typeName = device.deviceTypeName || '未知类型';
    const current = typeMap.get(typeName) || { online: 0, offline: 0, abnormal: 0, total: 0 };

    if (device.status === '在线') current.online++;
    else if (device.status === '离线') current.offline++;
    else if (device.status === '异常') current.abnormal++;
    current.total++;

    typeMap.set(typeName, current);
  });

  const result: ReportTypeStats[] = [];
  typeMap.forEach((stats, typeName) => {
    result.push({
      typeName,
      date,
      online: stats.online,
      offline: stats.offline,
      abnormal: stats.abnormal,
      total: stats.total,
    });
  });

  return result.sort((a, b) => b.total - a.total);
};

const getReportJunctionLevelStats = (devices: Device[], date: string): ReportJunctionLevelStats[] => {
  const enabled = filterEnabledDevices(devices);
  const levelMap = new Map<string, { online: number; offlineAbnormal: number; total: number }>();

  enabled.forEach(device => {
    const level = device.junctionLevel || '未知';
    const current = levelMap.get(level) || { online: 0, offlineAbnormal: 0, total: 0 };

    if (device.status === '在线') current.online++;
    else current.offlineAbnormal++;
    current.total++;

    levelMap.set(level, current);
  });

  const result: ReportJunctionLevelStats[] = [];
  const levelOrder = ['R1', 'R2', 'R3', '未知'];
  levelOrder.forEach(level => {
    if (levelMap.has(level)) {
      const stats = levelMap.get(level)!;
      result.push({
        level,
        date,
        online: stats.online,
        offlineAbnormal: stats.offlineAbnormal,
        total: stats.total,
      });
    }
  });

  return result;
};

const getDeviceMap = (devices: Device[]): Map<string, Device> => {
  const map = new Map<string, Device>();
  filterEnabledDevices(devices).forEach(device => {
    if (device.ipAddress) {
      map.set(device.ipAddress, device);
    }
  });
  return map;
};

export const generateReportData = (devicesA: Device[], dateA: string, devicesB: Device[], dateB: string): ReportData => {
  const overallA = getReportOverallStats(devicesA, dateA);
  const overallB = getReportOverallStats(devicesB, dateB);

  const typeStatsA = getReportTypeStats(devicesA, dateA);
  const typeStatsB = getReportTypeStats(devicesB, dateB);
  
  const allTypeNames = new Set<string>();
  typeStatsA.forEach(t => allTypeNames.add(t.typeName));
  typeStatsB.forEach(t => allTypeNames.add(t.typeName));

  const mergedTypeStats: ReportTypeStats[] = [];
  allTypeNames.forEach(typeName => {
    const statA = typeStatsA.find(t => t.typeName === typeName);
    const statB = typeStatsB.find(t => t.typeName === typeName);
    if (statA) mergedTypeStats.push(statA);
    if (statB) mergedTypeStats.push(statB);
  });

  const junctionLevelStatsA = getReportJunctionLevelStats(devicesA, dateA);
  const junctionLevelStatsB = getReportJunctionLevelStats(devicesB, dateB);

  const mergedJunctionLevelStats: ReportJunctionLevelStats[] = [
    ...junctionLevelStatsA,
    ...junctionLevelStatsB,
  ];

  const mapA = getDeviceMap(devicesA);
  const mapB = getDeviceMap(devicesB);

  const recovered: DeviceChangeItem[] = [];
  const newOfflineAbnormal: DeviceChangeItem[] = [];
  const persistentOfflineAbnormal: DeviceChangeItem[] = [];

  const allIps = new Set<string>();
  mapA.forEach((_, ip) => allIps.add(ip));
  mapB.forEach((_, ip) => allIps.add(ip));

  allIps.forEach(ip => {
    const deviceA = mapA.get(ip);
    const deviceB = mapB.get(ip);

    if (deviceA && deviceB) {
      const statusA = deviceA.status;
      const statusB = deviceB.status;

      if ((statusA === '离线' || statusA === '异常') && statusB === '在线') {
        recovered.push({
          ipAddress: ip,
          location: deviceB.location || '未知位置',
          deviceTypeName: deviceB.deviceTypeName || '未知类型',
          statusA,
          statusB,
        });
      }

      if (statusA === '在线' && (statusB === '离线' || statusB === '异常')) {
        newOfflineAbnormal.push({
          ipAddress: ip,
          location: deviceB.location || '未知位置',
          deviceTypeName: deviceB.deviceTypeName || '未知类型',
          statusA,
          statusB,
        });
      }

      if ((statusA === '离线' || statusA === '异常') && (statusB === '离线' || statusB === '异常')) {
        persistentOfflineAbnormal.push({
          ipAddress: ip,
          location: deviceB.location || '未知位置',
          deviceTypeName: deviceB.deviceTypeName || '未知类型',
          statusA,
          statusB,
        });
      }
    }
  });

  return {
    dateA,
    dateB,
    overall: {
      a: overallA,
      b: overallB,
    },
    typeStats: mergedTypeStats,
    junctionLevelStats: mergedJunctionLevelStats,
    recovered,
    newOfflineAbnormal,
    persistentOfflineAbnormal,
  };
};
