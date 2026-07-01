"""
Vanna AI 智能问答系统 - 完整训练数据生成脚本
==============================================

功能：
1. DDL 表结构训练（自动从数据库提取）
2. SQL 问答对训练（覆盖设备监控全场景）
3. 业务文档训练（业务规则、字段说明、查询技巧）

使用方法：
    python generate_training_data.py

输出：
    - 自动训练到 Vanna 向量数据库
    - 同时导出训练数据到 data/training_data_export/ 目录
"""
import json
import sys
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from services.vanna_manager import VannaManager
from services.db_connector import DBConnector


def export_training_data(vm, output_dir: Path):
    """导出当前训练数据到 JSON 文件"""
    output_dir.mkdir(parents=True, exist_ok=True)

    # 获取所有训练数据
    all_data = vm.vector_store.get()
    documents = all_data.get("documents", [])
    metadatas = all_data.get("metadatas", [])
    ids = all_data.get("ids", [])

    # 按类型分组
    by_type = {"ddl": [], "sql": [], "doc": []}
    for doc, meta, id_ in zip(documents, metadatas, ids):
        t = meta.get("type", "doc") if isinstance(meta, dict) else "doc"
        if t in by_type:
            try:
                content = json.loads(doc)
            except Exception:
                content = {"raw": doc}
            by_type[t].append({
                "id": id_,
                "type": t,
                "content": content,
                "metadata": meta,
            })

    # 导出
    for t, items in by_type.items():
        file_path = output_dir / f"{t}_training_data.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        print(f"  导出 {t}: {len(items)} 条 -> {file_path.name}")

    return by_type


def train_ddl_from_db(vm, db):
    """从数据库自动提取并训练 DDL 表结构"""
    print("\n" + "=" * 60)
    print("【步骤 1】训练 DDL 表结构")
    print("=" * 60)

    tables = db.get_table_names()
    print(f"发现 {len(tables)} 张表: {', '.join(tables)}")

    count = 0
    for table in tables:
        ddl = db.get_table_schema(table)
        if ddl:
            result = vm.train_ddl(ddl)
            if result.get("status") == "success":
                count += 1
                print(f"  ✓ {table} 表训练成功")
            else:
                print(f"  ✗ {table} 表训练失败: {result.get('message')}")

    print(f"\nDDL 训练完成: 成功 {count} 张表")
    return count


