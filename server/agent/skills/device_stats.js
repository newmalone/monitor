import { getSnapshotDevices, getAllSnapshots } from '../../db.js';

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getLatestSnapshotDate() {
  const snapshots = getAllSnapshots();
  return snapshots.length > 0 ? snapshots[0].date : null;
}

export class DeviceStats {
  async queryStats(params = {}, context = {}) {
    let { date, status, manufacturer, deviceType, region, metric } = params;

    if (!date) {
      date = getLatestSnapshotDate();
      if (!date) {
        return { message: '暂无设备数据，请先导入设备快照。', stats: null };
      }
    }

    const devices = getSnapshotDevices(date);
    if (devices.length === 0) {
      return { message: `${date} 暂无设备数据。`, stats: null };
    }

    let filtered = this._filterDevices(devices, { status, manufacturer, deviceType, region });
    const totalCount = filtered.length;
    const onlineCount = filtered.filter(d => d.status === '在线').length;
    const offlineCount = filtered.filter(d => d.status === '离线').length;
    const abnormalCount = filtered.filter(d => d.status === '异常').length;
    const enabledCount = filtered.filter(d => d.enabled === '启用').length;
    const onlineRate = totalCount > 0 ? ((onlineCount / totalCount) * 100).toFixed(2) : '0.00';

    let filterDesc = '';
    if (manufacturer || deviceType || region) {
      const parts = [];
      if (manufacturer) parts.push(`厂商: ${manufacturer}`);
      if (deviceType) parts.push(`类型: ${deviceType}`);
      if (region) parts.push(`区域: ${region}`);
      filterDesc = `（筛选条件: ${parts.join('、')}）`;
    }

    let message = `${date} 设备统计${filterDesc}：`;
    message += `总数 ${totalCount} 台，在线 ${onlineCount} 台，离线 ${offlineCount} 台，异常 ${abnormalCount} 台，启用 ${enabledCount} 台，在线率 ${onlineRate}%。`;

    let breakdown = null;
    if (manufacturer || deviceType || region) {
      breakdown = {};
      if (manufacturer) {
        const byMfr = this._calcOnlineRate(filtered.filter(d => d.manufacturerName === manufacturer));
        breakdown.byManufacturer = { name: manufacturer, ...byMfr };
      }
      if (deviceType) {
        const byType = this._calcOnlineRate(filtered.filter(d => d.deviceTypeName === deviceType));
        breakdown.byDeviceType = { name: deviceType, ...byType };
      }
      if (region) {
        const byRegion = this._calcOnlineRate(filtered.filter(d => d.region === region));
        breakdown.byRegion = { name: region, ...byRegion };
      }
    }

    // Always include full breakdowns for display
    const breakdowns = {
      byManufacturer: this._groupBy(filtered, 'manufacturerName'),
      byDeviceType: this._groupBy(filtered, 'deviceTypeName'),
      byRegion: this._groupBy(filtered, 'region'),
    };

    return {
      message,
      stats: { totalCount, onlineCount, offlineCount, abnormalCount, enabledCount, onlineRate: parseFloat(onlineRate) },
      breakdown,
      breakdowns,
    };
  }

  async queryDevices(params = {}, context = {}) {
    let { date, status, manufacturer, deviceType, region, page } = params;
    const limit = 50;

    if (!date) {
      date = getLatestSnapshotDate();
      if (!date) {
        return { message: '暂无设备数据，请先导入设备快照。', devices: [], total: 0, hasMore: false };
      }
    }

    const devices = getSnapshotDevices(date);
    if (devices.length === 0) {
      return { message: `${date} 暂无设备数据。`, devices: [], total: 0, hasMore: false };
    }

    const filtered = this._filterDevices(devices, { status, manufacturer, deviceType, region });
    const total = filtered.length;
    const pageOffset = (parseInt(page) || 0) * limit;
    const slice = filtered.slice(pageOffset, pageOffset + limit);
    const hasMore = pageOffset + limit < total;

    const resultDevices = slice.map(d => ({
      id: d.id,
      deviceCode: d.deviceCode,
      productName: d.productName,
      manufacturerName: d.manufacturerName,
      deviceTypeName: d.deviceTypeName,
      status: d.status,
      enabled: d.enabled,
      region: d.region,
      location: d.location,
    }));

    let message = `${date} 共找到 ${total} 台设备`;
    if (hasMore) {
      message += `（仅展示前 ${limit} 条，共 ${total} 条）`;
    }
    message += `。`;

    return { message, devices: resultDevices, total, hasMore };
  }

  async getBreakdown(params = {}, context = {}) {
    let { date } = params;

    if (!date) {
      date = getLatestSnapshotDate();
      if (!date) {
        return { message: '暂无设备数据，请先导入设备快照。', breakdowns: {} };
      }
    }

    const devices = getSnapshotDevices(date);
    if (devices.length === 0) {
      return { message: `${date} 暂无设备数据。`, breakdowns: {} };
    }

    const byManufacturer = this._groupBy(devices, 'manufacturerName');
    const byDeviceType = this._groupBy(devices, 'deviceTypeName');
    const byRegion = this._groupBy(devices, 'region');

    const message = `${date} 设备分类统计：按厂商 ${byManufacturer.length} 类，按类型 ${byDeviceType.length} 类，按区域 ${byRegion.length} 类。`;

    return {
      message,
      breakdowns: { byManufacturer, byDeviceType, byRegion },
    };
  }

  _filterDevices(devices, { status, manufacturer, deviceType, region }) {
    return devices.filter(d => {
      if (status && d.status !== status) return false;
      if (manufacturer && d.manufacturerName !== manufacturer) return false;
      if (deviceType && d.deviceTypeName !== deviceType) return false;
      if (region && d.region !== region) return false;
      return true;
    });
  }

  _calcOnlineRate(devices) {
    const total = devices.length;
    const online = devices.filter(d => d.status === '在线').length;
    return { onlineCount: online, totalCount: total, onlineRate: total > 0 ? parseFloat(((online / total) * 100).toFixed(2)) : 0 };
  }

  _groupBy(devices, field) {
    const groups = {};
    for (const d of devices) {
      const key = d[field] || '未知';
      if (!groups[key]) groups[key] = { total: 0, online: 0 };
      groups[key].total++;
      if (d.status === '在线') groups[key].online++;
    }
    return Object.entries(groups)
      .map(([name, { total, online }]) => ({
        name,
        totalCount: total,
        onlineCount: online,
        onlineRate: total > 0 ? parseFloat(((online / total) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.totalCount - a.totalCount);
  }
}
