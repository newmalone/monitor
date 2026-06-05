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

function calcSnapshotStats(date) {
  const devices = getSnapshotDevices(date);
  const totalCount = devices.length;
  const onlineCount = devices.filter(d => d.status === '在线').length;
  const offlineCount = devices.filter(d => d.status === '离线').length;
  const abnormalCount = devices.filter(d => d.status === '异常').length;
  const enabledCount = devices.filter(d => d.enabled === '启用').length;
  const onlineRate = totalCount > 0 ? parseFloat(((onlineCount / totalCount) * 100).toFixed(2)) : 0;
  return { totalCount, onlineCount, offlineCount, abnormalCount, enabledCount, onlineRate };
}

function calcBreakdowns(date) {
  const devices = getSnapshotDevices(date);
  if (!devices || devices.length === 0) return { byManufacturer: [], byDeviceType: [], byRegion: [] };

  const byField = (field) => {
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
  };

  return {
    byManufacturer: byField('manufacturerName'),
    byDeviceType: byField('deviceTypeName'),
    byRegion: byField('region'),
  };
}

export class ReportGen {
  async generate(params = {}, context = {}) {
    let { date, type = 'daily' } = params;

    if (!date) {
      date = getLatestSnapshotDate();
      if (!date) {
        return { message: '暂无设备数据，无法生成报告。', report: null, exportable: false };
      }
    }

    let reportData = null;

    switch (type) {
      case 'daily':
        reportData = this._generateDaily(date);
        break;

      case 'weekly':
        reportData = await this._generateWeekly(date);
        break;

      case 'comparison':
        reportData = await this._generateComparison(date);
        break;

      default:
        reportData = this._generateDaily(date);
        type = 'daily';
    }

    if (!reportData) {
      return { message: '生成报告失败，数据不足。', report: null, exportable: false };
    }

    const titleMap = { daily: '设备监控日报', weekly: '设备监控周报', comparison: '设备数据对比报告' };
    const message = `已为您生成${titleMap[type] || '报告'}（${date}），包含统计数据和分类分析。`;

    return {
      message,
      report: { title: titleMap[type] || '设备监控报告', date, summary: reportData.summary, stats: reportData.stats, breakdowns: reportData.breakdowns },
      exportable: true,
    };
  }

  _generateDaily(date) {
    const devices = getSnapshotDevices(date);
    if (devices.length === 0) return null;

    const stats = calcSnapshotStats(date);
    const breakdowns = calcBreakdowns(date);
    const summary = `${date} 设备总数 ${stats.totalCount} 台，在线 ${stats.onlineCount} 台，在线率 ${stats.onlineRate}%。`;

    return { summary, stats, breakdowns };
  }

  async _generateWeekly(date) {
    // Find the week that contains the date
    const allDates = getAllSnapshots().map(s => s.date).sort();
    if (allDates.length === 0) return null;

    const targetDate = date || allDates[allDates.length - 1];
    const targetObj = new Date(targetDate);
    const weekStart = new Date(targetObj);
    weekStart.setDate(targetObj.getDate() - targetObj.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const startDate = formatDate(weekStart);
    const endDate = formatDate(weekEnd);

    const weekDates = allDates.filter(d => d >= startDate && d <= endDate);
    if (weekDates.length === 0) return this._generateDaily(targetDate);

    let totalDevices = 0;
    let totalOnline = 0;
    let totalEnabled = 0;

    for (const d of weekDates) {
      const devices = getSnapshotDevices(d);
      totalDevices += devices.length;
      totalOnline += devices.filter(dev => dev.status === '在线').length;
      totalEnabled += devices.filter(dev => dev.enabled === '启用').length;
    }

    const avgTotal = weekDates.length > 0 ? Math.round(totalDevices / weekDates.length) : 0;
    const avgOnline = weekDates.length > 0 ? Math.round(totalOnline / weekDates.length) : 0;
    const avgEnabled = weekDates.length > 0 ? Math.round(totalEnabled / weekDates.length) : 0;
    const onlineRate = avgTotal > 0 ? parseFloat(((avgOnline / avgTotal) * 100).toFixed(2)) : 0;

    const stats = { totalCount: avgTotal, onlineCount: avgOnline, enabledCount: avgEnabled, onlineRate };
    const breakdowns = calcBreakdowns(weekDates[weekDates.length - 1]);
    const summary = `${startDate} 至 ${endDate} 周报：平均设备 ${avgTotal} 台，平均在线 ${avgOnline} 台，平均在线率 ${onlineRate}%，共 ${weekDates.length} 个数据日。`;

    return { summary, stats, breakdowns };
  }

  async _generateComparison(date) {
    const allDates = getAllSnapshots().map(s => s.date).sort((a, b) => b.localeCompare(a));
    if (allDates.length < 2) return this._generateDaily(date);

    const date1 = date || allDates[0];
    let date2 = null;
    for (const d of allDates) {
      if (d !== date1) { date2 = d; break; }
    }
    if (!date2) return this._generateDaily(date1);

    const stats1 = calcSnapshotStats(date1);
    const stats2 = calcSnapshotStats(date2);
    const diff = {
      totalCount: stats2.totalCount - stats1.totalCount,
      onlineCount: stats2.onlineCount - stats1.onlineCount,
      onlineRate: parseFloat((stats2.onlineRate - stats1.onlineRate).toFixed(2)),
    };

    const summary = `${date1} vs ${date2} 对比：在线率 ${stats1.onlineRate}% → ${stats2.onlineRate}%，差值 ${diff.onlineRate > 0 ? '+' : ''}${diff.onlineRate}%。`;

    return {
      summary,
      stats: { date1: stats1, date2: stats2, diff },
      breakdowns: { date1: calcBreakdowns(date1), date2: calcBreakdowns(date2) },
    };
  }
}
