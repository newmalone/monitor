import { getSnapshotDevices, getAllSnapshots } from '../../db.js';

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calcSnapshotStats(date) {
  const devices = getSnapshotDevices(date);
  const totalCount = devices.length;
  const onlineCount = devices.filter(d => d.status === '在线').length;
  const offlineCount = devices.filter(d => d.status === '离线').length;
  const abnormalCount = devices.filter(d => d.status === '异常').length;
  const onlineRate = totalCount > 0 ? parseFloat(((onlineCount / totalCount) * 100).toFixed(2)) : 0;
  return { date, totalCount, onlineCount, offlineCount, abnormalCount, onlineRate };
}

function getAvailableSnapshotDates() {
  return getAllSnapshots().map(s => s.date);
}

export class Comparison {
  async compare(params = {}, context = {}) {
    let { date1, date2, metric = 'onlineRate' } = params;

    const dates = getAvailableSnapshotDates();
    if (dates.length === 0) {
      return { message: '暂无设备数据，请先导入设备快照。', comparison: null, trend: null };
    }

    if (!date1 || !date2) {
      if (dates.length >= 2) {
        date1 = date1 || dates[0];
        date2 = date2 || dates[1];
      } else if (dates.length === 1) {
        date1 = date1 || dates[0];
        date2 = date1;
      } else {
        return { message: '暂无设备数据，请先导入设备快照。', comparison: null, trend: null };
      }
    }

    const stats1 = calcSnapshotStats(date1);
    const stats2 = calcSnapshotStats(date2);

    const diff = {
      totalCount: stats2.totalCount - stats1.totalCount,
      onlineCount: stats2.onlineCount - stats1.onlineCount,
      offlineCount: stats2.offlineCount - stats1.offlineCount,
      onlineRate: parseFloat((stats2.onlineRate - stats1.onlineRate).toFixed(2)),
    };

    const onlineRateChange = diff.onlineRate > 0 ? '上升' : diff.onlineRate < 0 ? '下降' : '持平';
    const message = `${date1} vs ${date2} 对比：\n在线率从 ${stats1.onlineRate}% ${onlineRateChange} ${Math.abs(diff.onlineRate)}% 到 ${stats2.onlineRate}%。\n在线设备从 ${stats1.onlineCount} 台变为 ${stats2.onlineCount} 台，差值 ${diff.onlineCount > 0 ? '+' : ''}${diff.onlineCount} 台。\n总设备数从 ${stats1.totalCount} 台变为 ${stats2.totalCount} 台，差值 ${diff.totalCount > 0 ? '+' : ''}${diff.totalCount} 台。`;

    let trend = '持平';
    if (diff.onlineRate > 0.5) trend = '上升';
    else if (diff.onlineRate < -0.5) trend = '下降';

    return {
      message,
      comparison: { date1Stats: stats1, date2Stats: stats2, diff },
      trend,
    };
  }

  async trend(params = {}, context = {}) {
    let { startDate, endDate, interval = 'daily' } = params;

    const dates = getAvailableSnapshotDates().sort();
    if (dates.length === 0) {
      return { message: '暂无设备数据，请先导入设备快照。', trend: [], summary: null };
    }

    if (!startDate) startDate = dates[0];
    if (!endDate) endDate = dates[dates.length - 1];

    const filteredDates = dates.filter(d => d >= startDate && d <= endDate);
    if (filteredDates.length === 0) {
      return { message: `${startDate} 至 ${endDate} 范围内无数据。`, trend: [], summary: null };
    }

    const trend = filteredDates.map(date => {
      const stats = calcSnapshotStats(date);
      return { date, onlineRate: stats.onlineRate, totalCount: stats.totalCount, onlineCount: stats.onlineCount };
    });

    const rates = trend.map(t => t.onlineRate);
    const avgRate = rates.length > 0 ? parseFloat((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2)) : 0;
    const maxRate = Math.max(...rates);
    const minRate = Math.min(...rates);
    const maxDate = trend.find(t => t.onlineRate === maxRate)?.date;
    const minDate = trend.find(t => t.onlineRate === minRate)?.date;

    const message = `${startDate} 至 ${endDate} 趋势分析：共 ${trend.length} 个数据点，平均在线率 ${avgRate}%，最高 ${maxRate}%（${maxDate}），最低 ${minRate}%（${minDate}）。`;

    const summary = { dataPoints: trend.length, avgOnlineRate: avgRate, maxOnlineRate: maxRate, minOnlineRate: minRate, maxDate, minDate };

    return { message, trend, summary };
  }
}
