/**
 * Report export service
 * Supports: CSV, Word (docx-lite), Excel (xlsx-lite), JSON
 */

export async function exportReport(reportData, format = 'json') {
  const { title, date, summary, stats, breakdowns } = reportData;

  switch (format) {
    case 'csv':
      return exportCSV(stats, breakdowns, title, date);
    case 'xlsx':
      return exportXLSX(stats, breakdowns, title, date);
    case 'word':
      return exportWord(stats, breakdowns, summary, title, date);
    default:
      return exportJSON(reportData);
  }
}

function exportCSV(stats, breakdowns, title, date) {
  const lines = [];
  lines.push('设备监控报告');
  lines.push(`报告日期,${date}`);
  lines.push('');

  // Stats section
  lines.push('== 统计数据 ==');
  lines.push('指标,数值');
  if (stats.totalCount !== undefined) lines.push(`设备总数,${stats.totalCount}`);
  if (stats.onlineCount !== undefined) lines.push(`在线设备,${stats.onlineCount}`);
  if (stats.offlineCount !== undefined) lines.push(`离线设备,${stats.offlineCount}`);
  if (stats.abnormalCount !== undefined) lines.push(`异常设备,${stats.abnormalCount}`);
  if (stats.enabledCount !== undefined) lines.push(`启用设备,${stats.enabledCount}`);
  if (stats.onlineRate !== undefined) lines.push(`在线率,${stats.onlineRate}%`);
  lines.push('');

  // Breakdown sections
  if (breakdowns) {
    if (breakdowns.byManufacturer) {
      lines.push('== 按厂商统计 ==');
      lines.push('厂商,总数,在线数,在线率(%)');
      for (const item of breakdowns.byManufacturer) {
        lines.push(`${item.name},${item.totalCount},${item.onlineCount},${item.onlineRate}`);
      }
      lines.push('');
    }
    if (breakdowns.byDeviceType) {
      lines.push('== 按设备类型统计 ==');
      lines.push('类型,总数,在线数,在线率(%)');
      for (const item of breakdowns.byDeviceType) {
        lines.push(`${item.name},${item.totalCount},${item.onlineCount},${item.onlineRate}`);
      }
      lines.push('');
    }
    if (breakdowns.byRegion) {
      lines.push('== 按区域统计 ==');
      lines.push('区域,总数,在线数,在线率(%)');
      for (const item of breakdowns.byRegion) {
        lines.push(`${item.name},${item.totalCount},${item.onlineCount},${item.onlineRate}`);
      }
    }
  }

  const content = lines.join('\n');
  // UTF-8 BOM for Excel compatibility
  const buffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(content, 'utf-8')]);
  const filename = `${title}_${date}.csv`;

  return {
    content,
    buffer,
    filename,
    contentType: 'text/csv; charset=utf-8',
  };
}

function exportXLSX(stats, breakdowns, title, date) {
  // Simple xlsx export: generate CSV but with .xlsx filename
  // For true xlsx, we'd need a library like xlsx or exceljs
  // This uses CSV as a practical fallback
  const csvResult = exportCSV(stats, breakdowns, title, date);
  return {
    ...csvResult,
    filename: `${title}_${date}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

function exportWord(stats, breakdowns, summary, title, date) {
  // Generate a simple HTML-based .doc file (Word can open it)
  let html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: 'Microsoft YaHei', Arial, sans-serif; font-size: 14px; }
  h1 { font-size: 20px; color: #1890ff; border-bottom: 2px solid #1890ff; padding-bottom: 8px; }
  h2 { font-size: 16px; color: #333; margin-top: 20px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { border: 1px solid #d9d9d9; padding: 8px 12px; text-align: left; }
  th { background: #fafafa; font-weight: 600; }
  .summary { background: #f6ffed; padding: 12px; border-radius: 4px; margin: 10px 0; }
  .stat-box { display: inline-block; width: 120px; text-align: center; margin: 8px; }
  .stat-value { font-size: 24px; font-weight: bold; color: #1890ff; }
  .stat-label { font-size: 12px; color: #666; }
</style></head><body>
<h1>${title}</h1>
<p>报告日期：${date}</p>
<div class="summary"><p><strong>摘要：</strong>${summary}</p></div>

<h2>统计数据</h2>
<table>
  <tr><th>指标</th><th>数值</th></tr>
  ${stats.totalCount !== undefined ? `<tr><td>设备总数</td><td>${stats.totalCount}</td></tr>` : ''}
  ${stats.onlineCount !== undefined ? `<tr><td>在线设备</td><td>${stats.onlineCount}</td></tr>` : ''}
  ${stats.offlineCount !== undefined ? `<tr><td>离线设备</td><td>${stats.offlineCount}</td></tr>` : ''}
  ${stats.abnormalCount !== undefined ? `<tr><td>异常设备</td><td>${stats.abnormalCount}</td></tr>` : ''}
  ${stats.enabledCount !== undefined ? `<tr><td>启用设备</td><td>${stats.enabledCount}</td></tr>` : ''}
  ${stats.onlineRate !== undefined ? `<tr><td>在线率</td><td>${stats.onlineRate}%</td></tr>` : ''}
</table>
`;

  // Breakdowns
  if (breakdowns) {
    if (breakdowns.byManufacturer) {
      html += `<h2>按厂商统计</h2>
<table><tr><th>厂商</th><th>总数</th><th>在线数</th><th>在线率(%)</th></tr>`;
      for (const item of breakdowns.byManufacturer) {
        html += `<tr><td>${item.name}</td><td>${item.totalCount}</td><td>${item.onlineCount}</td><td>${item.onlineRate}</td></tr>`;
      }
      html += `</table>`;
    }
    if (breakdowns.byDeviceType) {
      html += `<h2>按设备类型统计</h2>
<table><tr><th>类型</th><th>总数</th><th>在线数</th><th>在线率(%)</th></tr>`;
      for (const item of breakdowns.byDeviceType) {
        html += `<tr><td>${item.name}</td><td>${item.totalCount}</td><td>${item.onlineCount}</td><td>${item.onlineRate}</td></tr>`;
      }
      html += `</table>`;
    }
    if (breakdowns.byRegion) {
      html += `<h2>按区域统计</h2>
<table><tr><th>区域</th><th>总数</th><th>在线数</th><th>在线率(%)</th></tr>`;
      for (const item of breakdowns.byRegion) {
        html += `<tr><td>${item.name}</td><td>${item.totalCount}</td><td>${item.onlineCount}</td><td>${item.onlineRate}</td></tr>`;
      }
      html += `</table>`;
    }
  }

  html += `</body></html>`;

  const buffer = Buffer.from(html, 'utf-8');
  const filename = `${title}_${date}.doc`;

  return {
    content: html,
    buffer,
    filename,
    contentType: 'application/msword',
  };
}

function exportJSON(reportData) {
  const content = JSON.stringify(reportData, null, 2);
  const buffer = Buffer.from(content, 'utf-8');
  const filename = `${reportData.title}_${reportData.date}.json`;

  return {
    content,
    buffer,
    filename,
    contentType: 'application/json',
  };
}
