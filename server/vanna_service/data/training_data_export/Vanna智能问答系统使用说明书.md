# Vanna AI 智能问答系统 - 完整使用说明书

> **版本**: v2.0  
> **更新日期**: 2026-06-30  
> **适用环境**: Windows / Node.js 18+ / Python 3.13+

---

## 目录

1. [系统概述](#1-系统概述)
2. [快速启动](#2-快速启动)
3. [智能问答页面使用指南](#3-智能问答页面使用指南)
4. [训练管理中心使用指南](#4-训练管理中心使用指南)
5. [API 接口参考](#5-api-接口参考)
6. [常见问题与故障排除](#6-常见问题与故障排除)
7. [最佳实践](#7-最佳实践)
8. [附录](#8-附录)

---

## 1. 系统概述

### 1.1 什么是 Vanna AI 智能问答系统？

Vanna AI 智能问答系统是一个基于 **Text-to-SQL** 技术的运维数据智能查询平台。用户可以用自然语言提问，系统自动将问题转换为 SQL 查询，从数据库中获取数据并以自然语言回答。

### 1.2 系统架构

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  前端 React  │────▶│  Node.js 代理 │────▶│  Python API  │
│  Port 3000   │◀────│  Port 3001   │◀────│  Port 3002   │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                    ┌────────────┴────────────┐
                                    │                         │
                              ┌─────▼─────┐          ┌───────▼───────┐
                              │ SQLite DB  │          │ 向量数据库     │
                              │  app.db    │          │vanna_vectors.db│
                              ───────────┘          └───────────────┘
```

| 服务 | 端口 | 技术栈 | 说明 |
|------|------|--------|------|
| 前端 | 3000 | React + TypeScript + Ant Design | 用户界面 |
| 后端代理 | 3001 | Node.js + Express | API 代理 + 业务逻辑 |
| Vanna AI | 3002 | Python + FastAPI + Uvicorn | Text-to-SQL 核心引擎 |

### 1.3 核心功能

- **自然语言问答**：用中文提问，自动查询数据库并回答
- **关键词快速匹配**：已训练问题 <0.3 秒响应，无需调用大模型
- **LLM 智能生成**：未训练问题调用火山引擎大模型生成 SQL
- **多轮对话**：支持上下文追问、实体识别
- **图表可视化**：自动为统计数据生成图表
- **训练管理**：DDL/SQL/文档三类训练数据管理
- **基准测试**：训练前后效果对比

### 1.4 数据概览

| 数据表 | 记录数 | 说明 |
|--------|--------|------|
| devices | 17,871 | 设备快照数据（多日期） |
| snapshots | 7 | 快照导入记录 |
| latency_reports | 100 | 网络延迟报告 |
| conversations | 60+ | 用户对话记录 |
| messages | 130+ | 对话消息记录 |

---

## 2. 快速启动

### 2.1 环境要求

| 组件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | 18+ | 前端 + 后端代理 |
| Python | 3.13+ | Vanna AI 服务 |
| npm | 9+ | 包管理器 |
| 火山引擎 ARK | - | LLM 推理服务（需配置 API Key） |

### 2.2 启动步骤

**第一步：安装依赖**

```bash
# 前端依赖
cd monitor
npm install

# Python 依赖
cd server/vanna_service
pip install -r requirements.txt
```

**第二步：配置环境变量**

编辑 `server/vanna_service/.env` 文件：

```env
# 火山引擎 ARK API 配置
VOLCANO_API_KEY=your_api_key_here
VOLCANO_API_BASE=https://ark.cn-beijing.volces.com/api/v3
VOLCANO_MODEL=doubao-seed-2-1-pro-260628
```

**第三步：启动三个服务**

```bash
# 终端 1：启动前端（React 开发服务器）
cd monitor
node node_modules/vite/bin/vite.js --host

# 终端 2：启动后端代理（Node.js）
cd monitor/server
node index.js

# 终端 3：启动 Vanna AI 服务（Python）
cd monitor/server/vanna_service
python vanna_app.py
```

**第四步：验证启动**

打开浏览器访问 http://localhost:3000

### 2.3 一键启动脚本

系统提供了启动脚本：

```bash
# Windows 批处理
monitor/启动系统.bat
monitor/启动Vanna服务.bat
```

### 2.4 服务状态检查

```bash
python check_services.py
```

输出示例：
```
============================================================
系统服务状态检查
============================================================
✓ 端口 3000 (前端 (React)) - 运行中
✓ 端口 3001 (后端 API (Node.js)) - 运行中
✓ 端口 3002 (Vanna AI (Python)) - 运行中
============================================================
✓ 所有服务正常运行
```

---

## 3. 智能问答页面使用指南

### 3.1 页面布局

```
┌─────────────────────────────────────────────────────┐
│  侧边栏              │  主内容区                      │
│  ┌───────────────┐  │  ┌──────────────────────────┐ │
│  │ 历史对话列表   │  │  │ 欢迎区域 + 快捷问题卡片   │ │
│  │               │  │  │                          │ │
│  │ - 新对话      │  │  │                          │ │
│  │ - 对话1       │  │  │  对话气泡区域             │ │
│  │ - 对话2       │  │  │  ────────────────────┐  │ │
│  │               │  │  │  │ 用户: 设备总数？    │  │ │
│  │               │  │  │  │ AI: 2553台...      │  │ │
│  │               │  │  │  └────────────────────┘  │ │
│  │               │  │  │                          │ │
│  │               │  │  │  输入框 + 发送按钮        │ │
│  └───────────────┘  │  └──────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 3.2 发起新对话

1. 点击侧边栏「+ 新对话」按钮
2. 在输入框中输入自然语言问题
3. 按 Enter 或点击发送按钮

### 3.3 支持的提问方式

**基础统计类**：
- "设备总数是多少？"
- "在线设备有多少？"
- "离线设备有多少？"
- "异常设备有多少？"
- "设备在线率是多少？"

**分布对比类**：
- "各区域设备数量对比"
- "各厂商设备数量"
- "设备状态分布"
- "设备类型分布"
- "各区域设备在线率"

**TOP 排名类**：
- "各厂商设备数量TOP5"
- "哪个区域设备最多？"
- "哪个区域在线率最高？"

**区域/厂商查询类**：
- "锡山区有多少设备？"
- "海康设备有多少？"
- "海康威视设备在线率"
- "惠山区离线设备列表"

**趋势变化类**：
- "最近7天设备总数变化趋势"
- "每天设备在线率趋势"
- "近7天离线设备数量变化"

**网络质量类**：
- "平均延迟是多少？"
- "丢包率统计"
- "各区域网络延迟对比"
- "延迟最高的设备"

**组合查询类**：
- "锡山区在线设备有多少？"
- "海康在锡山区有多少设备？"
- "各区域各厂商设备数量"

### 3.4 多轮对话与追问

系统支持上下文追问，例如：

```
用户：各区域设备数量对比
AI：经开区 1026 台，锡山区 847 台...

用户：锡山区呢？（追问，系统理解是在问锡山区设备数）
AI：锡山区有 847 台设备...

用户：在线率呢？（追问，系统理解是在问锡山区在线率）
AI：锡山区设备在线率为 XX%...
```

### 3.5 响应速度说明

| 场景 | 响应时间 | 说明 |
|------|----------|------|
| 已训练问题（关键词匹配） | <0.3 秒 | 直接匹配 SQL，无需调用 LLM |
| 未训练问题（LLM 生成） | 3-10 秒 | 需要调用火山引擎大模型 |
| 流式响应 | 实时 | 回答内容逐字显示 |

### 3.6 历史对话管理

- **查看历史**：侧边栏显示最近对话列表
- **切换对话**：点击历史对话标题切换
- **删除对话**：点击对话旁的删除按钮
- **清空全部**：点击「清空对话」按钮

---

## 4. 训练管理中心使用指南

### 4.1 页面布局

```
┌─────────────────────────────────────────────────────┐
│  侧边栏              │  主内容区                      │
│  ───────────────┐  │  ──────────────────────────┐ │
│  │ 训练总览       │  │  │ 统计卡片（DDL/SQL/DOC/总计）│ │
│  │ DDL 训练       │  │  │                          │ │
│  │ SQL 问答对     │  │  │ 训练效果对比 + 基准测试   │ │
│  │ 文档训练       │  │  │                          │ │
│  │ 数据管理       │  │  │ 从历史数据生成训练         │ │
│  │               │  │  │                          │ │
│  │               │  │  │ 训练历史记录               │ │
│  └───────────────┘  │  └──────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 4.2 训练总览

**统计卡片**：显示当前训练数据总量
- DDL 语句数量
- SQL 问答对数量
- 文档数量
- 总计

**训练效果对比**：
- 点击「运行基准测试」按钮
- 系统自动执行 10 个标准问题
- 显示训练前/后成功率对比

**从历史数据生成训练**：
- 点击「近 7 天」或「近 30 天」按钮
- 系统自动从设备快照数据生成 SQL 问答对
- 生成后自动训练

### 4.3 DDL 训练

**作用**：告诉系统数据库有哪些表和字段。

**操作步骤**：
1. 点击侧边栏「DDL 训练」
2. 在文本框中输入 CREATE TABLE 语句
3. 点击「训练 DDL」按钮
4. 看到「DDL 训练成功」提示

**快捷模板**：页面提供 3 个预设模板（设备表、快照表、时延报告表），点击即可填入。

**示例**：
```sql
CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    device_code TEXT NOT NULL,
    product_name TEXT,
    manufacturer_name TEXT,
    region TEXT,
    status TEXT,
    snapshot_date TEXT NOT NULL
);
```

### 4.4 SQL 问答对训练

**作用**：建立「自然语言问题 → SQL 查询」的映射关系，是关键词快速匹配的基础。

**操作步骤**：
1. 点击侧边栏「SQL 问答对」
2. 输入问题（如："设备总数是多少？"）
3. 输入对应的 SQL 语句
4. 点击「训练 SQL」按钮

**快捷模板**：页面提供 7 个常用 SQL 问答对模板。

**编写技巧**：
- 一个问题可以对应多条 SQL（不同问法）
- SQL 必须能在 SQLite 中正确执行
- 设备查询必须指定 `snapshot_date` 条件
- 使用最新日期：`snapshot_date = (SELECT MAX(snapshot_date) FROM devices)`

### 4.5 文档训练

**作用**：补充业务背景知识，帮助 LLM 理解业务术语。

**操作步骤**：
1. 点击侧边栏「文档训练」
2. 输入文档内容（业务知识、术语解释等）
3. 可选：输入标签（逗号分隔）
4. 点击「训练文档」按钮

**建议内容**：
- 业务规则说明
- 字段含义解释
- 查询技巧与最佳实践
- 常见问题 FAQ

### 4.6 数据管理

**功能**：查看、编辑、删除所有训练数据。

**操作**：
- **筛选**：使用下拉框按类型筛选（全部/DDL/SQL/文档）
- **编辑**：点击编辑按钮修改 SQL 问答对
- **删除**：点击删除按钮移除训练数据
- **刷新**：点击刷新按钮重新加载数据
- **分页**：底部支持翻页浏览

### 4.7 训练历史

**功能**：记录每次训练操作的时间和结果。

**显示内容**：
- 训练时间
- 训练状态（成功/失败）
- 各类型训练数据数量
- 总计

### 4.8 一键生成训练数据

系统提供了完整的训练数据生成脚本：

```bash
cd monitor/server/vanna_service
python generate_training_data.py
```

**脚本功能**：
1. 自动从数据库提取表结构并训练 DDL（5 张表）
2. 生成覆盖全业务场景的 60+ 条 SQL 问答对
3. 训练 4 篇业务文档
4. 自动导出训练数据到 JSON 文件

**输出**：
```
【训练完成 - 状态汇总】
  DDL 表结构: 5 条
  SQL 问答对: 62 条
  业务文档:   4 篇
  总计:       71 条
```

---

## 5. API 接口参考

### 5.1 智能问答 API

#### POST /api/vanna/ask

发送自然语言问题，获取回答。

**请求体**：
```json
{
  "question": "设备总数是多少？",
  "user_id": "web-user",
  "conversationId": "可选，对话ID"
}
```

**响应**：
```json
{
  "answer": "根据2026年6月16日的设备快照统计，设备总数为2553台。",
  "sql": "SELECT COUNT(*) as total FROM devices WHERE snapshot_date = '2026-06-16'",
  "data": [{"total": 2553}],
  "conversation_id": "xxx-xxx-xxx"
}
```

#### POST /api/vanna/ask/stream

SSE 流式问答接口。

**响应事件类型**：
- `conversation_id`：对话 ID
- `content`：回答内容片段
- `sql`：生成的 SQL
- `data`：查询结果数据
- `validation`：数据验证结果
- `done`：完成信号
- `error`：错误信息

### 5.2 对话管理 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/vanna/conversations` | GET | 获取对话列表（参数：user_id） |
| `/api/vanna/conversations/new` | POST | 创建新对话（参数：userId） |
| `/api/vanna/conversations/{id}` | GET | 获取对话详情 |
| `/api/vanna/conversations/{id}` | DELETE | 删除对话 |
| `/api/vanna/conversations/{id}/messages` | GET | 获取对话消息（参数：offset, limit） |
| `/api/vanna/conversations/clear_all` | POST | 清空用户所有对话 |

### 5.3 训练 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/vanna/train/ddl` | POST | 训练 DDL（body: ddl_sql） |
| `/api/vanna/train/sql` | POST | 训练 SQL 对（body: question, sql） |
| `/api/vanna/train/doc` | POST | 训练文档（body: content, tags） |
| `/api/vanna/train/status` | GET | 获取训练状态 |
| `/api/vanna/train/reset` | POST | 重置所有训练数据 |

### 5.4 训练管理 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/vanna/training/history` | GET | 获取训练历史 |
| `/api/vanna/training/data` | GET | 获取训练数据列表（参数：type, page, page_size） |
| `/api/vanna/training/data/{id}` | PUT | 更新训练数据 |
| `/api/vanna/training/data/{id}` | DELETE | 删除训练数据 |
| `/api/vanna/training/benchmark` | GET | 运行基准测试 |
| `/api/vanna/training/generate_from_json` | POST | 从 JSON 生成训练数据（body: days, auto_train） |

### 5.5 图表 API

#### POST /api/vanna/chart

根据 SQL 生成图表配置。

**请求体**：
```json
{
  "sql": "SELECT region, COUNT(*) as count FROM devices GROUP BY region",
  "chart_type": "bar"
}
```

**响应**：
```json
{
  "type": "bar",
  "config": { ... }
}
```

---

## 6. 常见问题与故障排除

### 6.1 服务启动问题

**Q: 端口被占用怎么办？**

检查端口占用：
```bash
netstat -ano | findstr "3000 3001 3002"
```
结束占用进程后重新启动。

**Q: Python 服务启动失败？**

检查 Python 版本：
```bash
python --version
```
确保 Python >= 3.13，并安装所有依赖：
```bash
pip install -r requirements.txt
```

**Q: 前端页面无法访问？**

确保三个服务都已启动，检查浏览器控制台是否有错误。

### 6.2 问答相关问题

**Q: 回答很慢怎么办？**

- 已训练问题应 <0.3 秒响应（关键词匹配）
- 未训练问题需要 3-10 秒（LLM 调用）
- 解决方案：将常用问题加入训练数据

**Q: 回答不准确怎么办？**

1. 检查训练数据中是否有对应的 SQL 问答对
2. 确保 SQL 能正确执行并返回数据
3. 增加更多问法的训练数据
4. 补充业务文档帮助 LLM 理解

**Q: 查询结果为空？**

最常见原因：没有指定 `snapshot_date` 条件。

正确写法：
```sql
SELECT COUNT(*) FROM devices 
WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM devices)
```

### 6.3 训练相关问题

**Q: 训练历史显示"暂无训练历史"？**

修复：页面初始加载时会自动加载训练历史。如果仍然不显示，点击「刷新」按钮。

**Q: 训练数据删除后还在？**

删除操作需要刷新页面才能看到最新状态。点击「刷新」按钮。

**Q: 如何备份训练数据？**

运行生成脚本会自动导出：
```bash
python generate_training_data.py
```
导出文件位于 `data/training_data_export/` 目录。

### 6.4 LLM 相关问题

**Q: LLM 返回空白回答？**

检查 `.env` 文件中的 API Key 是否正确，以及火山引擎控制台是否已激活对应模型。

**Q: LLM 调用超时？**

火山引擎 API 响应时间通常 3-10 秒。如果持续超时，检查网络连接和 API 配额。

---

## 7. 最佳实践

### 7.1 训练策略

**1. 先基础后复杂**
- 先训练 DDL 和基础统计查询
- 再逐步增加复杂查询和组合查询

**2. 质量优先于数量**
- 50 条高质量问答对 > 200 条低质量问答对
- 每条 SQL 都应经过验证确保可执行

**3. 覆盖高频问题**
- 分析用户实际提问，优先训练高频问题
- 参考历史对话，补充用户常问的问题

**4. 定期更新**
- 业务变化时及时更新训练数据
- 每月回顾一次训练效果

### 7.2 SQL 编写规范

**1. 使用最新快照日期**
```sql
WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM devices)
```

**2. 过滤空值**
```sql
WHERE region IS NOT NULL AND region != ''
```

**3. 明确排序**
```sql
ORDER BY count DESC
```

**4. 友好的列别名**
```sql
SELECT COUNT(*) as 设备总数 FROM devices
```

### 7.3 性能优化

- 已训练问题通过关键词匹配快速响应（<0.3 秒）
- 确保问题中包含可匹配的关键词
- SQL 问答对保持 50-100 条为宜

### 7.4 数据安全

- 定期导出训练数据到 JSON 文件备份
- 训练脚本纳入版本控制
- 在测试环境验证后再部署到生产

---

## 8. 附录

### 8.1 文件结构

```
monitor/
├── src/                          # 前端源码
│   ├── pages/
│   │   ├── VannaPage.tsx         # 智能问答页面
│   │   ├── VannaTrainPage.tsx    # 训练管理页面
│   │   └── ...
│   ── services/
│       └── vannaApi.ts           # 前端 API 服务
├── server/
│   ├── index.js                  # Node.js 后端代理
│   ├── routes/
│   │   └── vanna.js              # Vanna 代理路由
│   └── vanna_service/            # Python Vanna 服务
│       ├── vanna_app.py          # 主应用入口
│       ├── api/
│       │   ├── chat.py           # 聊天 API
│       │   ├── train.py          # 训练 API
│       │   └── training.py       # 训练管理 API
│       ├── services/
│       │   ├── vanna_manager.py  # 核心管理器
│       │   ├── db_connector.py   # 数据库连接
│       │   └── context_manager.py # 对话上下文
│       ├── data/
│       │   ├── app.db            # 业务数据库
│       │   └── vanna_vectors.db  # 向量数据库
│       ├── generate_training_data.py  # 训练数据生成脚本
│       ├── verify_training.py         # 训练效果验证脚本
│       └── test_basic.py             # 基础功能测试脚本
└── package.json
```

### 8.2 数据库表结构

**devices 表**（设备快照）：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 设备唯一标识 |
| device_code | TEXT | 设备编码 |
| product_name | TEXT | 产品名称 |
| manufacturer_name | TEXT | 厂商名称 |
| device_type_name | TEXT | 设备类型 |
| region | TEXT | 所属区域 |
| status | TEXT | 状态（在线/离线/异常） |
| snapshot_date | TEXT | 快照日期 |
| location | TEXT | 具体位置 |
| ip_address | TEXT | IP 地址 |
| maintenance_unit | TEXT | 维护单位 |

**latency_reports 表**（网络延迟）：
| 字段 | 类型 | 说明 |
|------|------|------|
| device_code | TEXT | 设备编码 |
| device_name | TEXT | 设备名称 |
| region | TEXT | 所属区域 |
| avg_latency_ms | REAL | 平均延迟（毫秒） |
| max_latency_ms | REAL | 最大延迟（毫秒） |
| packet_loss_rate | REAL | 丢包率 |

### 8.3 测试命令汇总

```bash
# 检查服务状态
python check_services.py

# 运行基础功能测试（10 个测试用例）
python test_basic.py

# 验证训练效果（19 个测试用例）
python verify_training.py

# 关键词匹配快速测试
python test_keyword_match.py

# 生成完整训练数据
python generate_training_data.py
```

### 8.4 当前训练数据状态

| 类型 | 数量 | 说明 |
|------|------|------|
| DDL 表结构 | 6 条 | devices, snapshots, latency_reports, conversations, messages + test |
| SQL 问答对 | 240+ 条 | 覆盖 10 大业务分类 |
| 业务文档 | 10 篇 | 业务说明、字段说明、查询技巧、FAQ 等 |
| **总计** | **250+ 条** | - |

**基准测试结果**：100% 成功率（10/10 问题全部正确回答）

---

**文档版本**: v2.0  
**最后更新**: 2026-06-30  
**维护者**: 运维管理系统开发团队
