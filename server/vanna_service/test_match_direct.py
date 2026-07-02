"""
直接测试关键词匹配逻辑（不经过HTTP，速度快）
"""
import sys
import os
import time

# 设置路径
sys.path.insert(0, os.path.dirname(__file__))

from services.vanna_manager import VannaManager

def main():
    print("=" * 70)
    print("关键词匹配逻辑直接测试")
    print("=" * 70)

    vm = VannaManager()
    vm.init_vanna()
    print(f"Vanna 初始化完成，训练数据: {vm.get_train_status()}")

    # 测试用例
    TEST_CASES = [
        # (问题, 预期SQL包含关键字, 不应包含关键字)
        ("今天设备在线率是多少？", "online_rate", None),
        ("当前设备在线率是多少？", "online_rate", None),
        ("设备在线率是多少？", "online_rate", None),
        ("整体在线率", "online_rate", None),
        ("设备总数是多少？", "total", None),
        ("总共有多少台设备？", "total", None),
        ("一共有多少设备", "total", None),
        ("在线设备有多少？", "online_count", None),
        ("在线设备数量", "online_count", None),
        ("离线设备有多少？", "offline_count", None),
        ("异常设备有多少？", "abnormal_count", None),
        ("梁溪区有多少台设备？", "梁溪区", None),
        ("锡山区在线率多少？", "锡山区", None),
        ("海康设备在线率", "海康", None),
        ("各厂商设备数量", "manufacturer_name", None),
        ("最近7天设备总数变化趋势", "snapshot_date", None),
        ("每天设备在线率趋势", "online_rate", None),
        ("设备状态分布", "status", None),
        ("网络延迟统计", "latency", None),
        ("平均延迟是多少？", "latency", None),
        ("各区域设备在线率", "online_rate", None),
        ("各区域设备数量对比", "region", None),
        ("列出所有离线设备", "离线", None),
        ("厂商TOP5", "LIMIT 5", None),
        ("维护单位有哪些？", "maintenance_unit", None),
    ]

    passed = 0
    failed = 0
    total_time = 0
    fast_count = 0

    for i, (question, expected_kw, not_expected_kw) in enumerate(TEST_CASES, 1):
        start = time.time()
        sql = vm._match_sql_by_keyword(question)
        elapsed = time.time() - start
        total_time += elapsed

        if elapsed < 1.0:
            fast_count += 1

        ok = False
        if sql:
            has_expected = expected_kw.lower() in sql.lower()
            has_not_expected = False
            if not_expected_kw:
                has_not_expected = not_expected_kw.lower() in sql.lower()
            ok = has_expected and not has_not_expected
        else:
            ok = False

        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        else:
            failed += 1

        print(f"\n[{status}] #{i}: {question}")
        print(f"  预期包含: {expected_kw} | 耗时: {elapsed:.3f}秒")
        if sql:
            print(f"  SQL: {sql[:100]}...")
        else:
            print(f"  SQL: (未匹配，将走LLM)")
        if not ok:
            print(f"  *** 不符合预期！")

    print("\n" + "=" * 70)
    print(f"测试汇总: {passed}/{passed+failed} 通过 ({passed/(passed+failed)*100:.0f}%)")
    print(f"平均匹配耗时: {total_time/len(TEST_CASES)*1000:.0f}ms")
    print(f"<1秒快速匹配: {fast_count}/{len(TEST_CASES)}")
    print("=" * 70)

    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