def train_sql_pairs(vm, db):
    """训练 SQL 问答对（覆盖完整业务场景）"""
    print("\n" + "=" * 60)
    print("【步骤 2】训练 SQL 问答对")
    print("=" * 60)

    # 获取最新快照日期
    conn = db.get_connection()
    row = conn.execute("SELECT MAX(snapshot_date) as max_date FROM devices").fetchone()
    latest_date = row["max_date"] if row else "2026-06-16"
    conn.close()
    print(f"使用最新快照日期: {latest_date}")

    sql_pairs = [
        # ========== 基础统计类 ==========
        {
            "category": "基础统计",
            "question": "设备总数是多少？",
            "sql": f"SELECT COUNT(*) as total FROM devices WHERE snapshot_date = '{latest_date}'"
        },
        {
            "category": "基础统计",
            "question": "总共有多少台设备？",
            "sql": f"SELECT COUNT(*) as total FROM devices WHERE snapshot_date = '{latest_date}'"
        },
        {
            "category": "基础统计",
            "question": "设备总量统计",
            "sql": f"SELECT COUNT(*) as total FROM devices WHERE snapshot_date = '{latest_date}'"
        },
        {
            "category": "基础统计",
            "question": "一共有多少设备",
            "sql": f"SELECT COUNT(*) as total FROM devices WHERE snapshot_date = '{latest_date}'"
        },

        # ========== 设备状态类 ==========
        {
            "category": "设备状态",
            "question": "设备状态分布",
            "sql": f"SELECT status, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' GROUP BY status ORDER BY count DESC"
        },
        {
            "category": "设备状态",
            "question": "各状态设备数量",
            "sql": f"SELECT status, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' GROUP BY status ORDER BY count DESC"
        },
        {
            "category": "设备状态",
            "question": "在线设备有多少？",
            "sql": f"SELECT COUNT(*) as online_count FROM devices WHERE snapshot_date = '{latest_date}' AND status = '在线'"
        },
        {
            "category": "设备状态",
            "question": "在线设备数量",
            "sql": f"SELECT COUNT(*) as online_count FROM devices WHERE snapshot_date = '{latest_date}' AND status = '在线'"
        },
        {
            "category": "设备状态",
            "question": "离线设备有多少？",
            "sql": f"SELECT COUNT(*) as offline_count FROM devices WHERE snapshot_date = '{latest_date}' AND status = '离线'"
        },
        {
            "category": "设备状态",
            "question": "列出所有离线设备",
            "sql": f"SELECT device_code, product_name, manufacturer_name, region, location FROM devices WHERE snapshot_date = '{latest_date}' AND status = '离线' ORDER BY region"
        },
        {
            "category": "设备状态",
            "question": "离线设备列表",
            "sql": f"SELECT device_code, product_name, manufacturer_name, region, location FROM devices WHERE snapshot_date = '{latest_date}' AND status = '离线' ORDER BY region"
        },
        {
            "category": "设备状态",
            "question": "异常设备有多少？",
            "sql": f"SELECT COUNT(*) as abnormal_count FROM devices WHERE snapshot_date = '{latest_date}' AND status = '异常'"
        },
        {
            "category": "设备状态",
            "question": "异常设备列表",
            "sql": f"SELECT device_code, product_name, manufacturer_name, region, location FROM devices WHERE snapshot_date = '{latest_date}' AND status = '异常' ORDER BY region"
        },
        {
            "category": "设备状态",
            "question": "设备在线率是多少？",
            "sql": f"SELECT ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as online_rate, COUNT(*) as total FROM devices WHERE snapshot_date = '{latest_date}'"
        },
        {
            "category": "设备状态",
            "question": "整体在线率",
            "sql": f"SELECT ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as online_rate, COUNT(*) as total FROM devices WHERE snapshot_date = '{latest_date}'"
        },

        # ========== 区域分布类 ==========
        {
            "category": "区域分布",
            "question": "各区域设备数量对比",
            "sql": f"SELECT region, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region IS NOT NULL AND region != '' GROUP BY region ORDER BY count DESC"
        },
        {
            "category": "区域分布",
            "question": "各区域设备数量",
            "sql": f"SELECT region, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region IS NOT NULL AND region != '' GROUP BY region ORDER BY count DESC"
        },
        {
            "category": "区域分布",
            "question": "按区域统计设备数",
            "sql": f"SELECT region, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region IS NOT NULL AND region != '' GROUP BY region ORDER BY count DESC"
        },
        {
            "category": "区域分布",
            "question": "锡山区有多少设备？",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region = '锡山区'"
        },
        {
            "category": "区域分布",
            "question": "惠山区设备数量",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region = '惠山区'"
        },
        {
            "category": "区域分布",
            "question": "滨湖区有多少台设备？",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region = '滨湖区'"
        },
        {
            "category": "区域分布",
            "question": "梁溪区设备统计",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region = '梁溪区'"
        },
        {
            "category": "区域分布",
            "question": "新吴区设备数量",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region = '新吴区'"
        },
        {
            "category": "区域分布",
            "question": "经开区有多少设备？",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region = '经开区'"
        },
        {
            "category": "区域分布",
            "question": "各区域设备在线率",
            "sql": f"""SELECT region,
                ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as online_rate,
                COUNT(*) as total,
                SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) as online_count
                FROM devices WHERE snapshot_date = '{latest_date}' AND region IS NOT NULL AND region != ''
                GROUP BY region ORDER BY online_rate DESC"""
        },
        {
            "category": "区域分布",
            "question": "哪个区域设备最多？",
            "sql": f"SELECT region, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region IS NOT NULL AND region != '' GROUP BY region ORDER BY count DESC LIMIT 1"
        },
        {
            "category": "区域分布",
            "question": "哪个区域在线率最高？",
            "sql": f"""SELECT region,
                ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as online_rate
                FROM devices WHERE snapshot_date = '{latest_date}' AND region IS NOT NULL AND region != ''
                GROUP BY region ORDER BY online_rate DESC LIMIT 1"""
        },

        # ========== 厂商分布类 ==========
        {
            "category": "厂商分布",
            "question": "各厂商设备数量",
            "sql": f"SELECT manufacturer_name, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND manufacturer_name IS NOT NULL AND manufacturer_name != '' GROUP BY manufacturer_name ORDER BY count DESC"
        },
        {
            "category": "厂商分布",
            "question": "厂商设备数量对比",
            "sql": f"SELECT manufacturer_name, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND manufacturer_name IS NOT NULL AND manufacturer_name != '' GROUP BY manufacturer_name ORDER BY count DESC"
        },
        {
            "category": "厂商分布",
            "question": "各厂商设备数量TOP5",
            "sql": f"SELECT manufacturer_name, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND manufacturer_name IS NOT NULL AND manufacturer_name != '' GROUP BY manufacturer_name ORDER BY count DESC LIMIT 5"
        },
        {
            "category": "厂商分布",
            "question": "厂商TOP5",
            "sql": f"SELECT manufacturer_name, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND manufacturer_name IS NOT NULL AND manufacturer_name != '' GROUP BY manufacturer_name ORDER BY count DESC LIMIT 5"
        },
        {
            "category": "厂商分布",
            "question": "海康设备有多少？",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND manufacturer_name = '海康'"
        },
        {
            "category": "厂商分布",
            "question": "海康威视设备在线率",
            "sql": f"""SELECT manufacturer_name,
                ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as online_rate,
                COUNT(*) as total
                FROM devices WHERE snapshot_date = '{latest_date}' AND manufacturer_name = '海康'"""
        },
        {
            "category": "厂商分布",
            "question": "大华设备数量",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND manufacturer_name LIKE '%大华%'"
        },
        {
            "category": "厂商分布",
            "question": "宇视设备在线率",
            "sql": f"""SELECT manufacturer_name,
                ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as online_rate
                FROM devices WHERE snapshot_date = '{latest_date}' AND manufacturer_name LIKE '%宇视%'"""
        },
        {
            "category": "厂商分布",
            "question": "哪个厂商设备最多？",
            "sql": f"SELECT manufacturer_name, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND manufacturer_name IS NOT NULL AND manufacturer_name != '' GROUP BY manufacturer_name ORDER BY count DESC LIMIT 1"
        },

        # ========== 设备类型类 ==========
        {
            "category": "设备类型",
            "question": "设备类型分布",
            "sql": f"SELECT device_type_name, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND device_type_name IS NOT NULL AND device_type_name != '' GROUP BY device_type_name ORDER BY count DESC"
        },
        {
            "category": "设备类型",
            "question": "各类型设备数量",
            "sql": f"SELECT device_type_name, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND device_type_name IS NOT NULL AND device_type_name != '' GROUP BY device_type_name ORDER BY count DESC"
        },
        {
            "category": "设备类型",
            "question": "摄像头有多少台？",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND device_type_name LIKE '%摄像头%'"
        },
        {
            "category": "设备类型",
            "question": "MEC设备数量",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND device_type_name = 'MEC'"
        },
        {
            "category": "设备类型",
            "question": "RSU设备有多少？",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND device_type_name = 'RSU'"
        },
        {
            "category": "设备类型",
            "question": "雷达设备数量",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND device_type_name LIKE '%雷达%'"
        },

        # ========== 维护单位类 ==========
        {
            "category": "维护单位",
            "question": "维护单位有哪些？",
            "sql": f"SELECT DISTINCT maintenance_unit FROM devices WHERE snapshot_date = '{latest_date}' AND maintenance_unit IS NOT NULL AND maintenance_unit != '' ORDER BY maintenance_unit"
        },
        {
            "category": "维护单位",
            "question": "各维护单位设备数量",
            "sql": f"SELECT maintenance_unit, COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND maintenance_unit IS NOT NULL AND maintenance_unit != '' GROUP BY maintenance_unit ORDER BY count DESC"
        },
        {
            "category": "维护单位",
            "question": "海康维护的设备有多少？",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND maintenance_unit LIKE '%海康%'"
        },

        # ========== 趋势变化类 ==========
        {
            "category": "趋势变化",
            "question": "最近7天设备总数变化趋势",
            "sql": f"""SELECT snapshot_date, COUNT(*) as total_count
                FROM devices
                WHERE snapshot_date >= date('{latest_date}', '-6 days')
                GROUP BY snapshot_date ORDER BY snapshot_date"""
        },
        {
            "category": "趋势变化",
            "question": "最近30天设备数量变化",
            "sql": f"""SELECT snapshot_date, COUNT(*) as total_count
                FROM devices
                WHERE snapshot_date >= date('{latest_date}', '-29 days')
                GROUP BY snapshot_date ORDER BY snapshot_date"""
        },
        {
            "category": "趋势变化",
            "question": "每天设备在线率趋势",
            "sql": f"""SELECT snapshot_date,
                ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as online_rate,
                COUNT(*) as total
                FROM devices
                WHERE snapshot_date >= date('{latest_date}', '-6 days')
                GROUP BY snapshot_date ORDER BY snapshot_date"""
        },
        {
            "category": "趋势变化",
            "question": "近7天离线设备数量变化",
            "sql": f"""SELECT snapshot_date, COUNT(*) as offline_count
                FROM devices
                WHERE status = '离线' AND snapshot_date >= date('{latest_date}', '-6 days')
                GROUP BY snapshot_date ORDER BY snapshot_date"""
        },

        # ========== 网络延迟类 ==========
        {
            "category": "网络延迟",
            "question": "网络延迟统计",
            "sql": f"SELECT ROUND(AVG(avg_latency_ms), 2) as avg_latency, ROUND(AVG(packet_loss_rate), 2) as avg_packet_loss FROM latency_reports"
        },
        {
            "category": "网络延迟",
            "question": "平均延迟是多少？",
            "sql": f"SELECT ROUND(AVG(avg_latency_ms), 2) as avg_latency_ms FROM latency_reports"
        },
        {
            "category": "网络延迟",
            "question": "丢包率统计",
            "sql": f"SELECT ROUND(AVG(packet_loss_rate), 2) as avg_packet_loss_rate, MAX(packet_loss_rate) as max_packet_loss_rate FROM latency_reports"
        },
        {
            "category": "网络延迟",
            "question": "各区域网络延迟对比",
            "sql": f"SELECT region, ROUND(AVG(avg_latency_ms), 2) as avg_latency, ROUND(AVG(packet_loss_rate), 2) as avg_loss FROM latency_reports WHERE region IS NOT NULL GROUP BY region ORDER BY avg_latency"
        },
        {
            "category": "网络延迟",
            "question": "延迟最高的设备",
            "sql": f"SELECT device_code, device_name, region, max_latency_ms, packet_loss_rate FROM latency_reports ORDER BY max_latency_ms DESC LIMIT 10"
        },

        # ========== 组合查询类 ==========
        {
            "category": "组合查询",
            "question": "锡山区在线设备有多少？",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND region = '锡山区' AND status = '在线'"
        },
        {
            "category": "组合查询",
            "question": "惠山区离线设备列表",
            "sql": f"SELECT device_code, product_name, manufacturer_name, location FROM devices WHERE snapshot_date = '{latest_date}' AND region = '惠山区' AND status = '离线'"
        },
        {
            "category": "组合查询",
            "question": "海康在锡山区有多少设备？",
            "sql": f"SELECT COUNT(*) as count FROM devices WHERE snapshot_date = '{latest_date}' AND manufacturer_name = '海康' AND region = '锡山区'"
        },
        {
            "category": "组合查询",
            "question": "各区域各厂商设备数量",
            "sql": f"""SELECT region, manufacturer_name, COUNT(*) as count
                FROM devices WHERE snapshot_date = '{latest_date}'
                AND region IS NOT NULL AND region != ''
                AND manufacturer_name IS NOT NULL AND manufacturer_name != ''
                GROUP BY region, manufacturer_name ORDER BY region, count DESC"""
        },
        {
            "category": "组合查询",
            "question": "各区域各状态设备分布",
            "sql": f"""SELECT region, status, COUNT(*) as count
                FROM devices WHERE snapshot_date = '{latest_date}'
                AND region IS NOT NULL AND region != ''
                GROUP BY region, status ORDER BY region, count DESC"""
        },

        # ========== 详细信息类 ==========
        {
            "category": "详细信息",
            "question": "设备详细信息",
            "sql": f"SELECT device_code, product_name, manufacturer_name, device_type_name, region, location, status, ip_address FROM devices WHERE snapshot_date = '{latest_date}' LIMIT 20"
        },
        {
            "category": "详细信息",
            "question": "查看设备详情",
            "sql": f"SELECT * FROM devices WHERE snapshot_date = '{latest_date}' LIMIT 10"
        },
        {
            "category": "详细信息",
            "question": "设备IP地址列表",
            "sql": f"SELECT device_code, ip_address, region, status FROM devices WHERE snapshot_date = '{latest_date}' AND ip_address IS NOT NULL AND ip_address != '' LIMIT 50"
        },
    ]

    count = 0
    categories = {}
    for pair in sql_pairs:
        result = vm.train_sql(pair["question"], pair["sql"])
        cat = pair.get("category", "其他")
        categories[cat] = categories.get(cat, 0) + 1
        if result.get("status") == "success":
            count += 1

    print(f"\nSQL 问答对训练完成: 成功 {count} 条")
    print("\n按分类统计:")
    for cat, num in sorted(categories.items()):
        print(f"  {cat}: {num} 条")

    return count


