# 设备监控系统 - 项目上下文记录文档

## 1. 项目概况
- **项目名称**：设备监控系统
- **版本号**：v1.1.0
- **描述**：基于React + 设备状态监控、数据分析、日报生成、AGENT对话系统
- **项目根目录**：D:\运维管理平台\monitor

---

## 2. 技术栈

### 2.1 前端
- **框架**：React 18
- **语言**：TypeScript 5
- **UI 库**：Ant Design 5
- **构建工具**：Vite 5
- **图表**：ECharts
- **地图**：高德地图 JS API
- **路由**：React Router 6
- **前端端口**：3000

### 2.2 后端
- **框架**：Express 4
- **语言**：Node.js (ES Module)
- **数据存储**：JSON 文件（基于文件
- **文件处理**：XLSX
- **后端端口**：3001

### 2.3 依赖库
- **文档导出**：docx（待集成
  - docx (Word 导出)
  - html2canvas + jspdf (PDF 导出)
  - XLSX (Excel 导出)

---

## 3. 核心功能模块

### 3.1 设备状态监控
- **页面**：src/pages/MonitorPage.tsx
- **功能**：
  - Excel 在线/离线/异常设备统计卡片
  - 设备列表表格
  - 高德地图设备点位展示
  - 设备搜索与筛选

### 3.2 历史数据查询
- **页面**：src/pages/HistoryPage.tsx
- **功能**：
  - 历史快照列表
  - 查看不同日期的设备数据
  - 删除历史快照

### 3.3 数据对比分析
- **页面**：src/pages/ComparePage.tsx
- **功能**：
  - 选择两个日期对比
  - 设备总量/在线率/厂家统计
  - 对比表格
  - 图表展示（ECharts
  - 图表展示：ECharts

### 3.4 设备状态分析日报
- **页面**：src/pages/ReportPage.tsx
- **功能**：
  - 生成日报：在线/离线/异常设备统计
  - 设备类型分布统计
  - 路口等级分布
  - 路口等级统计
  - 设备状态变化分析
  - 支持导出Word/PDF
  - 支持导出 Word/PDF/Excel

### 3.5 AGENT 自定义报表（待开发）
- **设计文档**：AGENT功能设计文档.md
- **设计**：AGENT功能设计文档.md
- **功能**：
  - 自然语言对话查询设备状态
  - 快捷查询按钮
  - 对话历史记录
  - 多轮上下文理解
  - 自定义报表生成
  - 支持导出功能

---

## 4. 项目结构树

```
D:\运维管理平台\monitor\
├── src/
│   ├── components/
│   │   ├── ChartPanel.tsx       # 图表组件
│   │   ├── DeviceMap.tsx        # 高德地图组件
│   │   ├── DeviceTable.tsx    # 设备表格组件
│   │   ├── FileUploader.tsx    # 文件上传组件
│   │   └── StatsCard.tsx      # 统计卡片组件
│   ├── pages/
│   │   ├── ComparePage.tsx    # 数据对比页面
│   │   ├── HistoryPage.tsx   # 历史查询页面
│   │   ├── MonitorPage.tsx   # 监控页面
│   │   └── ReportPage.tsx    # 日报页面
│   ├── services/
│   │   ├── api.ts           # API 调用
│   │   ├── comparison.ts  # 对比分析服务
│   │   ├── report.ts      # 日报数据统计
│   │   ├── stats.ts       # 统计服务
│   │   └── storage.ts     # 存储服务
│   ├── types/
│   │   └── index.ts       # TypeScript
│   │   └── index.ts       # TypeScript 类型定义
│   ├── App.tsx           # 主应用组件
│   ├── App.css            # 主样式
│   ├── index.css          # 全局样式
│   └── main.tsx           # 入口文件
├── server/
│   ├── index.js          # Express 后端主入口
│   └── db.js             # 数据库操作（JSON 文件存储）
├── public/
│   └── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── 需求文档.md
├── 概要设计文档.md
├── 实施任务清单.md
├── 版本说明.md
└── AGENT功能设计文档.md
└── AGENT功能设计文档.md
```

---

## 5. 设备数据结构

### 5.1 设备数据类型
```typescript
interface Device {
  id: string
  deviceCode: string
  productName: string
  manufacturerName: string
  deviceTypeName: string
  location: string
  longitude: number
  latitude: number
  junctionLevel: string
  region: string
  status: '在线' | '离线' | '异常'
  enabled: '启用' | '未启用'
}
```

### 5.2 相关类型定义位置
- 文件路径：src/types/index.ts
- 包含：设备类型、统计类型、对比数据、报表数据等

---

## 6. 后端 API 设计

### 6.1 文件上传
- **接口**：POST /api/upload
- **功能**：上传 Excel 文件并解析，保存快照
- **参数**：file (FormData), date (string)
- **返回**：{ success: boolean, date, totalCount, enabledCount, devices }

