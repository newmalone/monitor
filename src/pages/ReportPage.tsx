import { useState, useEffect, useRef } from 'react';
import { Button, DatePicker, Table, Card, Row, Col, Space, message, Divider } from 'antd';
import { FileWordOutlined, FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, Table as DocxTable, TableRow, TableCell, WidthType, HeadingLevel, BorderStyle, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import { getAllSnapshots, getSnapshotDevices } from '../services/api';
import { generateReportData } from '../services/report';
import { ReportData, DeviceChangeItem } from '../types';

const { RangePicker } = DatePicker;

export const ReportPage = () => {
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAvailableDates();
  }, []);

  const loadAvailableDates = async () => {
    try {
      const snapshots = await getAllSnapshots();
      const dates = snapshots.map(s => s.date).sort((a, b) => b.localeCompare(a));
      setAvailableDates(dates);

      if (dates.length >= 2) {
        setDateRange([dayjs(dates[1]), dayjs(dates[0])]);
        await generateReport(dates[1], dates[0]);
      } else if (dates.length === 1) {
        setDateRange([dayjs(dates[0]), dayjs(dates[0])]);
      }
    } catch (error) {
      console.error('加载日期列表失败', error);
    }
  };

  const generateReport = async (dateA: string, dateB: string) => {
    setLoading(true);
    try {
      const devicesA = await getSnapshotDevices(dateA);
      const devicesB = await getSnapshotDevices(dateB);
      const data = generateReportData(devicesA, dateA, devicesB, dateB);
      setReportData(data);
    } catch (error) {
      message.error('生成报表失败');
      console.error(error);
    }
    setLoading(false);
  };

  const handleDateRangeChange = async (dates: any) => {
    if (dates && dates.length === 2) {
      setDateRange(dates);
      const dateA = dates[0].format('YYYY-MM-DD');
      const dateB = dates[1].format('YYYY-MM-DD');
      await generateReport(dateA, dateB);
    }
  };

  const handleRefresh = () => {
    if (dateRange) {
      generateReport(dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD'));
    }
  };

  const exportToWord = async () => {
    if (!reportData) {
      message.warning('请先生成报表');
      return;
    }

    try {
      message.loading({ content: '正在生成Word文档...', key: 'export' });

      const children: any[] = [];

      children.push(
        new Paragraph({
          text: '车路云设备运维日报',
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        })
      );

      children.push(
        new Paragraph({
          text: `${reportData.dateA} ~ ${reportData.dateB}`,
          spacing: { after: 400 },
        })
      );

      children.push(
        new Paragraph({
          text: '一、数据说明',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 },
        })
      );
      children.push(new Paragraph(`本报告数据来源于 ${reportData.dateA} 和 ${reportData.dateB} 的设备数据文件。`));
      children.push(new Paragraph('统计范围：仅包含"已启用"状态的设备。'));

      children.push(
        new Paragraph({
          text: '二、设备总量概览',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        })
      );
      const overallRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('指标')] }),
            new TableCell({ children: [new Paragraph(reportData.dateA)] }),
            new TableCell({ children: [new Paragraph(reportData.dateB)] }),
            new TableCell({ children: [new Paragraph('变化量')] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('设备总量（台）')] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.a.total))] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.b.total))] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.b.total - reportData.overall.a.total))] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('在线数量（台）')] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.a.online))] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.b.online))] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.b.online - reportData.overall.a.online))] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('离线数量（台）')] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.a.offline))] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.b.offline))] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.b.offline - reportData.overall.a.offline))] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('异常数量（台）')] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.a.abnormal))] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.b.abnormal))] }),
            new TableCell({ children: [new Paragraph(String(reportData.overall.b.abnormal - reportData.overall.a.abnormal))] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('在线率')] }),
            new TableCell({ children: [new Paragraph(`${reportData.overall.a.onlineRate}%`)] }),
            new TableCell({ children: [new Paragraph(`${reportData.overall.b.onlineRate}%`)] }),
            new TableCell({ children: [new Paragraph(`${(reportData.overall.b.onlineRate - reportData.overall.a.onlineRate).toFixed(2)}%`)] }),
          ],
        }),
      ];
      children.push(new DocxTable({ rows: overallRows, width: { size: 100, type: WidthType.PERCENTAGE } }));

      children.push(
        new Paragraph({
          text: '五、设备状态变化分析',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        })
      );
      children.push(new Paragraph(`5.1 故障恢复设备（转在线） - ${reportData.recovered.length} 台`));
      reportData.recovered.forEach(device => {
        children.push(new Paragraph(`- ${device.ipAddress} | ${device.location} | ${device.deviceTypeName} | ${device.statusA} → ${device.statusB}`));
      });
      children.push(new Paragraph({ text: '', spacing: { after: 200 } }));

      children.push(new Paragraph(`5.2 新增离线/异常设备 - ${reportData.newOfflineAbnormal.length} 台`));
      reportData.newOfflineAbnormal.forEach(device => {
        children.push(new Paragraph(`- ${device.ipAddress} | ${device.location} | ${device.deviceTypeName} | ${device.statusA} → ${device.statusB}`));
      });
      children.push(new Paragraph({ text: '', spacing: { after: 200 } }));

      children.push(new Paragraph(`5.3 持续离线/异常设备（重点关注） - ${reportData.persistentOfflineAbnormal.length} 台`));
      reportData.persistentOfflineAbnormal.forEach(device => {
        children.push(new Paragraph(`- ${device.ipAddress} | ${device.location} | ${device.deviceTypeName} | ${device.statusA} → ${device.statusB}`));
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `设备状态分析日报_${reportData.dateA}_${reportData.dateB}.docx`);
      
      message.success({ content: 'Word文档导出成功', key: 'export' });
    } catch (error) {
      console.error('导出Word失败', error);
      message.error({ content: '导出Word失败', key: 'export' });
    }
  };

  const exportToPdf = async () => {
    if (!reportRef.current) {
      message.warning('报表元素未找到');
      return;
    }

    try {
      message.loading({ content: '正在生成PDF文档...', key: 'export' });
      
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 280;
      const pageHeight = 200;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 10;

      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`设备状态分析日报_${reportData?.dateA}_${reportData?.dateB}.pdf`);
      message.success({ content: 'PDF文档导出成功', key: 'export' });
    } catch (error) {
      console.error('导出PDF失败', error);
      message.error({ content: '导出PDF失败', key: 'export' });
    }
  };

  const deviceColumns: ColumnsType<DeviceChangeItem> = [
    { title: 'IP地址', dataIndex: 'ipAddress', key: 'ipAddress', width: 160 },
    { title: '设备位置', dataIndex: 'location', key: 'location' },
    { title: '设备类型', dataIndex: 'deviceTypeName', key: 'deviceTypeName', width: 160 },
    { title: 'A日状态', dataIndex: 'statusA', key: 'statusA', width: 100, align: 'center' },
    { title: 'B日状态', dataIndex: 'statusB', key: 'statusB', width: 100, align: 'center' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 className="page-title">设备状态分析日报</h2>
          <p style={{ margin: '4px 0 0 0', color: '#999', fontSize: 13 }}>生成设备运维状态对比分析报告</p>
        </div>
        <Space>
          <RangePicker
            allowClear={false}
            value={dateRange}
            onChange={handleDateRangeChange}
            disabledDate={(current) => {
              if (!current) return false;
              const dateStr = current.format('YYYY-MM-DD');
              return !availableDates.includes(dateStr);
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新</Button>
          <Button icon={<FileWordOutlined />} type="primary" onClick={exportToWord}>导出Word</Button>
          <Button icon={<FilePdfOutlined />} type="primary" onClick={exportToPdf}>导出PDF</Button>
        </Space>
      </div>

      <div ref={reportRef}>
        {reportData && (
          <>
            <Card title="一、数据说明" style={{ marginBottom: 16 }}>
              <p>本报告数据来源于 {reportData.dateA} 和 {reportData.dateB} 的设备数据文件。</p>
              <p>统计范围：仅包含"已启用"状态的设备。</p>
            </Card>

            <Card title="二、设备总量概览" style={{ marginBottom: 16 }}>
              <Table
                dataSource={[
                  {
                    item: '设备总量（台）',
                    dateA: reportData.overall.a.total,
                    dateB: reportData.overall.b.total,
                    change: reportData.overall.b.total - reportData.overall.a.total,
                  },
                  {
                    item: '在线数量（台）',
                    dateA: reportData.overall.a.online,
                    dateB: reportData.overall.b.online,
                    change: reportData.overall.b.online - reportData.overall.a.online,
                  },
                  {
                    item: '离线数量（台）',
                    dateA: reportData.overall.a.offline,
                    dateB: reportData.overall.b.offline,
                    change: reportData.overall.b.offline - reportData.overall.a.offline,
                  },
                  {
                    item: '异常数量（台）',
                    dateA: reportData.overall.a.abnormal,
                    dateB: reportData.overall.b.abnormal,
                    change: reportData.overall.b.abnormal - reportData.overall.a.abnormal,
                  },
                  {
                    item: '在线率',
                    dateA: `${reportData.overall.a.onlineRate}%`,
                    dateB: `${reportData.overall.b.onlineRate}%`,
                    change: `${(reportData.overall.b.onlineRate - reportData.overall.a.onlineRate).toFixed(2)}%`,
                  },
                ]}
                pagination={false}
                rowKey="item"
                columns={[
                  { title: '指标', dataIndex: 'item', key: 'item', width: 180, fontWeight: 'bold' },
                  { title: reportData.dateA, dataIndex: 'dateA', key: 'dateA', width: 180, align: 'center' },
                  { title: reportData.dateB, dataIndex: 'dateB', key: 'dateB', width: 180, align: 'center' },
                  { title: '变化量', dataIndex: 'change', key: 'change', width: 180, align: 'center', 
                    render: (val) => typeof val === 'number' ? (val >= 0 ? `+${val}` : val) : val 
                  },
                ]}
              />
            </Card>

            <Card title="三、设备类型分布" style={{ marginBottom: 16 }}>
              <Table
                dataSource={(() => {
                  const typeMap = new Map<string, any>();
                  reportData.typeStats.forEach(stat => {
                    if (!typeMap.has(stat.typeName)) {
                      typeMap.set(stat.typeName, { typeName: stat.typeName });
                    }
                    const entry = typeMap.get(stat.typeName)!;
                    if (stat.date === reportData.dateA) {
                      entry.onlineA = stat.online;
                      entry.offlineA = stat.offline;
                      entry.abnormalA = stat.abnormal;
                      entry.totalA = stat.total;
                    }
                    if (stat.date === reportData.dateB) {
                      entry.onlineB = stat.online;
                      entry.offlineB = stat.offline;
                      entry.abnormalB = stat.abnormal;
                      entry.totalB = stat.total;
                    }
                  });
                  return Array.from(typeMap.values());
                })()}
                pagination={false}
                rowKey="typeName"
                columns={[
                  { title: '设备类型', dataIndex: 'typeName', key: 'typeName', width: 180 },
                  { title: `${reportData.dateA}-在线`, dataIndex: 'onlineA', key: 'onlineA', width: 100, align: 'center' },
                  { title: `${reportData.dateA}-离线`, dataIndex: 'offlineA', key: 'offlineA', width: 100, align: 'center' },
                  { title: `${reportData.dateA}-异常`, dataIndex: 'abnormalA', key: 'abnormalA', width: 100, align: 'center' },
                  { title: `${reportData.dateA}-合计`, dataIndex: 'totalA', key: 'totalA', width: 100, align: 'center' },
                  { title: `${reportData.dateB}-在线`, dataIndex: 'onlineB', key: 'onlineB', width: 100, align: 'center' },
                  { title: `${reportData.dateB}-离线`, dataIndex: 'offlineB', key: 'offlineB', width: 100, align: 'center' },
                  { title: `${reportData.dateB}-异常`, dataIndex: 'abnormalB', key: 'abnormalB', width: 100, align: 'center' },
                  { title: `${reportData.dateB}-合计`, dataIndex: 'totalB', key: 'totalB', width: 100, align: 'center' },
                ]}
                scroll={{ x: true }}
              />
            </Card>

            <Card title="四、路口等级分布" style={{ marginBottom: 16 }}>
              <Table
                dataSource={(() => {
                  const levelMap = new Map<string, any>();
                  reportData.junctionLevelStats.forEach(stat => {
                    if (!levelMap.has(stat.level)) {
                      levelMap.set(stat.level, { level: stat.level });
                    }
                    const entry = levelMap.get(stat.level)!;
                    if (stat.date === reportData.dateA) {
                      entry.onlineA = stat.online;
                      entry.offlineAbnormalA = stat.offlineAbnormal;
                      entry.totalA = stat.total;
                    }
                    if (stat.date === reportData.dateB) {
                      entry.onlineB = stat.online;
                      entry.offlineAbnormalB = stat.offlineAbnormal;
                      entry.totalB = stat.total;
                    }
                  });
                  return Array.from(levelMap.values());
                })()}
                pagination={false}
                rowKey="level"
                columns={[
                  { title: '路口等级', dataIndex: 'level', key: 'level', width: 150 },
                  { title: `${reportData.dateA}-在线`, dataIndex: 'onlineA', key: 'onlineA', width: 120, align: 'center' },
                  { title: `${reportData.dateA}-离线/异常`, dataIndex: 'offlineAbnormalA', key: 'offlineAbnormalA', width: 140, align: 'center' },
                  { title: `${reportData.dateA}-合计`, dataIndex: 'totalA', key: 'totalA', width: 120, align: 'center' },
                  { title: `${reportData.dateB}-在线`, dataIndex: 'onlineB', key: 'onlineB', width: 120, align: 'center' },
                  { title: `${reportData.dateB}-离线/异常`, dataIndex: 'offlineAbnormalB', key: 'offlineAbnormalB', width: 140, align: 'center' },
                  { title: `${reportData.dateB}-合计`, dataIndex: 'totalB', key: 'totalB', width: 120, align: 'center' },
                ]}
                scroll={{ x: true }}
              />
            </Card>

            <Card title="五、设备状态变化分析">
              <Divider orientation="left">5.1 故障恢复设备（转在线） - {reportData.recovered.length} 台</Divider>
              <Table
                dataSource={reportData.recovered}
                columns={deviceColumns}
                pagination={{ pageSize: 10 }}
                rowKey="ipAddress"
                style={{ marginBottom: 24 }}
              />

              <Divider orientation="left">5.2 新增离线/异常设备 - {reportData.newOfflineAbnormal.length} 台</Divider>
              <Table
                dataSource={reportData.newOfflineAbnormal}
                columns={deviceColumns}
                pagination={{ pageSize: 10 }}
                rowKey="ipAddress"
                style={{ marginBottom: 24 }}
              />

              <Divider orientation="left">5.3 持续离线/异常设备（重点关注） - {reportData.persistentOfflineAbnormal.length} 台</Divider>
              <Table
                dataSource={reportData.persistentOfflineAbnormal}
                columns={deviceColumns}
                pagination={{ pageSize: 10 }}
                rowKey="ipAddress"
              />
            </Card>
          </>
        )}

        {!loading && !reportData && (
          <div style={{ textAlign: 'center', padding: 80, color: '#999' }}>
            <p style={{ fontSize: 18 }}>请选择日期生成报表</p>
            <p>需要至少两天的数据才能生成对比报表</p>
          </div>
        )}
      </div>
    </div>
  );
};