def train_documents(vm, db):
    """训练业务文档"""
    print("\n" + "=" * 60)
    print("【步骤 3】训练业务文档")
    print("=" * 60)

    # 获取最新快照日期
    conn = db.get_connection()
    row = conn.execute("SELECT MAX(snapshot_date) as max_date FROM devices").fetchone()
    latest_date = row["max_date"] if row else "2026-06-16"

    # 获取区域列表
    regions = [r[0] for r in conn.execute(
        "SELECT DISTINCT region FROM devices WHERE region IS NOT NULL AND region != ''"
    ).fetchall()]

    # 获取厂商列表
    manufacturers = [r[0] for r in conn.execute(
        "SELECT DISTINCT manufacturer_name FROM devices WHERE manufacturer_name IS NOT NULL AND manufacturer_name != ''"
    ).fetchall()]

    # 获取设备类型列表
    device_types = [r[0] for r in conn.execute(
        "SELECT DISTINCT device_type_name FROM devices WHERE device_type_name IS NOT NULL AND device_type_name != ''"
    ).fetchall()]

    conn.close()

    documents = [
        # 业务说明文档
        {
            "content": """【设备监控系统业务说明】

本系统是智能运维管理系统，用于监控和管理全市的物联网设备。

核心数据表：
- devices 表：存储设备快照信息，每天一条快照记录
- snapshots 表：快照记录表，记录每次导入的快照信息
- latency_reports 表：网络延迟报告表，记录设备网络质量检测结果

设备状态说明：
- 在线：设备正常运行，网络连通
- 离线：设备不在线，网络不可达
- 异常：设备状态异常，需要排查

区域说明：
系统覆盖无锡市各个行政区，包括：""" + "、".join(regions) + """

厂商说明：
主要设备厂商包括：""" + "、".join(manufacturers) + """

设备类型说明：
主要设备类型包括：""" + "、".join(device_types) + """

查询注意事项：
1. 查询设备数据时必须指定 snapshot_date 条件
2. 查询最新数据使用：snapshot_date = (SELECT MAX(snapshot_date) FROM devices)
3. 所有统计查询默认使用最新快照日期
4. 区域和厂商字段可能为空，统计时建议过滤空值""",
            "tags": ["业务说明", "系统介绍", "数据字典"]
        },

        # 字段说明文档
        {
            "content": """【devices 表字段说明】

设备表核心字段：
- id: 设备唯一标识
- device_code: 设备编码
- product_name: 产品名称
- manufacturer_code: 厂商编码
- manufacturer_name: 厂商名称
- device_type_code: 设备类型编码
- device_type_name: 设备类型名称
- node_type: 节点类型
- status: 设备状态（在线/离线/异常）
- region: 所属区域
- location: 具体位置
- ip_address: IP 地址
- maintenance_unit: 维护单位
- snapshot_date: 快照日期（必填，用于区分不同时间的数据）
- junction_id: 关联路口ID
- junction_type: 路口类型
- junction_level: 路口等级
- longitude: 经度
- latitude: 纬度

【snapshots 表字段说明】
- id: 自增主键
- date: 快照日期
- source_file: 来源文件
- imported_at: 导入时间
- total_count: 设备总数
- enabled_count: 启用设备数

【latency_reports 表字段说明】
- id: 自增主键
- device_code: 设备编码
- device_name: 设备名称
- region: 所属区域
- report_date: 报告日期
- avg_latency_ms: 平均延迟（毫秒）
- max_latency_ms: 最大延迟（毫秒）
- min_latency_ms: 最小延迟（毫秒）
- packet_loss_rate: 丢包率
- total_checks: 总检测次数
- online_count: 在线次数
- offline_count: 离线次数""",
            "tags": ["字段说明", "数据字典", "表结构"]
        },

        # 查询技巧文档
        {
            "content": """【SQL 查询技巧与最佳实践】

1. 最新数据查询
要查询最新的设备快照数据，使用：
WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM devices)

2. 时间范围查询
查询最近N天的数据：
WHERE snapshot_date >= date('2026-06-16', '-6 days')

3. 空值处理
统计区域/厂商时，建议过滤空值：
WHERE region IS NOT NULL AND region != ''

4. 在线率计算
在线率 = 在线设备数 / 总设备数 * 100
使用 ROUND() 函数保留两位小数：
ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2)

5. 分组统计
使用 GROUP BY 进行分组，配合 ORDER BY 排序：
GROUP BY region ORDER BY count DESC

6. TOP N 查询
使用 LIMIT 关键字获取前N条记录：
ORDER BY count DESC LIMIT 5

7. 模糊查询
使用 LIKE 进行模糊匹配：
WHERE manufacturer_name LIKE '%海康%'
WHERE device_type_name LIKE '%摄像头%'""",
            "tags": ["查询技巧", "SQL教程", "最佳实践"]
        },

        # 常见问题文档
        {
            "content": """【常见问题 FAQ】

Q: 为什么查询不到数据？
A: 请检查是否指定了正确的 snapshot_date。设备表是快照表，每条记录都有快照日期，必须指定日期才能查询到数据。

Q: 如何获取最新的设备数据？
A: 使用 snapshot_date = (SELECT MAX(snapshot_date) FROM devices) 来获取最新快照的数据。

Q: 设备状态有哪几种？
A: 设备状态有三种：在线、离线、异常。
- 在线表示设备正常运行
- 离线表示设备网络不可达
- 异常表示设备运行异常

Q: 如何计算在线率？
A: 在线率 = 在线设备数量 / 总设备数量 × 100%
SQL示例：SELECT ROUND(SUM(CASE WHEN status='在线' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) FROM devices WHERE snapshot_date = '...'

Q: 支持哪些区域？
A: 支持无锡市所有行政区，包括：""" + "、".join(regions) + """

Q: 支持哪些设备厂商？
A: 主要设备厂商包括：""" + "、".join(manufacturers) + """

Q: 为什么统计结果和预期不一致？
A: 可能是因为部分设备的区域/厂商字段为空，统计时需要考虑是否包含空值数据。""",
            "tags": ["FAQ", "常见问题", "帮助"]
        },
    ]

    count = 0
    for doc in documents:
        result = vm.train_doc(doc["content"], doc.get("tags"))
        if result.get("status") == "success":
            count += 1
            print(f"  ✓ 文档训练成功: {doc['content'][:50]}...")
        else:
            print(f"  ✗ 文档训练失败: {result.get('message')}")

    print(f"\n业务文档训练完成: 成功 {count} 篇")
    return count