### 6.2 获取设备数据
- **接口**：GET /api/devices/:date
- **功能**：获取指定日期的设备数据
- **返回**：{ date: string, devices: Device[] }

### 6.3 获取快照列表
- **接口**：GET /api/snapshots
- **功能**：获取所有历史快照
- **返回**：[{ date, sourceFile, importedAt, totalCount, enabledCount }[]

### 6.4 获取最新快照
- **接口**：GET /api/snapshots/latest
- **功能**：获取最新日期的快照

### 6.5 删除快照
- **接口**：DELETE /api/snapshots/:date

---

## 7. 现有服务层

### 7.1 API 服务
- **文件**：src/services/api.ts
- **功能**：
  - uploadFile(file, date)：上传 Excel
  - getDevices(date)：获取设备数据
  - getSnapshotDevices(date)：获取快照设备
  - getAllSnapshots()：获取全部快照
  - getLatestSnapshot()：获取最新快照
  - deleteSnapshot(date)：删除快照

### 7.2 对比分析服务
- **文件**：src/services/comparison.ts
- **功能**：日期数据对比逻辑

### 7.3 日报统计服务
- **文件**：src/services/report.ts
- **功能**：
  - 设备统计
  - 类型分布统计
  - 路口等级统计
  - 状态变化分析
  - 状态变化分析

---

## 8. 关键文件说明

### 8.1 后端入口文件
- server/index.js：Express 后端
- server/db.js：数据存储（JSON 文件）

### 8.2 主应用组件
- src/App.tsx
- 包含左侧菜单、路由、布局
- 菜单项：设备状态监控、数据对比分析、导入历史查询、设备状态分析日报

### 8.3 配置文件
- vite.config.ts：Vite 配置（主机地址 0.0.0.0:3000
- tsconfig.json：TypeScript 配置
- package.json：依赖脚本定义

---

## 9. 启动方式

### 9.1 启动后端
```bash
cd D:\运维管理平台\monitor
npm run server
```
- 后端监听：0.0.0.0:3001

### 9.2 启动前端
```bash
cd D:\运维管理平台\monitor
npm run dev
```
- 前端访问：http://localhost:3000 (或局域网 IP)

---

## 10. 重要注意事项

### 10.1 数据存储
- 数据文件存储：JSON 文件方式
- 目录结构：按日期存储
- 按日期存储快照

### 10.2 高德地图
- **API Key**：已配置
- **安全密钥**：已配置
- **坐标系**：GCJ-02
- **坐标系**：GCJ-02

### 10.3 Excel 解析
- **解析方式**：后端使用 XLSX 解析 Excel
- **日期提取**：从文件名自动提取日期

### 10.4 AGENT 功能待开发
- 设计文档已完成
- 需求已确认：DeepSeek/OpenAI、侧边栏对话、快捷按钮、历史记录、导出

---

## 11. 相关文档

- 需求文档.md：需求文档.md
- 概要设计文档.md：概要设计文档.md
- 实施任务清单.md：实施任务清单.md
- 版本说明.md：版本说明.md
- AGENT功能设计文档.md：AGENT功能设计文档.md

---

## 12. 开发约定

- **文件命名**：PascalCase 组件，camelCase 函数
- **组件目录**：src/components 放通用组件
- **页面目录**：src/pages 放页面组件
- **服务层**：src/services 放业务逻辑
- **类型定义**：src/types 放类型定义

---

## 13. Git 状态
- **Git 仓库**：已初始化
- **远程仓库**：https://github.com/newmalone/monitor

---

## 14. 待开发任务清单（AGENT 自定义报表功能）

### 14.1 阶段一：后端 AGENT 中间层
**状态**：待开发
**任务子项**：
- [ ] 创建 server/agent/ 目录结构
- [ ] 创建 server/config/agent.js 配置文件（DeepSeek/OpenAI 配置）
- [ ] 实现 server/agent/llm_client.js（LLM 客户端封装）
- [ ] 实现 server/agent/intent.js（意图解析与参数提取）
- [ ] 实现 server/agent/data_query.js（数据查询与处理）
- [ ] 实现 server/agent/formatter.js（结果格式化）
- [ ] 实现 server/agent/report_gen.js（报表生成）
- [ ] 实现 server/agent/conversation.js（对话管理）
- [ ] 实现 server/db_agent.js（对话历史存储）
- [ ] 实现 server/agent/index.js（AGENT 路由入口）
- [ ] 在 server/index.js 中集成 AGENT 路由

### 14.2 阶段二：后端 API 接口
**状态**：待开发
**任务子项**：
- [ ] POST /api/agent/chat（聊天接口）
- [ ] GET /api/agent/conversations（对话列表）
- [ ] GET /api/agent/conversations/:id（对话详情）
- [ ] DELETE /api/agent/conversations/:id（删除对话）
- [ ] POST /api/agent/export（导出生成的报表）

### 14.3 阶段三：前端 AGENT UI 组件
**状态**：待开发
**任务子项**：
- [ ] 创建 src/components/AgentChatSidebar.tsx（对话侧边栏组件）
- [ ] 创建 src/components/QuickQueries.tsx（快捷查询按钮组件）
- [ ] 创建 src/components/ChatMessage.tsx（消息气泡组件）
- [ ] 创建 src/components/ReportPreview.tsx（报表预览组件）
- [ ] 在 src/App.tsx 顶部导航栏添加"AI 助手"按钮入口
- [ ] 在 src/App.tsx 中添加侧边栏/弹窗状态管理

### 14.4 阶段四：前端类型与服务
**状态**：待开发
**任务子项**：
- [ ] 在 src/types/index.ts 中添加 AGENT 相关类型
- [ ] 创建 src/services/agent.ts（AGENT API 调用服务）

### 14.5 阶段五：集成与测试
**状态**：待开发
**任务子项**：
- [ ] 集成快捷查询按钮（常用统计/对比分析/异常排查/筛选查询）
- [ ] 实现对话历史记录与恢复
- [ ] 实现多轮上下文理解
- [ ] 集成报表导出功能（Word/PDF/Excel）
- [ ] 完整流程测试
- [ ] 测试各个查询类型

---

## 15. 快捷查询预设清单

### 15.1 常用统计类
```json
[
  { "label": "今日在线数", "query": "今天在线设备有多少" },
  { "label": "今日离线数", "query": "今天离线设备有多少" },
  { "label": "今日在线率", "query": "今天的在线率是多少" },
  { "label": "今日异常数", "query": "今天异常设备有多少" }
]
```

### 15.2 对比分析类
```json
[
  { "label": "昨日今日对比", "query": "昨天和今天的在线率对比" },
  { "label": "生成日报", "query": "生成昨天的设备状态日报" },
  { "label": "本周趋势", "query": "这一周的在线率变化趋势" }
]
```

### 15.3 异常排查类
```json
[
  { "label": "查看离线设备", "query": "列出所有离线设备" },
  { "label": "长期离线", "query": "列出离线超过3天的设备" },
  { "label": "新增离线", "query": "今天新离线的设备有哪些" }
]
```

### 15.4 筛选查询类
```json
[
  { "label": "毫米波雷达状态", "query": "毫米波雷达的状态统计" },
  { "label": "查看华为设备", "query": "华为的设备情况" },
  { "label": "查看摄像机", "query": "路侧监控摄像机的在线情况" }
]
```

---

## 16. AGENT 意图类型清单

```typescript
const INTENT_TYPES = {
  // 统计查询
  SIMPLE_STAT: 'simple_stat',
  ONLINE_COUNT: 'online_count',
  OFFLINE_COUNT: 'offline_count',
  ABNORMAL_COUNT: 'abnormal_count',
  ONLINE_RATE: 'online_rate',
  
  // 对比分析
  COMPARE: 'compare',
  TREND: 'trend',
  
  // 报表生成
  GENERATE_REPORT: 'generate_report',
  DAILY_REPORT: 'daily_report',
  WEEKLY_REPORT: 'weekly_report',
  COMPARISON_REPORT: 'comparison_report',
  
  // 异常排查
  LIST_DEVICES: 'list_devices',
  LONG_OFFLINE: 'long_offline',
  NEW_OFFLINE: 'new_offline',
  
  // 筛选查询
  FILTER_BY_TYPE: 'filter_by_type',
  FILTER_BY_MANUFACTURER: 'filter_by_manufacturer',
  FILTER_BY_REGION: 'filter_by_region',
  
  // 其他
  UNKNOWN: 'unknown'
}
```

---

## 17. 关键依赖检查清单

- [x] React 18（已安装）
- [x] TypeScript 5（已安装）
- [x] Ant Design 5（已安装）
- [x] Vite 5（已安装）
- [x] Express 4（已安装）
- [x] XLSX（已安装）
- [x] docx（已安装）
- [x] html2canvas（已安装）
- [x] jspdf（已安装）
- [ ] DeepSeek/OpenAI SDK（待选）
- [ ] file-saver 类型定义（已安装@types/file-saver）

---

## 18. 开发进度标记

| 功能模块 | 状态 | 完成度 |
|---------|------|--------|
| 项目设计文档 | ✅ 完成 | 100% |
| 后端 AGENT 中间层 | ⏳ 待开发 | 0% |
| 后端 API 接口 | ⏳ 待开发 | 0% |
| 前端 AGENT UI 组件 | ⏳ 待开发 | 0% |
| 前端类型与服务 | ⏳ 待开发 | 0% |
| 集成与测试 | ⏳ 待开发 | 0% |

