"""
基础功能测试脚本
测试所有 API 端点是否正常工作
"""
import requests
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

API_BASE = "http://localhost:3002/api/vanna"

def test_endpoint(name, method, url, data=None, expected_status=200):
    """测试单个 API 端点"""
    print(f"\n[{name}] {method} {url}")
    try:
        timeout = 300 if "benchmark" in url else (120 if "generate_from_json" in url or "ask" in url else 30)
        if method == "GET":
            response = requests.get(url, timeout=timeout)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=timeout)
        elif method == "PUT":
            response = requests.put(url, json=data, timeout=timeout)
        elif method == "DELETE":
            response = requests.delete(url, timeout=timeout)
        
        if response.status_code == expected_status:
            print(f"  ✓ 状态码: {response.status_code}")
            try:
                result = response.json()
                print(f"  ✓ 响应: {json.dumps(result, ensure_ascii=False)[:200]}")
                return result
            except:
                print(f"  ✓ 响应: {response.text[:200]}")
                return response.text
        else:
            print(f"  ✗ 状态码: {response.status_code} (预期 {expected_status})")
            print(f"  ✗ 响应: {response.text[:200]}")
            return None
    except Exception as e:
        print(f"  ✗ 错误: {e}")
        return None

def main():
    print("=" * 70)
    print("Vanna AI 智能问答系统 - 基础功能测试")
    print("=" * 70)
    
    results = {
        "passed": 0,
        "failed": 0,
        "tests": []
    }
    
    # 1. 测试训练状态
    print("\n" + "=" * 70)
    print("【1. 训练状态查询】")
    print("=" * 70)
    status = test_endpoint("训练状态", "GET", f"{API_BASE}/train/status")
    if status and isinstance(status, dict):
        print(f"\n  训练数据: DDL={status.get('ddl_count', 0)}, SQL={status.get('sql_count', 0)}, DOC={status.get('doc_count', 0)}")
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # 2. 测试训练历史
    print("\n" + "=" * 70)
    print("【2. 训练历史查询】")
    print("=" * 70)
    history = test_endpoint("训练历史", "GET", f"{API_BASE}/training/history")
    if history and isinstance(history, list):
        print(f"\n  历史记录数: {len(history)}")
        if len(history) > 0:
            print(f"  最新记录: {history[0]}")
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # 3. 测试训练数据列表
    print("\n" + "=" * 70)
    print("【3. 训练数据列表】")
    print("=" * 70)
    data = test_endpoint("训练数据", "GET", f"{API_BASE}/training/data?page=1&page_size=5")
    if data and isinstance(data, dict):
        print(f"\n  总数: {data.get('total', 0)}")
        print(f"  当前页数据: {len(data.get('data', []))} 条")
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # 4. 测试 DDL 训练
    print("\n" + "=" * 70)
    print("【4. DDL 训练】")
    print("=" * 70)
    ddl_result = test_endpoint(
        "DDL 训练", "POST", f"{API_BASE}/train/ddl",
        data={"ddl_sql": "CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT);"}
    )
    if ddl_result and ddl_result.get("status") == "success":
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # 5. 测试 SQL 训练
    print("\n" + "=" * 70)
    print("【5. SQL 问答对训练】")
    print("=" * 70)
    sql_result = test_endpoint(
        "SQL 训练", "POST", f"{API_BASE}/train/sql",
        data={
            "question": "测试问题：有多少设备？",
            "sql": "SELECT COUNT(*) as total FROM devices WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM devices)"
        }
    )
    if sql_result and sql_result.get("status") == "success":
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # 6. 测试文档训练
    print("\n" + "=" * 70)
    print("【6. 文档训练】")
    print("=" * 70)
    doc_result = test_endpoint(
        "文档训练", "POST", f"{API_BASE}/train/doc",
        data={
            "content": "测试文档：设备状态说明 - 在线表示设备正常运行，离线表示设备网络不可达，异常表示设备运行异常。",
            "tags": ["测试", "文档"]
        }
    )
    if doc_result and doc_result.get("status") == "success":
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # 7. 测试智能问答
    print("\n" + "=" * 70)
    print("【7. 智能问答】")
    print("=" * 70)
    ask_result = test_endpoint(
        "智能问答", "POST", f"{API_BASE}/ask",
        data={"question": "设备总数是多少？", "user_id": "test-user"}
    )
    if ask_result and isinstance(ask_result, dict):
        answer = ask_result.get("answer", "")
        sql = ask_result.get("sql", "")
        print(f"\n  回答: {answer[:100]}...")
        print(f"  SQL: {sql[:100]}...")
        if answer and sql:
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        results["failed"] += 1
    
    # 8. 测试对话创建
    print("\n" + "=" * 70)
    print("【8. 对话管理】")
    print("=" * 70)
    conv_result = test_endpoint(
        "创建对话", "POST", f"{API_BASE}/conversations/new?userId=test-user"
    )
    if conv_result and isinstance(conv_result, dict):
        conv_id = conv_result.get("conversation_id", "")
        print(f"\n  对话ID: {conv_id}")
        
        # 测试对话列表
        conv_list = test_endpoint("对话列表", "GET", f"{API_BASE}/conversations?user_id=test-user")
        if conv_list and isinstance(conv_list, list):
            print(f"  对话数量: {len(conv_list)}")
            results["passed"] += 1
        else:
            results["failed"] += 1
    else:
        results["failed"] += 1
    
    # 9. 测试基准测试
    print("\n" + "=" * 70)
    print("【9. 基准测试】")
    print("=" * 70)
    bench_result = test_endpoint("基准测试", "GET", f"{API_BASE}/training/benchmark")
    if bench_result and isinstance(bench_result, dict):
        before = bench_result.get("before", {}).get("success_rate", 0)
        after = bench_result.get("after", {}).get("success_rate", 0)
        improvement = bench_result.get("improvement", 0)
        print(f"\n  训练前: {before}%")
        print(f"  训练后: {after}%")
        print(f"  提升: {improvement}%")
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # 10. 测试从 JSON 生成训练数据
    print("\n" + "=" * 70)
    print("【10. 从 JSON 生成训练数据】")
    print("=" * 70)
    gen_result = test_endpoint(
        "JSON 生成", "POST", f"{API_BASE}/training/generate_from_json",
        data={"days": 7, "auto_train": True}
    )
    if gen_result and isinstance(gen_result, dict):
        generated = gen_result.get("generated", 0)
        trained = gen_result.get("trained", 0)
        print(f"\n  生成: {generated} 条")
        print(f"  训练: {trained} 条")
        results["passed"] += 1
    else:
        results["failed"] += 1
    
    # 汇总
    print("\n" + "=" * 70)
    print("测试结果汇总")
    print("=" * 70)
    print(f"  通过: {results['passed']}")
    print(f"  失败: {results['failed']}")
    print(f"  总计: {results['passed'] + results['failed']}")
    print(f"  通过率: {results['passed'] / (results['passed'] + results['failed']) * 100:.1f}%")
    
    if results["failed"] == 0:
        print("\n✓ 所有测试通过！系统功能正常。")
        return 0
    else:
        print(f"\n⚠ 有 {results['failed']} 个测试失败，请检查。")
        return 1

if __name__ == "__main__":
    sys.exit(main())
