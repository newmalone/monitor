import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import os from 'os';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { saveSnapshot, getSnapshot, getAllSnapshots, getSnapshotDevices, deleteSnapshot } from './db.js';
import agentRouter from './agent/index.js';
import authRouter from './routes/auth.js';
import vannaRouter from './routes/vanna.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = 3001;
app.use(cors());
app.use(express.json());
// Auth API routes
app.use('/api/auth', authRouter);
// Agent API routes
app.use(agentRouter);
// Vanna AI API routes (proxy to Python service)
app.use(vannaRouter);
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.xlsx') {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xlsx 格式文件'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }
    const rawDate = String(req.body.date || '');
    const safeDate = rawDate.replace(/[\\/:*?"<>|]/g, '-') || formatDate(new Date());
    // 处理文件名，确保正确编码
    let fileName = req.file.originalname;
    try {
      if (Buffer.from(fileName, 'latin1').toString('utf8') !== fileName) {
        fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      }
    } catch (e) {
      console.log('文件名编码处理失败，使用原始名称');
    }
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ error: 'Excel 文件没有可用工作表' });
    }
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    const devices = parseDevices(jsonData);
    await saveSnapshot(safeDate, fileName, devices);
    console.log(`保存快照: 日期=${safeDate}, 文件=${fileName}, 设备数=${devices.length}`);
    
    // 数据双写：同时写入 SQLite（供Vanna使用）
    writeToVannaSqlite(safeDate, fileName, devices).catch(err => {
      console.error('写入Vanna SQLite失败（不影响主功能）:', err.message);
    });
    
    res.json({
      success: true,
      date: safeDate,
      totalCount: devices.length,
      enabledCount: devices.filter(d => d.enabled === '启用').length,
      devices,
    });
  } catch (error) {
    console.error('上传失败:', error);
    res.status(500).json({ error: error.message || '上传处理失败' });
  }
});
app.get('/api/devices/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const devices = await getSnapshotDevices(date);
    if (devices.length === 0) {
      return res.status(404).json({ error: '未找到该日期的数据' });
    }
    res.json({ date, devices });
  } catch (error) {
    console.error('查询设备失败:', error);
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/snapshots', async (req, res) => {
  try {
    const snapshots = await getAllSnapshots();
    res.json(snapshots);
  } catch (error) {
    console.error('查询快照失败:', error);
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/snapshots/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const snapshot = await getSnapshot(date);
    if (!snapshot) {
      return res.status(404).json({ error: '未找到该日期的快照' });
    }
    res.json(snapshot);
  } catch (error) {
    console.error('查询快照失败:', error);
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/snapshots/latest', async (req, res) => {
  try {
    const snapshots = await getAllSnapshots();
    if (snapshots.length === 0) {
      return res.status(404).json({ error: '暂无数据' });
    }
    const latest = await getSnapshot(snapshots[0].date);
    res.json(latest);
  } catch (error) {
    console.error('查询最新快照失败:', error);
    res.status(500).json({ error: error.message });
  }
});
app.delete('/api/snapshots/:date', async (req, res) => {
  try {
    const { date } = req.params;
    await deleteSnapshot(date);
    res.json({ success: true, date });
  } catch (error) {
    console.error('删除快照失败:', error);
    res.status(500).json({ error: error.message });
  }
});
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  if (error) {
    return res.status(400).json({ error: error.message || '上传失败' });
  }
  next();
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`设备监控后端服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`局域网内可通过 http://${getLocalIP()}:${PORT} 访问`);
});
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function parseDevices(jsonData) {
  return jsonData.map((row, index) => ({
    id: String(index + 1),
    deviceCode: String(row['设备编号'] || ''),
    productName: String(row['产品名称'] || ''),
    manufacturerCode: String(row['厂商编码'] || ''),
    manufacturerName: String(row['厂商名称'] || ''),
    deviceTypeCode: String(row['设备类型编码'] || ''),
    deviceTypeName: String(row['设备类型名称'] || ''),
    nodeType: String(row['节点类型'] || ''),
    authMethod: String(row['认证方式'] || ''),
    username: String(row['用户名'] || ''),
    password: String(row['密码'] || ''),
    protocol: String(row['传输协议'] || ''),
    serialNumber: String(row['设备序列号'] || ''),
    location: String(row['设备位置'] || ''),
    longitude: typeof row['经度'] === 'number' ? row['经度'] : parseFloat(row['经度']) || 0,
    latitude: typeof row['纬度'] === 'number' ? row['纬度'] : parseFloat(row['纬度']) || 0,
    junctionId: String(row['路口ID'] || ''),
    junctionType: String(row['路口类型'] || ''),
    junctionLevel: String(row['路口等级'] || ''),
    region: String(row['区域'] || ''),
    relatedJunction: String(row['关联路口'] || ''),
    ipAddress: String(row['IP地址'] || ''),
    purpose: String(row['设备用途'] || ''),
    ownerUnit: String(row['归属单位'] || ''),
    maintenanceUnit: String(row['运维单位'] || ''),
    status: row['状态'] === '离线' ? '离线' : row['状态'] === '异常' ? '异常' : '在线',
    installLocation: String(row['安装位置'] || ''),
    radiationRadius: typeof row['设备监测辐射半径（M）'] === 'number' ? row['设备监测辐射半径（M）'] : undefined,
    cameraAngle: row['摄像机拍摄角度'] || undefined,
    cameraType: row['相机类型'] || undefined,
    directionAngle: row['方向角'] || undefined,
    pitchAngle: row['俯仰角'] || undefined,
    rotationAngle: row['旋转角'] || undefined,
    detectionDirection: row['检测方向'] || undefined,
    detectionRadius: row['检测半径'] || undefined,
    junctionCode: String(row['路口编号'] || ''),
    trafficPoliceCode: String(row['设备编号(交警)'] || ''),
    enabled: row['启用状态'] === '未启用' ? '未启用' : '启用',
  }));
}

