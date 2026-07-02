"""
关键词匹配修复验证测试
测试场景：
1. "今天设备在线率是多少？" 应返回 online_rate 而非 total
2. 已训练问题响应时间 < 2秒
3. 不同意图的问题返回正确的SQL
"""
import time
import requests

BASE_URL = "http://localhost:3002"

# 测试用例：(问题, 预期SQL关键字, 不应包含的SQL关键字)
TEST_CASES = [
    # 核心修复：在线率问题
    ("今天设备在线率是多少？", "online_rate", "COUNT(*) as total"),
    ("当前设备在线率是多少？", "online_rate", None),
    ("设备在线率是多少？", "online_rate", None),
    ("整体在线率", "online_rate", None),
    
    # 设备总数问题
    ("设备总数是多少？", "total", "online_rate"),
    ("总共有多少台设备？", "total", "online_rate"),
    ("一共有多少设备", "total", "online_rate"),
    
    # 在线设备数
    ("在线设备有多少？", "online_count", "online_rate"),
    ("在线设备数量", "online_count", None),
    
    # 离线设备数
    ("离线设备有多少？", "offline_count", None),
    
    # 异常设备
    ("异常设备有多少？", "abnormal_count", None),
    
    # 区域查询
    ("梁溪区有多少台设备？", "梁溪区", None),
    ("锡山区在线率多少？", "锡山区", "online_rate"),
    
    # 厂商查询
    ("海康设备在线率", "海康", "online_rate"),
    ("各厂商设备数量", "manufacturer_name", None),
    
    # 趋势查询
    ("最近7天设备总数变化趋势", "snapshot_date", None),
    ("每天设备在线率趋势", "online_rate", None),
    
    # 状态分布
    ("设备状态分布", "status", None),
    
    # 网络延迟
    ("网络延迟统计", "latency", None),
    ("平均延迟是多少？", "latency", None),
]


def test_ask(question, expected_kw, not_expected_kw=None):
    """测试单个问题"""
    start = time.time()
    try:
        resp = requests.post(
            f"{BASE_URL}/api/vanna/ask",
            json={"question": question, "user_id": "test-user"},
            timeout=30
        )
        elapsed = time.time() - start
        
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}", elapsed, None
        
        data = resp.json()
        sql = data.get("sql", "")
        answer = data.get("answer", "")
        
        # 检查SQL是否包含预期关键字
        has_expected = expected_kw.lower() in sql.lower() if sql else False
        has_not_expected = False
        if not_expected_kw:
            has_not_expected = not_expected_kw.lower() in sql.lower() if sql else False
        
        ok = has_expected and not has_not_expected
        return ok, sql if sql else answer, elapsed, data
    except Exception as e:
        elapsed = time.time() - start
        return False, str(e), elapsed, None


def main():
    print("=" * 70)
    print("关键词匹配修复验证测试")
    print("=" * 70)
    
    passed = 0
    failed = 0
    total_time = 0
    
    for i, (question, expected_kw, not_expected_kw) in enumerate(TEST_CASES, 1):
        ok, result, elapsed, full_data = test_ask(question, expected_kw, not_expected_kw)
        total_time += elapsed
        
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        else:
            failed += 1
        
        print(f"\n[{status}] 测试 {i}: {question}")
        print(f"  预期包含: {expected_kw}")
        if not_expected_kw:
            print(f"  不应包含: {not_expected_kw}")
        print(f"  响应时间: {elapsed:.2f}秒")
        print(f"  返回SQL: {result[:120]}...")
        
        if not ok:
            print(f"   结果不符合预期！")
    
    print("\n" + "=" * 70)
    print(f"测试汇总: {passed}/{passed+failed} 通过 ({passed/(passed+failed)*100:.0f}%)")
    print(f"平均响应时间: {total_time/len(TEST_CASES):.2f}秒")
    fast_count = sum(1 for q,ek,nek in TEST_CASES if test_ask(q,ek,nek)[2] < 2)
    print(f"已训练问题<2秒比例: {fast_count}/{len(TEST_CASES)}")
    print("=" * 70)
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
