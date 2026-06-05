import { getSnapshotDevices, getAllSnapshots } from '../../db.js';

function getLatestSnapshotDate() {
  const snapshots = getAllSnapshots();
  return snapshots.length > 0 ? snapshots[0].date : null;
}

export class FaultDiagnosis {
  async diagnose(params = {}, context = {}) {
    const { deviceCode, status, dateRange } = params;

    if (!deviceCode) {
      return { message: '请提供设备编号以进行故障诊断。', diagnosis: null };
    }

    const allDates = getAllSnapshots().map(s => s.date).sort();
    if (allDates.length === 0) {
      return { message: '暂无设备数据，无法进行故障诊断。', diagnosis: null };
    }

    let dates = allDates;
    if (dateRange) {
      if (typeof dateRange === 'string' && (dateRange.includes('至') || dateRange.includes('-'))) {
        const parts = dateRange.split(/[至-]/).map(p => p.trim());
        if (parts[0]) dates = dates.filter(d => d >= parts[0]);
        if (parts[1]) dates = dates.filter(d => d <= parts[1]);
      } else if (typeof dateRange === 'string') {
        dates = dates.filter(d => d >= dateRange);
      }
    }

    const statusHistory = [];
    for (const date of dates) {
      const devices = getSnapshotDevices(date);
      const device = devices.find(d => d.deviceCode === deviceCode);
      if (device) {
        statusHistory.push({ date, status: device.status, enabled: device.enabled, region: device.region, location: device.location });
      }
    }

    if (statusHistory.length === 0) {
      return { message: `未找到设备 ${deviceCode} 的记录。`, diagnosis: null };
    }

    const latestStatus = statusHistory[statusHistory.length - 1];
    const deviceInfo = {
      deviceCode,
      latestStatus: latestStatus.status,
      enabled: latestStatus.enabled,
      region: latestStatus.region,
      location: latestStatus.location,
    };

    const { suspectedCause, suggestions } = this._analyzeFaults(statusHistory, deviceInfo);

    let statusSummary = '';
    for (const sh of statusHistory) {
      statusSummary += `${sh.date}: ${sh.status}\n`;
    }

    const message = `设备 ${deviceCode} 诊断结果：当前状态 ${latestStatus.status}。\n\n状态历史：\n${statusSummary}\n疑似原因：${suspectedCause}\n建议：${suggestions.join('；')}`;

    return {
      message,
      diagnosis: { deviceInfo, statusHistory, suspectedCause, suggestions },
    };
  }

  async listAbnormalDevices(params = {}, context = {}) {
    let { date, statusFilter = 'offline' } = params;

    if (!date) {
      date = getLatestSnapshotDate();
      if (!date) {
        return { message: '暂无设备数据。', devices: [], stats: null };
      }
    }

    const devices = getSnapshotDevices(date);
    if (devices.length === 0) {
      return { message: `${date} 暂无设备数据。`, devices: [], stats: null };
    }

    const targetStatuses = statusFilter === 'offline' ? ['离线'] : statusFilter === 'abnormal' ? ['异常'] : ['离线', '异常'];
    const abnormalDevices = devices.filter(d => targetStatuses.includes(d.status));

    const resultDevices = abnormalDevices.slice(0, 50).map(d => ({
      deviceCode: d.deviceCode,
      productName: d.productName,
      manufacturerName: d.manufacturerName,
      deviceTypeName: d.deviceTypeName,
      status: d.status,
      region: d.region,
      location: d.location,
    }));

    const offlineCount = devices.filter(d => d.status === '离线').length;
    const abnormalCount = devices.filter(d => d.status === '异常').length;
    const stats = { total: devices.length, offlineCount, abnormalCount, abnormalRate: devices.length > 0 ? parseFloat(((offlineCount + abnormalCount) / devices.length * 100).toFixed(2)) : 0 };

    let filterLabel = statusFilter === 'offline' ? '离线' : statusFilter === 'abnormal' ? '异常' : '离线/异常';
    const message = `${date} ${filterLabel}设备共 ${abnormalDevices.length} 台（总 ${devices.length} 台，异常率 ${stats.abnormalRate}%），${abnormalDevices.length > 50 ? '展示前 50 台。' : ''}`;

    return { message, devices: resultDevices, stats };
  }

  _analyzeFaults(statusHistory, deviceInfo) {
    const suggestions = [];
    let suspectedCause = '未知';

    if (statusHistory.length < 2) {
      suspectedCause = '数据点不足，无法判断故障趋势';
      suggestions.push('持续观察设备状态变化');
      return { suspectedCause, suggestions };
    }

    const statuses = statusHistory.map(s => s.status);
    const lastStatus = statuses[statuses.length - 1];
    const prevStatus = statuses[statuses.length - 2];

    if (lastStatus === '在线') {
      suspectedCause = '设备当前正常运行';
      suggestions.push('设备状态正常，继续保持监控');
      return { suspectedCause, suggestions };
    }

    // Detect transition to offline/abnormal
    let offlineDate = null;
    for (let i = 1; i < statusHistory.length; i++) {
      if (statuses[i] !== '在线' && statuses[i - 1] === '在线') {
        offlineDate = statusHistory[i].date;
        break;
      }
    }

    if (offlineDate) {
      suspectedCause = `设备从 ${offlineDate} 开始从在线转为${lastStatus}`;

      // Check if it was sudden or gradual
      const offlineStreak = statuses.slice().reverse().filter(s => s !== '在线').length;
      if (offlineStreak >= 3) {
        suspectedCause += `，已连续 ${offlineStreak} 天${lastStatus}`;
        suggestions.push('设备长期异常，建议现场排查');
        suggestions.push('检查网络连接和供电状态');
      } else {
        suggestions.push('近期才出现故障，可先远程排查');
        suggestions.push('检查设备是否重启过');
      }
    } else {
      // All offline or abnormal
      const allSame = statuses.every(s => s === lastStatus);
      if (allSame) {
        suspectedCause = `设备在所有数据日中均为${lastStatus}状态`;
        suggestions.push('设备可能未启用或已废弃');
        suggestions.push('确认设备是否已下线');
      } else {
        suspectedCause = '设备状态不稳定，频繁切换';
        suggestions.push('检查网络连接是否稳定');
        suggestions.push('建议排查设备硬件问题');
      }
    }

    // Check if other devices in same region are affected
    if (deviceInfo.region) {
      suggestions.push(`关注 ${deviceInfo.region} 其他设备是否也出现类似问题`);
    }

    return { suspectedCause, suggestions };
  }
}