/**
 * 数据双写：将设备数据同步写入 Vanna SQLite 数据库
 * 如果 Vanna 服务不可用，不影响主功能
 */
async function writeToVannaSqlite(date, sourceFile, devices) {
  const VANNA_SERVICE_URL = process.env.VANNA_SERVICE_URL || 'http://localhost:3002';
  
  try {
    // 通过 Vanna 服务的迁移接口写入数据
    const response = await fetch(`${VANNA_SERVICE_URL}/api/vanna/migrate/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        sourceFile,
        devices: devices.map(d => ({
          id: d.deviceCode || `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          date,
          device_code: d.deviceCode,
          product_name: d.productName,
          manufacturer_code: d.manufacturerCode,
          manufacturer_name: d.manufacturerName,
          device_type_code: d.deviceTypeCode,
          device_type_name: d.deviceTypeName,
          node_type: d.nodeType,
          auth_method: d.authMethod,
          location: d.location,
          longitude: d.longitude,
          latitude: d.latitude,
          junction_id: d.junctionId,
          junction_type: d.junctionType,
          junction_level: d.junctionLevel,
          region: d.region,
          ip_address: d.ipAddress,
          purpose: d.purpose,
          owner_unit: d.ownerUnit,
          maintenance_unit: d.maintenanceUnit,
          status: d.status,
          enabled: d.enabled,
        })),
      }),
    });
    
    if (response.ok) {
      console.log(`[Vanna Dual-Write] 成功写入 SQLite: ${date}, ${devices.length} 台设备`);
    } else {
      console.warn(`[Vanna Dual-Write] Vanna 服务返回 ${response.status}，可能未启动`);
    }
  } catch (error) {
    console.warn(`[Vanna Dual-Write] Vanna 服务不可用（不影响主功能）: ${error.message}`);
  }
}
