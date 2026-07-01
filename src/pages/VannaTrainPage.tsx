import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tabs, Form, Input, Button, message, Space, Tag, Empty, Table, Modal,
  Popconfirm, Spin, Select,
} from 'antd';
import {
  BookOutlined, CodeOutlined, FileTextOutlined, SaveOutlined, ReloadOutlined,
  ArrowLeftOutlined, DeleteOutlined, EditOutlined, LineChartOutlined,
  CloudUploadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ThunderboltOutlined, DatabaseOutlined, RobotOutlined,
} from '@ant-design/icons';
import {
  trainDDL, trainSQL, trainDoc, getTrainStatus, getVannaStatus,
  getTrainingHistory, getTrainingData, updateTrainingData, deleteTrainingData,
  runBenchmark, generateTrainingFromJSON,
  type TrainingDataItem, type TrainingHistoryEntry,
} from '../services/vannaApi';
import type { ColumnsType } from 'antd/es/table';
import styles from './VannaTrainPage.module.css';

const { TextArea } = Input;

export default function VannaTrainPage() {
  const navigate = useNavigate();
  const [ddlForm] = Form.useForm();
  const [sqlForm] = Form.useForm();
  const [docForm] = Form.useForm();
  const [trainLoading, setTrainLoading] = useState(false);
  const [trainStatus, setTrainStatus] = useState<any>(null);
  const [vannaStatus, setVannaStatus] = useState<any>(null);

  const [trainingHistory, setTrainingHistory] = useState<TrainingHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [trainingData, setTrainingData] = useState<TrainingDataItem[]>([]);
  const [dataTotal, setDataTotal] = useState(0);
  const [dataPage, setDataPage] = useState(1);
  const [dataFilter, setDataFilter] = useState<'all' | 'ddl' | 'sql' | 'doc'>('all');
  const [dataLoading, setDataLoading] = useState(false);

  const [editModal, setEditModal] = useState<{ open: boolean; item: TrainingDataItem | null }>({ open: false, item: null });

  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  const [jsonGenLoading, setJsonGenLoading] = useState(false);
  const [jsonGenResult, setJsonGenResult] = useState<any>(null);
  const [activeNav, setActiveNav] = useState('overview');

  useEffect(() => { loadStatus(); loadTrainingHistory(); loadTrainingData(1); }, []);

  const loadStatus = async () => {
    try {
      const [ts, vs] = await Promise.all([getTrainStatus(), getVannaStatus()]);
      setTrainStatus(ts);
      setVannaStatus(vs);
    } catch { /* ignore */ }
  };

  const loadTrainingHistory = useCallback(async () => {
    setHistoryLoading(true);
    try { setTrainingHistory(await getTrainingHistory()); } catch {}
    setHistoryLoading(false);
  }, []);

  const loadTrainingData = useCallback(async (page = 1) => {
    setDataLoading(true);
    try {
      const params: any = { page, page_size: 20 };
      if (dataFilter !== 'all') params.type = dataFilter;
      const result = await getTrainingData(params);
      setTrainingData(result.data || []);
      setDataTotal(result.total || 0);
      setDataPage(page);
    } catch {}
    setDataLoading(false);
  }, [dataFilter]);

  const handleNavClick = (key: string) => {
    setActiveNav(key);
    if (key === 'overview' && trainingHistory.length === 0) loadTrainingHistory();
    if (key === 'data' && trainingData.length === 0) loadTrainingData(1);
  };

  const handleTrainDDL = async (values: any) => {
    setTrainLoading(true);
    try {
      await trainDDL(values.ddl_sql);
      message.success('DDL 训练成功');
      ddlForm.resetFields();
      loadStatus();
    } catch (error: any) { message.error(error.message || '训练失败'); }
    finally { setTrainLoading(false); }
  };

  const handleTrainSQL = async (values: any) => {
    setTrainLoading(true);
    try {
      await trainSQL(values.question, values.sql);
      message.success('SQL 问答对训练成功');
      sqlForm.resetFields();
      loadStatus();
    } catch (error: any) { message.error(error.message || '训练失败'); }
    finally { setTrainLoading(false); }
  };

  const handleTrainDoc = async (values: any) => {
    setTrainLoading(true);
    try {
      const tags = values.tags ? values.tags.split(',').map((t: string) => t.trim()) : undefined;
      await trainDoc(values.content, tags);
      message.success('文档训练成功');
      docForm.resetFields();
      loadStatus();
    } catch (error: any) { message.error(error.message || '训练失败'); }
    finally { setTrainLoading(false); }
  };

  const handleDeleteData = async (id: string) => {
    try {
      await deleteTrainingData(id);
      message.success('已删除');
      loadTrainingData(dataPage);
      loadStatus();
    } catch { message.error('删除失败'); }
  };

  const handleOpenEdit = (item: TrainingDataItem) => setEditModal({ open: true, item });
  const handleSaveEdit = async () => {
    if (!editModal.item) return;
    try {
      const data: any = {};
      if (editModal.item.type === 'sql') {
        data.question = editModal.item.content?.question;
        data.sql = editModal.item.content?.sql;
      } else if (editModal.item.type === 'ddl') {
        data.ddl = editModal.item.content?.ddl;
      }
      await updateTrainingData(editModal.item.id, data);
      message.success('更新成功');
      setEditModal({ open: false, item: null });
      loadTrainingData(dataPage);
    } catch { message.error('更新失败'); }
  };

  const handleRunBenchmark = async () => {
    setBenchmarkLoading(true);
    try {
      const result = await runBenchmark();
      setBenchmarkResult(result);
      const rate = result?.after?.success_rate ?? 0;
      message.success(`基准测试完成，成功率 ${rate}%`);
    } catch (error: any) { message.error(error?.message || '基准测试失败'); }
    finally { setBenchmarkLoading(false); }
  };

  const handleGenerateFromJSON = async (days = 7) => {
    setJsonGenLoading(true);
    setJsonGenResult(null);
    try {
      const result = await generateTrainingFromJSON({ days, auto_train: true });
      setJsonGenResult(result);
      const trained = result?.trained ?? result?.generated ?? 0;
      message.success(`已生成并训练 ${trained} 条 SQL 对`);
      loadStatus();
    } catch (error: any) { message.error(error?.message || '生成训练数据失败'); }
    finally { setJsonGenLoading(false); }
  };

  const quickDDL = [
    { name: '设备表结构', desc: 'devices', sql: `CREATE TABLE devices (
  id INTEGER PRIMARY KEY,
  device_code TEXT,
  product_name TEXT,
  manufacturer_name TEXT,
  device_type_name TEXT,
  region TEXT,
  status TEXT,
  enabled TEXT,
  snapshot_date TEXT
);` },
    { name: '快照表结构', desc: 'snapshots', sql: `CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY,
  date TEXT,
  total_count INTEGER,
  enabled_count INTEGER,
  created_at TEXT
);` },
    { name: '时延报告表', desc: 'latency_reports', sql: `CREATE TABLE latency_reports (
  id INTEGER PRIMARY KEY,
  device_code TEXT,
  device_name TEXT,
  region TEXT,
  report_date TEXT,
  avg_latency_ms REAL,
  max_latency_ms REAL,
  packet_loss_rate REAL,
  total_checks INTEGER,
  online_count INTEGER
);` },
  ];

  const quickSQLPairs = [
    { question: '设备总数是多少？', sql: `SELECT COUNT(*) as total FROM devices WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM devices);` },
    { question: '今天设备在线率是多少？', sql: `SELECT ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as online_rate FROM devices WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM devices);` },
    { question: '列出所有离线设备', sql: `SELECT device_code, product_name, region FROM devices WHERE status='离线' AND snapshot_date = (SELECT MAX(snapshot_date) FROM devices);` },
    { question: '各区域设备数量对比', sql: `SELECT region, COUNT(*) as count FROM devices WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM devices) GROUP BY region ORDER BY count DESC;` },
    { question: '哪些厂商设备数量最多 TOP5', sql: `SELECT manufacturer_name, COUNT(*) as count FROM devices WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM devices) GROUP BY manufacturer_name ORDER BY count DESC LIMIT 5;` },
    { question: '各状态设备数量分布', sql: `SELECT status, COUNT(*) as count FROM devices WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM devices) GROUP BY status;` },
    { question: '最近 7 天在线率趋势', sql: `SELECT snapshot_date, ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as online_rate FROM devices WHERE snapshot_date >= date('now', '-7 days') GROUP BY snapshot_date ORDER BY snapshot_date;` },
  ];

  const dataColumns: ColumnsType<TrainingDataItem> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => {
        const map: Record<string, string> = {
          ddl: styles.tagBlue,
          sql: styles.tagGreen,
          doc: styles.tagOrange,
        };
        return <Tag className={`${styles.tag} ${map[type] || ''}`}>{type.toUpperCase()}</Tag>;
      },
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (content: any, record) => {
        if (record.type === 'sql') return content?.question || '';
        if (record.type === 'ddl') return (content?.ddl || '').slice(0, 80);
        return (content?.documentation || '').slice(0, 80);
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      align: 'center' as const,
      render: (_, record) => (
        <Space>
          {record.type === 'sql' && (
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)} />
          )}
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteData(record.id)} okText="删除" cancelText="取消">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const navItems = [
    { key: 'overview', icon: <LineChartOutlined />, label: '训练总览' },
    { key: 'ddl', icon: <CodeOutlined />, label: 'DDL 训练' },
    { key: 'sql', icon: <BookOutlined />, label: 'SQL 问答对' },
    { key: 'doc', icon: <FileTextOutlined />, label: '文档训练' },
    { key: 'data', icon: <DatabaseOutlined />, label: '数据管理' },
  ];

  const renderContent = () => {
    switch (activeNav) {
      case 'overview':
        return (
          <>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <div className={`${styles.cardTitleIcon} ${styles.statIconBlue}`}><ThunderboltOutlined /></div>
                  训练效果对比
                </div>
                <div className={styles.cardActions}>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleRunBenchmark} disabled={benchmarkLoading}>
                    <ThunderboltOutlined /> 运行基准测试
                  </button>
                </div>
              </div>
              <div className={styles.cardBody}>
                {benchmarkResult ? (
                  <div className={styles.benchGrid}>
                    <div className={`${styles.benchCard} ${styles.benchCardBefore}`}>
                      <div className={styles.benchLabel}>训练前成功率</div>
                      <div className={styles.benchValue}>
                        {(benchmarkResult.before?.success_rate || 0).toFixed(1)}<span>%</span>
                      </div>
                    </div>
                    <div className={`${styles.benchCard} ${styles.benchCardAfter}`}>
                      <div className={styles.benchLabel}>训练后成功率</div>
                      <div className={styles.benchValue}>
                        {(benchmarkResult.after?.success_rate || 0).toFixed(1)}<span>%</span>
                      </div>
                    </div>
                    <div className={`${styles.benchCard} ${styles.benchCardImprove}`}>
                      <div className={styles.benchLabel}>提升幅度</div>
                      <div className={styles.benchValue}>
                        {(benchmarkResult.improvement || 0).toFixed(1)}<span>%</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.empty}>
                    <Empty description="尚未运行基准测试" />
                  </div>
                )}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <div className={`${styles.cardTitleIcon}`} style={{ background: '#F0E8FF', color: '#722ED1' }}><CloudUploadOutlined /></div>
                  从历史数据生成训练
                </div>
                <div className={styles.cardActions}>
                  <Space>
                    <button className={styles.btn} onClick={() => handleGenerateFromJSON(7)} disabled={jsonGenLoading}>
                      <CloudUploadOutlined /> 近 7 天
                    </button>
                    <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => handleGenerateFromJSON(30)} disabled={jsonGenLoading}>
                      <CloudUploadOutlined /> 近 30 天
                    </button>
                  </Space>
                </div>
              </div>
              <div className={styles.cardBody}>
                <p className={styles.desc}>
                  从真实 JSON 设备数据中自动提取多天设备记录，生成 SQL 问答对并训练。
                </p>
                {jsonGenResult && (
                  <div className={styles.jsonResult}>
                    <CheckCircleOutlined />
                    <span>成功生成 <strong>{jsonGenResult.generated}</strong> 条 SQL 对，已训练 <strong>{jsonGenResult.trained}</strong> 条</span>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <div className={styles.cardTitleIcon} style={{ background: '#E8FFEA', color: '#00B42A' }}><DatabaseOutlined /></div>
                  训练历史
                </div>
                <div className={styles.cardActions}>
                  <button className={styles.btn} onClick={loadTrainingHistory} disabled={historyLoading}>
                    <ReloadOutlined /> 刷新
                  </button>
                </div>
              </div>
              <div className={styles.cardBody}>
                {historyLoading ? (
                  <div className={styles.loading}><Spin /></div>
                ) : trainingHistory.length > 0 ? (
                  <div className={styles.historyList}>
                    {trainingHistory.slice(0, 10).map((h, i) => (
                      <div key={i} className={styles.historyItem}>
                        <div className={`${styles.historyStatus} ${h.status === 'success' ? styles.historyStatusSuccess : styles.historyStatusError}`}>
                          {h.status === 'success' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                        </div>
                        <div className={styles.historyTime}>{new Date(h.timestamp).toLocaleString()}</div>
                        <div className={styles.historyStats}>
                          <span className={styles.historyStat}>DDL <strong>{h.ddl_count}</strong></span>
                          <span className={styles.historyStat}>SQL <strong>{h.sql_count}</strong></span>
                          <span className={styles.historyStat}>文档 <strong>{h.doc_count}</strong></span>
                        </div>
                        <div className={styles.historyTotal}>{h.total} 条</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.empty}>暂无训练历史</div>
                )}
              </div>
            </div>
          </>
        );

      case 'ddl':
        return (
          <>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <div className={`${styles.cardTitleIcon} ${styles.statIconBlue}`}><CodeOutlined /></div>
                  训练 DDL 语句
                </div>
              </div>
              <div className={styles.cardBody}>
                <Form form={ddlForm} onFinish={handleTrainDDL} layout="vertical">
                  <Form.Item name="ddl_sql" label="DDL 语句" rules={[{ required: true, message: '请输入 DDL 语句' }]}>
                    <TextArea rows={10} placeholder="CREATE TABLE devices (...);" style={{ fontFamily: 'monospace' }} />
                  </Form.Item>
                  <div className={styles.formActions}>
                    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={trainLoading}>
                      <SaveOutlined /> 训练 DDL
                    </button>
                    <button type="button" className={styles.btn} onClick={() => ddlForm.resetFields()}>重置</button>
                  </div>
                </Form>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <div className={styles.cardTitleIcon} style={{ background: '#E8FFEA', color: '#00B42A' }}><ThunderboltOutlined /></div>
                  快捷训练模板
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.templateGrid}>
                  {quickDDL.map((item) => (
                    <div key={item.name} className={styles.templateCard} onClick={() => {
                      ddlForm.setFieldsValue({ ddl_sql: item.sql });
                      message.info('已填入模板，请确认后点击训练');
                    }}>
                      <div className={styles.templateName}>
                        <CodeOutlined style={{ color: '#1664FF' }} /> {item.name}
                      </div>
                      <pre className={styles.templatePreview}>{item.sql.slice(0, 200)}{item.sql.length > 200 ? '...' : ''}</pre>
                      <button type="button" className={styles.templateBtn}>使用模板</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        );

      case 'sql':
        return (
          <>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <div className={styles.cardTitleIcon} style={{ background: '#E8FFEA', color: '#00B42A' }}><BookOutlined /></div>
                  训练 SQL 问答对
                </div>
              </div>
              <div className={styles.cardBody}>
                <Form form={sqlForm} onFinish={handleTrainSQL} layout="vertical">
                  <Form.Item name="question" label="问题" rules={[{ required: true, message: '请输入问题' }]}>
                    <Input placeholder="例如：今天设备在线率是多少？" />
                  </Form.Item>
                  <Form.Item name="sql" label="对应的 SQL 语句" rules={[{ required: true, message: '请输入 SQL 语句' }]}>
                    <TextArea rows={4} placeholder="SELECT ..." style={{ fontFamily: 'monospace' }} />
                  </Form.Item>
                  <div className={styles.formActions}>
                    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={trainLoading}>
                      <SaveOutlined /> 训练 SQL
                    </button>
                    <button type="button" className={styles.btn} onClick={() => sqlForm.resetFields()}>重置</button>
                  </div>
                </Form>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <div className={styles.cardTitleIcon} style={{ background: '#E8FFEA', color: '#00B42A' }}><ThunderboltOutlined /></div>
                  快捷训练模板
                </div>
              </div>
              <div className={styles.cardBody}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: '30%' }}>问题</th>
                      <th>SQL 语句</th>
                      <th style={{ width: 80, textAlign: 'center' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quickSQLPairs.map((item, i) => (
                      <tr key={i}>
                        <td>{item.question}</td>
                        <td style={{ color: '#8F959E', fontFamily: 'Consolas, monospace', fontSize: 12 }}>{item.sql.slice(0, 60)}...</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className={`${styles.btn} ${styles.btnSm}`}
                            onClick={() => {
                              sqlForm.setFieldsValue({ question: item.question, sql: item.sql });
                              message.info('已填入模板');
                            }}
                          >
                            使用
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );

      case 'doc':
        return (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <div className={styles.cardTitleIcon} style={{ background: '#FFF7E8', color: '#FF7D00' }}><FileTextOutlined /></div>
                训练业务文档
              </div>
            </div>
            <div className={styles.cardBody}>
              <Form form={docForm} onFinish={handleTrainDoc} layout="vertical">
                <Form.Item name="content" label="文档内容" rules={[{ required: true, message: '请输入文档内容' }]}>
                  <TextArea rows={8} placeholder="输入业务知识、术语解释、业务规则等..." />
                </Form.Item>
                <Form.Item name="tags" label="标签（可选，逗号分隔）">
                  <Input placeholder="例如：设备,在线率,区域" />
                </Form.Item>
                <div className={styles.formActions}>
                  <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={trainLoading}>
                    <SaveOutlined /> 训练文档
                  </button>
                  <button type="button" className={styles.btn} onClick={() => docForm.resetFields()}>重置</button>
                </div>
              </Form>
            </div>
          </div>
        );

      case 'data':
        return (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <div className={styles.cardTitleIcon} style={{ background: '#F0E8FF', color: '#722ED1' }}><DatabaseOutlined /></div>
                所有训练数据
              </div>
              <div className={styles.cardActions}>
                <div className={styles.tableToolbar}>
                  <Select
                    value={dataFilter}
                    onChange={(v) => { setDataFilter(v); loadTrainingData(1); }}
                    style={{ width: 120 }}
                    options={[
                      { label: '全部', value: 'all' },
                      { label: 'DDL', value: 'ddl' },
                      { label: 'SQL', value: 'sql' },
                      { label: '文档', value: 'doc' },
                    ]}
                  />
                  <button className={styles.btn} onClick={() => loadTrainingData(dataPage)} disabled={dataLoading}>
                    <ReloadOutlined /> 刷新
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.cardBody}>
              <Table<TrainingDataItem>
                columns={dataColumns}
                dataSource={trainingData}
                rowKey="id"
                loading={dataLoading}
                pagination={{
                  current: dataPage,
                  pageSize: 20,
                  total: dataTotal,
                  onChange: (p) => loadTrainingData(p),
                  showSizeChanger: false,
                }}
                size="middle"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}><RobotOutlined /></div>
            <span>Vanna</span>
          </div>
        </div>
        <nav className={styles.sidebarNav}>
          {navItems.map((item) => (
            <div
              key={item.key}
              className={`${styles.navItem} ${activeNav === item.key ? styles.navItemActive : ''}`}
              onClick={() => handleNavClick(item.key)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <button className={styles.backBtn} onClick={() => navigate('/vanna')}>
            <ArrowLeftOutlined />
            <span>返回问答</span>
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <RobotOutlined style={{ color: '#1664FF' }} />
            训练管理中心
          </div>
          <div className={styles.topbarStatus}>
            <span className={`${styles.statusTag} ${vannaStatus?.trained ? styles.statusTagGreen : styles.statusTagOrange}`}>
              {vannaStatus?.trained ? '✓ 已训练' : '⚠ 未训练'}
            </span>
            <span style={{ fontSize: 12, color: '#8F959E' }}>
              LLM: {vannaStatus?.llm_provider || '未知'}
            </span>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.contentInner}>
            <div className={styles.statsRow}>
              <div className={styles.statCard}>
                <div className={`${styles.statIcon} ${styles.statIconBlue}`}><CodeOutlined /></div>
                <div className={styles.statBody}>
                  <div className={styles.statLabel}>DDL 语句</div>
                  <div className={styles.statValue}>
                    {trainStatus?.ddl_count ?? 0}<span>条</span>
                  </div>
                </div>
              </div>
              <div className={styles.statCard}>
                <div className={`${styles.statIcon} ${styles.statIconGreen}`}><BookOutlined /></div>
                <div className={styles.statBody}>
                  <div className={styles.statLabel}>SQL 问答对</div>
                  <div className={styles.statValue}>
                    {trainStatus?.sql_count ?? 0}<span>条</span>
                  </div>
                </div>
              </div>
              <div className={styles.statCard}>
                <div className={`${styles.statIcon} ${styles.statIconOrange}`}><FileTextOutlined /></div>
                <div className={styles.statBody}>
                  <div className={styles.statLabel}>文档</div>
                  <div className={styles.statValue}>
                    {trainStatus?.doc_count ?? 0}<span>条</span>
                  </div>
                </div>
              </div>
              <div className={styles.statCard}>
                <div className={`${styles.statIcon} ${styles.statIconPurple}`}><DatabaseOutlined /></div>
                <div className={styles.statBody}>
                  <div className={styles.statLabel}>总计</div>
                  <div className={styles.statValue}>
                    {trainStatus?.total ?? 0}<span>条</span>
                  </div>
                </div>
              </div>
            </div>

            {renderContent()}
          </div>
        </div>
      </div>

      <Modal
        title="编辑 SQL 问答对"
        open={editModal.open}
        onOk={handleSaveEdit}
        onCancel={() => setEditModal({ open: false, item: null })}
        okText="保存"
        cancelText="取消"
        width={560}
      >
        <div className={styles.modalBody}>
          {editModal.item?.type === 'sql' && (
            <Form
              layout="vertical"
              initialValues={{
                question: editModal.item?.content?.question,
                sql: editModal.item?.content?.sql,
              }}
              onValuesChange={(_, values) => {
                if (editModal.item) {
                  setEditModal({
                    ...editModal,
                    item: { ...editModal.item, content: { ...editModal.item.content, ...values } },
                  });
                }
              }}
            >
              <Form.Item name="question" label="问题">
                <Input />
              </Form.Item>
              <Form.Item name="sql" label="SQL">
                <TextArea rows={4} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Form>
          )}
        </div>
      </Modal>
    </div>
  );
}
