# Vanna AI 智能问答系统 - 完整训练管理教程

## 目录

1. [系统概述](#1-系统概述)
2. [训练数据类型](#2-训练数据类型)
3. [快速开始 - 一键训练](#3-快速开始---一键训练)
4. [详细训练步骤](#4-详细训练步骤)
5. [训练数据管理](#5-训练数据管理)
6. [训练效果验证](#6-训练效果验证)
7. [常见问题与故障排除](#7-常见问题与故障排除)
8. [最佳实践与建议](#8-最佳实践与建议)

---

## 1. 系统概述

### 1.1 系统简介

Vanna AI 智能问答系统是基于 Text-to-SQL 技术的运维数据智能查询平台。用户可以通过自然语言提问，系统自动生成 SQL 查询数据库并返回结果。

训练是提升问答准确率的核心环节。通过训练，系统学习：
- 数据库表结构和字段含义
- 常见问题与 SQL 的对应关系
- 业务规则和查询技巧

### 1.2 训练架构

```
用户提问 → 关键词匹配（快速路径）→ 命中训练SQL对 → 直接执行
                ↓ 未命中
            LLM 生成 SQL → 执行查询 → 返回结果
```

- **关键词匹配**：优先匹配已训练的 SQL 问答对，响应快（<2秒），准确率高
- **LLM 兜底**：未匹配时调用大模型生成 SQL，响应慢（5-10秒），依赖模型能力

### 1.3 训练数据存储位置

- **向量数据库**：`data/vanna_vectors.db`（SQLite 向量存储）
- **业务数据库**：`data/app.db`（设备快照数据）
- **训练数据导出**：`data/training_data_export/`（JSON 格式备份）

---

## 2. 训练数据类型

### 2.1 DDL 表结构训练

**作用**：告诉系统数据库有哪些表、表有哪些字段、字段类型是什么。

**格式**：标准的 `CREATE TABLE` SQL 语句。

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

**数量建议**：覆盖所有业务表，一般 3-10 条。

### 2.2 SQL 问答对训练

**作用**：建立「自然语言问题 → SQL 查询」的映射关系，是关键词匹配的基础。

**格式**：问题 + SQL 语句。

**示例**：
```
问题：设备总数是多少？
SQL：SELECT COUNT(*) as total FROM devices WHERE snapshot_date = '2026-06-16'
```

**分类建议**：
| 分类 | 数量 | 说明 |
|------|------|------|
| 基础统计 | 4-6 条 | 总数、总计等 |
| 设备状态 | 8-12 条 | 在线/离线/异常统计 |
| 区域分布 | 10-15 条 | 各区域统计、区域在线率 |
| 厂商分布 | 8-10 条 | 厂商排名、厂商在线率 |
| 设备类型 | 5-8 条 | 类型分布、各类型数量 |
| 维护单位 | 3-5 条 | 维护单位统计 |
| 趋势变化 | 4-6 条 | 近7天/30天变化趋势 |
| 网络延迟 | 5-8 条 | 延迟统计、丢包率 |
| 组合查询 | 5-10 条 | 区域+状态、厂商+区域等 |
| 详细信息 | 3-5 条 | 设备详情、IP列表等 |

**总数建议**：50-100 条高质量 SQL 问答对。

### 2.3 业务文档训练

**作用**：补充业务背景知识，帮助 LLM 理解业务术语和查询规则。

**格式**：自由文本，支持 Markdown。

**建议内容**：
1. **业务说明文档**：系统介绍、数据表说明、状态枚举含义
2. **字段说明文档**：各表字段详细解释、数据字典
3. **查询技巧文档**：SQL 查询最佳实践、时间范围计算、在线率公式
4. **常见问题 FAQ**：用户常见疑问解答

---

## 3. 快速开始 - 一键训练

### 3.1 使用训练脚本（推荐）

系统提供了一键生成完整训练数据的脚本。

**执行命令**：
```bash
cd monitor/server/vanna_service
python generate_training_data.py
```

**脚本功能**：
1. 自动从数据库提取表结构并训练 DDL
2. 生成覆盖全业务场景的 60+ 条 SQL 问答对
3. 训练 4 篇业务文档（业务说明、字段说明、查询技巧、FAQ）
4. 自动导出训练数据到 JSON 文件

**输出示例**：
```
【训练完成 - 状态汇总】
  DDL 表结构: 5 条
  SQL 问答对: 62 条
  业务文档:   4 篇
  总计:       71 条
```

### 3.2 使用训练管理页面

**访问地址**：http://localhost:3000/train

**操作步骤**：
1. 启动前端和后端服务
2. 访问训练管理页面
3. 点击「从 JSON 生成训练数据」按钮
4. 等待训练完成

---

## 4. 详细训练步骤

### 4.1 第一步：训练 DDL 表结构

**为什么要训练 DDL？**
- 系统需要知道数据库有哪些表和字段
- LLM 生成 SQL 时需要表结构作为上下文
- 是整个问答系统的基础

**训练方法 1：自动提取（推荐）**

系统启动时会自动从数据库提取表结构进行训练。也可以手动触发：

```python
from services.vanna_manager import VannaManager
from services.db_connector import DBConnector

vm = VannaManager()
vm.init_vanna()
db = DBConnector()

for table in db.get_table_names():
    ddl = db.get_table_schema(table)
    vm.train_ddl(ddl)
```

**训练方法 2：通过 API**

```bash
# 训练单个 DDL
curl -X POST http://localhost:3002/api/vanna/train/ddl \
  -H "Content-Type: application/json" \
  -d '{"ddl_sql": "CREATE TABLE devices (...)"}'
```

**训练方法 3：通过前端页面**

1. 进入训练管理页面
2. 选择「DDL 训练」标签页
3. 粘贴 DDL 语句
4. 点击「训练」按钮

**验证**：
```bash
curl http://localhost:3002/api/vanna/train/status
# 返回 ddl_count 应 > 0
```

### 4.2 第二步：训练 SQL 问答对

**为什么要训练 SQL 问答对？**
- 已训练问题通过关键词匹配快速响应（<2秒）
- 减少 LLM 调用，降低成本
- 提高准确率，避免 LLM 生成错误 SQL

**训练方法 1：批量生成脚本（推荐）**

使用 `generate_training_data.py` 脚本，自动生成 60+ 条覆盖全场景的 SQL 问答对。

**训练方法 2：手动单条训练**

```python
vm.train_sql("设备总数是多少？", "SELECT COUNT(*) as total FROM devices WHERE snapshot_date = '2026-06-16'")
```

**训练方法 3：通过 API**

```bash
curl -X POST http://localhost:3002/api/vanna/train/sql \
  -H "Content-Type: application/json" \
  -d '{
    "question": "设备总数是多少？",
    "sql": "SELECT COUNT(*) as total FROM devices WHERE snapshot_date = '\''2026-06-16'\''"
  }'
```

**训练方法 4：通过前端页面**

1. 进入训练管理页面
2. 选择「SQL 训练」标签页
3. 输入问题和 SQL 语句
4. 点击「训练」按钮

**编写高质量 SQL 问答对的技巧**：

1. **覆盖多种问法**：
   ```
   设备总数是多少？
   总共有多少台设备？
   设备总量统计
   一共有多少设备
   ```

2. **包含快照日期**：
   所有设备查询必须指定 `snapshot_date`，否则查询结果为空。

3. **覆盖所有区域和主要厂商**：
   为每个区域、每个主要厂商各准备 1-2 条问答对。

4. **由简到难**：
   从简单的统计查询开始，逐步增加组合查询、趋势查询。

5. **SQL 要可执行**：
   确保训练的 SQL 能正确执行并返回数据，否则测试时会失败。

### 4.3 第三步：训练业务文档

**为什么要训练业务文档？**
- 补充 LLM 的业务知识
- 帮助理解专业术语
- 提供查询技巧和最佳实践

**训练方法 1：脚本批量训练**

`generate_training_data.py` 脚本包含 4 篇预置文档，自动训练。

**训练方法 2：手动训练**

```python
content = """【业务说明】
设备状态说明：
- 在线：设备正常运行
- 离线：设备网络不可达
- 异常：设备运行异常
"""
vm.train_doc(content, tags=["业务说明", "状态"])
```

**训练方法 3：通过 API**

```bash
curl -X POST http://localhost:3002/api/vanna/train/doc \
  -H "Content-Type: application/json" \
  -d '{
    "content": "文档内容...",
    "tags": ["业务", "说明"]
  }'
```

**训练方法 4：通过前端页面**

1. 进入训练管理页面
2. 选择「文档训练」标签页
3. 输入文档内容和标签
4. 点击「训练」按钮

---

## 5. 训练数据管理

### 5.1 查看训练状态

**API 方式**：
```bash
curl http://localhost:3002/api/vanna/train/status
```

**返回示例**：
```json
{
  "ddl_count": 5,
  "sql_count": 62,
  "doc_count": 4,
  "total": 71
}
```

**前端方式**：
- 训练管理页面「总览」标签页
- 显示各类型训练数据数量统计卡片

### 5.2 查看训练数据列表

**API 方式**：
```bash
# 查看所有训练数据
curl "http://localhost:3002/api/vanna/training/data?page=1&page_size=20"

# 按类型过滤
curl "http://localhost:3002/api/vanna/training/data?type=sql&page=1&page_size=20"
```

**前端方式**：
- 训练管理页面「训练数据」标签页
- 支持按类型筛选（全部/DDL/SQL/文档）
- 支持分页浏览

### 5.3 更新训练数据

**API 方式**：
```bash
curl -X PUT http://localhost:3002/api/vanna/training/data/{data_id} \
  -H "Content-Type: application/json" \
  -d '{
    "question": "更新后的问题",
    "sql": "SELECT ..."
  }'
```

**前端方式**：
1. 在训练数据列表中找到要修改的条目
2. 点击「编辑」按钮
3. 修改内容后保存

### 5.4 删除训练数据

**API 方式**：
```bash
curl -X DELETE http://localhost:3002/api/vanna/training/data/{data_id}
```

**前端方式**：
1. 在训练数据列表中找到要删除的条目
2. 点击「删除」按钮
3. 确认删除

### 5.5 重置所有训练数据

⚠️ **危险操作**：这会删除所有训练数据，请先导出备份！

**API 方式**：
```bash
curl -X POST http://localhost:3002/api/vanna/train/reset
```

**前端方式**：
- 训练管理页面 → 系统操作 → 重置训练

### 5.6 导出训练数据

使用训练脚本自动导出：
```bash
python generate_training_data.py
# 导出到 data/training_data_export/ 目录
```

导出文件：
- `ddl_training_data.json` - DDL 训练数据
- `sql_training_data.json` - SQL 问答对训练数据
- `doc_training_data.json` - 业务文档训练数据

---

## 6. 训练效果验证

### 6.1 基准测试

系统提供基准测试功能，评估训练效果。

**API 方式**：
```bash
curl http://localhost:3002/api/vanna/training/benchmark
```

**返回示例**：
```json
{
  "before": { "success_rate": 60.0, "results": [] },
  "after": { "success_rate": 92.5, "results": [...] },
  "improvement": 32.5
}
```

**前端方式**：
- 训练管理页面「基准测试」标签页
- 点击「运行基准测试」按钮
- 查看训练前后的成功率对比

### 6.2 手动测试

**测试步骤**：
1. 访问智能问答页面（http://localhost:3000）
2. 输入测试问题
3. 检查回答是否正确
4. 检查响应速度

**测试用例清单**：

| 编号 | 测试问题 | 预期结果 | 响应时间 |
|------|----------|----------|----------|
| 1 | 设备总数是多少？ | 返回正确的设备总数 | <2秒 |
| 2 | 在线设备有多少？ | 返回在线设备数量 | <2秒 |
| 3 | 各区域设备数量对比 | 返回各区域设备数 | <2秒 |
| 4 | 设备状态分布 | 返回各状态设备数 | <2秒 |
| 5 | 锡山区有多少设备？ | 返回锡山区设备数 | <2秒 |
| 6 | 海康设备在线率 | 返回海康在线率 | <2秒 |
| 7 | 最近7天设备总数变化 | 返回7天趋势数据 | <5秒 |
| 8 | 平均延迟是多少？ | 返回平均延迟值 | <2秒 |
| 9 | 列出所有离线设备 | 返回离线设备列表 | <2秒 |
| 10 | 各厂商设备数量TOP5 | 返回TOP5厂商 | <2秒 |

### 6.3 验证关键词匹配

确认已训练问题走快速路径（响应时间 <2秒）：

```python
import time
from services.vanna_manager import VannaManager

vm = VannaManager()
vm.init_vanna()

question = "设备总数是多少？"
start = time.time()
result = vm.ask(question)
elapsed = time.time() - start

print(f"问题: {question}")
print(f"响应时间: {elapsed:.2f}秒")
print(f"答案: {result['answer'][:100]}")
print(f"SQL: {result['sql'][:100]}")

# 验证：响应时间应 < 2 秒
assert elapsed < 2.0, f"响应过慢: {elapsed:.2f}秒"
```

---

## 7. 常见问题与故障排除

### 7.1 训练失败

**问题**：调用训练 API 返回错误

**排查步骤**：
1. 检查 Vanna 服务是否启动
2. 检查向量数据库是否可写
3. 查看日志文件 `vanna_service.log`

**常见原因**：
- DDL 语法错误 → 检查 CREATE TABLE 语句是否正确
- SQL 语法错误 → 检查 SQL 是否能在 SQLite 中执行
- 向量数据库损坏 → 删除 `vanna_vectors.db` 重新训练

### 7.2 已训练问题仍然很慢

**问题**：明明训练了问题，但响应还是很慢（>5秒）

**可能原因**：
1. 关键词匹配失败，走了 LLM 路径
2. 训练的问题和提问方式差异太大
3. 向量数据库中没有对应的 SQL 对

**排查方法**：
```python
# 检查是否有训练的SQL对
sql_pairs = vm.vn.get_similar_question_sql("你的问题")
print(f"找到 {len(sql_pairs)} 条相似问题")
for pair in sql_pairs:
    print(f"  {pair['question']}")
```

**解决方法**：
- 增加更多问法的 SQL 问答对
- 确保问题包含关键词（在线率、离线设备、各区域等）
- 检查 `_match_sql_by_keyword` 方法的匹配逻辑

### 7.3 SQL 执行错误

**问题**：返回 SQL 执行错误

**常见错误**：
- `no such table` → 表不存在，检查 DDL 是否训练
- `no such column` → 字段不存在，检查字段名是否正确
- `SQL logic error` → SQL 语法错误

**解决方法**：
1. 先在 SQLite 中手动执行 SQL 确认正确
2. 修正训练数据中的 SQL
3. 重新训练

### 7.4 查询结果为空

**问题**：SQL 执行成功但返回 0 条数据

**常见原因**：
1. 没有指定 `snapshot_date` 条件
2. snapshot_date 不存在
3. 过滤条件太严格

**解决方法**：
- 确保所有设备查询都有 `snapshot_date` 条件
- 使用最新快照日期：`snapshot_date = (SELECT MAX(snapshot_date) FROM devices)`
- 检查数据库中是否有对应日期的数据

### 7.5 训练数据丢失

**问题**：重启后训练数据不见了

**原因**：向量数据库路径配置错误，或数据被删除。

**解决方法**：
1. 检查 `VANNA_SQLITE_DB_PATH` 环境变量
2. 确认 `data/vanna_vectors.db` 文件存在
3. 从 JSON 备份文件恢复训练数据

---

## 8. 最佳实践与建议

### 8.1 训练策略

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

### 8.2 SQL 编写规范

**1. 使用最新快照日期**
```sql
-- 推荐：使用子查询获取最新日期
SELECT COUNT(*) FROM devices 
WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM devices)
```

**2. 过滤空值**
```sql
-- 推荐：统计时过滤空值
SELECT region, COUNT(*) FROM devices 
WHERE region IS NOT NULL AND region != ''
GROUP BY region
```

**3. 明确排序**
```sql
-- 推荐：添加 ORDER BY，结果更可读
SELECT manufacturer_name, COUNT(*) as count 
FROM devices 
GROUP BY manufacturer_name 
ORDER BY count DESC
```

**4. 友好的列别名**
```sql
-- 推荐：使用中文或有意义的别名
SELECT 
  COUNT(*) as 设备总数,
  SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) as 在线数量
FROM devices
```

### 8.3 性能优化

**1. 利用关键词匹配**
- 已训练问题通过关键词匹配快速响应
- 确保问题中包含可匹配的关键词

**2. 合理的训练数据量**
- SQL 问答对 50-100 条为宜
- 过多的训练数据会增加匹配计算量

**3. 数据库索引**
系统已为常用字段创建索引：
- `idx_devices_snapshot_date`
- `idx_devices_region`
- `idx_devices_manufacturer`
- `idx_devices_status`
- `idx_devices_device_type`

### 8.4 数据安全

**1. 定期备份**
- 定期导出训练数据到 JSON 文件
- 备份 `vanna_vectors.db` 文件

**2. 版本管理**
- 训练脚本纳入版本控制
- 记录每次训练的变更内容

**3. 测试环境验证**
- 在测试环境验证训练效果
- 确认无误后再部署到生产

---

## 附录

### A. API 接口汇总

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/vanna/train/ddl` | POST | 训练 DDL 表结构 |
| `/api/vanna/train/sql` | POST | 训练 SQL 问答对 |
| `/api/vanna/train/doc` | POST | 训练业务文档 |
| `/api/vanna/train/status` | GET | 获取训练状态 |
| `/api/vanna/train/reset` | POST | 重置所有训练数据 |
| `/api/vanna/training/data` | GET | 获取训练数据列表 |
| `/api/vanna/training/data/{id}` | PUT | 更新训练数据 |
| `/api/vanna/training/data/{id}` | DELETE | 删除训练数据 |
| `/api/vanna/training/history` | GET | 获取训练历史 |
| `/api/vanna/training/benchmark` | GET | 运行基准测试 |
| `/api/vanna/training/generate_from_json` | POST | 从 JSON 生成训练数据 |

### B. 相关文件路径

| 文件 | 说明 |
|------|------|
| `generate_training_data.py` | 训练数据生成脚本 |
| `services/vanna_manager.py` | Vanna 核心管理器 |
| `api/train.py` | 训练 API 路由 |
| `api/training.py` | 训练管理 API 路由 |
| `data/vanna_vectors.db` | 向量数据库 |
| `data/app.db` | 业务数据库 |
| `data/training_data_export/` | 训练数据导出目录 |
| `src/pages/VannaTrainPage.tsx` | 训练管理前端页面 |

---

**文档版本**：v1.0  
**最后更新**：2026-06-25  
**适用系统版本**：Vanna AI 智能问答系统 v2.0