def main():
    print("╔══════════════════════════════════════════════════════════╗")
    print("║     Vanna AI 智能问答系统 - 完整训练数据生成脚本        ║")
    print("╚══════════════════════════════════════════════════════════╝")

    # 初始化
    print("\n初始化 VannaManager...")
    vm = VannaManager()
    vm.init_vanna()
    print("VannaManager 初始化完成")

    db = DBConnector()

    # 执行训练
    ddl_count = train_ddl_from_db(vm, db)
    sql_count = train_sql_pairs(vm, db)
    doc_count = train_documents(vm, db)

    # 导出训练数据
    print("\n" + "=" * 60)
    print("【步骤 4】导出训练数据")
    print("=" * 60)
    export_dir = BASE_DIR / "data" / "training_data_export"
    export_training_data(vm, export_dir)

    # 训练状态汇总
    status = vm.get_train_status()
    print("\n" + "=" * 60)
    print("【训练完成 - 状态汇总】")
    print("=" * 60)
    print(f"  DDL 表结构: {status.get('ddl_count', 0)} 条")
    print(f"  SQL 问答对: {status.get('sql_count', 0)} 条")
    print(f"  业务文档:   {status.get('doc_count', 0)} 条")
    print(f"  总计:       {status.get('total', 0)} 条")
    print(f"\n训练数据已导出到: {export_dir}")
    print("\n✓ 全部训练完成！")


if __name__ == "__main__":
    main()
