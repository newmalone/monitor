import { getSnapshotDevices, getAllSnapshots } from '../../db.js';

function calcSnapshotStats(date) {
  const devices = getSnapshotDevices(date);
  const totalCount = devices.length;
  const onlineCount = devices.filter(d => d.status === '在线').length;
  const onlineRate = totalCount > 0 ? parseFloat(((onlineCount / totalCount) * 100).toFixed(2)) : 0;
  return { date, totalCount, onlineCount, onlineRate };
}

export class TrendAnalysis {
  async analyze(params = {}, context = {}) {
    let { dateRange, metric = 'onlineRate', groupBy = 'daily' } = params;

    const allDates = getAllSnapshots().map(s => s.date).sort();
    if (allDates.length === 0) {
      return { message: '暂无设备数据，无法分析趋势。', trend: [], insights: [] };
    }

    let startDate = allDates[0];
    let endDate = allDates[allDates.length - 1];

    if (dateRange) {
      if (typeof dateRange === 'string') {
        if (dateRange.includes('至') || dateRange.includes('-')) {
          const parts = dateRange.split(/[至-]/).map(p => p.trim());
          if (parts[0]) startDate = parts[0];
          if (parts[1]) endDate = parts[1];
        } else {
          startDate = dateRange;
          endDate = dateRange;
        }
      }
    }

    const filteredDates = allDates.filter(d => d >= startDate && d <= endDate);
    if (filteredDates.length === 0) {
      return { message: `${startDate} 至 ${endDate} 范围内无数据。`, trend: [], insights: [] };
    }

    const trend = filteredDates.map(date => {
      const stats = calcSnapshotStats(date);
      return { date, onlineRate: stats.onlineRate, totalCount: stats.totalCount, onlineCount: stats.onlineCount };
    });

    const insights = this._generateInsights(trend, metric);
    const message = `趋势分析完成：${startDate} 至 ${endDate}，共 ${trend.length} 个数据点，发现 ${insights.length} 条关键信息。`;

    return { message, trend, insights };
  }

  _generateInsights(trend, metric) {
    const insights = [];
    if (trend.length === 0) return insights;

    const rates = trend.map(t => t.onlineRate);
    const avgRate = parseFloat((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2));
    const maxRate = Math.max(...rates);
    const minRate = Math.min(...rates);
    const maxIdx = rates.indexOf(maxRate);
    const minIdx = rates.indexOf(minRate);

    insights.push(`平均在线率 ${avgRate}%。`);

    if (maxRate !== minRate) {
      insights.push(`最高在线率 ${maxRate}%（${trend[maxIdx].date}），最低 ${minRate}%（${trend[minIdx].date}）。`);
    }

    if (trend.length >= 2) {
      const first = rates[0];
      const last = rates[rates.length - 1];
      const change = parseFloat((last - first).toFixed(2));
      if (change > 1) {
        insights.push(`整体趋势上升，在线率提升 ${change}%。`);
      } else if (change < -1) {
        insights.push(`整体趋势下降，在线率降低 ${Math.abs(change)}%。`);
      } else {
        insights.push(`整体趋势平稳，波动在 ±1% 以内。`);
      }
    }

    const volatility = this._calcVolatility(rates);
    if (volatility > 5) {
      insights.push(`数据波动较大（标准差 ${volatility.toFixed(2)}%），建议关注设备稳定性。`);
    } else if (volatility > 2) {
      insights.push(`数据存在轻微波动（标准差 ${volatility.toFixed(2)}%）。`);
    }

    const lowRateDays = trend.filter(t => t.onlineRate < 90);
    if (lowRateDays.length > 0) {
      insights.push(`${lowRateDays.length} 天在线率低于 90%：${lowRateDays.map(t => t.date).join('、')}。`);
    }

    return insights;
  }

  _calcVolatility(values) {
    if (values.length < 2) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }
}
