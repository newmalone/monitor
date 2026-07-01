"""
训练数据验证脚本
验证训练完成后的问答效果
"""
import time
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from services.vanna_manager import VannaManager


def test_question(vm, question: str, expected_data_rows: int = None, fast: bool = True) -> dict:
    """测试单个问题"""
    start = time.time()
    result = vm.ask(question)
    elapsed = time.time() - start

    passed = True
    issues = []

    # 检查是否有回答
    if not result.get("answer"):
        passed = False
        issues.append("无回答内容")

    # 检查是否有 SQL
    if not result.get("sql"):
        passed = False
        issues.append("未生成 SQL")

    # 快速响应检查（已训练问题应<3秒）
    if fast and elapsed > 5.0:
        passed = False
        issues.append(f"响应过慢: {elapsed:.2f}秒")

    # 检查数据行数（如果有预期）
    data = result.get("data")
    data_rows = len(data) if data and isinstance(data, list) else 0
    if expected_data_rows is not None:
        if data_rows < expected_data_rows:
            passed = False
            issues.append(f"数据行数不足: 预期>={expected_data_rows}, 实际={data_rows}")

    # 检查 SQL 是否正常（应该包含 SELECT）
    sql = result.get("sql") or ""
    if "SELECT" not in sql.upper():
        passed = False
        issues.append("SQL 不包含 SELECT")

    return {
        "question": question,
        "elapsed": elapsed,
        "passed": passed,
        "issues": issues,
        "sql": sql[:120],
        "answer_preview": (result.get("answer") or "")[:80],
        "data_rows": data_rows,
    }


def main():
    print("=" * 70)
    print("Vanna AI 训练数据验证测试")
    print("=" * 70)

    print("\n初始化 VannaManager...")
    vm = VannaManager()
    vm.init_vanna()

    status = vm.get_train_status()
    print(f"\n当前训练状态:")
    print(f"  DDL: {status.get('ddl_count', 0)} 条")
    print(f"  SQL: {status.get('sql_count', 0)} 条")
    print(f"  DOC: {status.get('doc_count', 0)} 条")
    print(f"  总计: {status.get('total', 0)} 条")

    # 测试用例: (问题, 预期最少数据行数, 是否快速响应)
    test_cases = [
        # 基础统计
        ("设备总数是多少？", 1, True),
        ("总共有多少台设备？", 1, True),

        # 设备状态
        ("设备状态分布", 2, True),
        ("在线设备有多少？", 1, True),
        ("离线设备有多少？", 1, True),
        ("设备在线率是多少？", 1, True),

        # 区域分布
        ("各区域设备数量对比", 3, True),
        ("锡山区有多少设备？", 1, True),
        ("惠山区设备数量", 1, True),
        ("各区域设备在线率", 3, True),

        # 厂商分布
        ("各厂商设备数量", 3, True),
        ("各厂商设备数量TOP5", 5, True),
        ("海康设备有多少？", 1, True),

        # 设备类型
        ("设备类型分布", 3, True),

        # 趋势变化
        ("最近7天设备总数变化趋势", 2, False),

        # 网络延迟
        ("平均延迟是多少？", 1, True),
        ("丢包率统计", 1, True),

        # 组合查询
        ("锡山区在线设备有多少？", 1, True),

        # 详细信息
        ("列出所有离线设备", 10, True),
    ]

    print(f"\n{'='*70}")
    print(f"开始测试 - 共 {len(test_cases)} 个测试用例")
    print(f"{'='*70}")

    results = []
    passed_count = 0

    for i, (question, min_rows, fast) in enumerate(test_cases, 1):
        print(f"\n[{i:2d}/{len(test_cases)}] {question}")
        result = test_question(vm, question, min_rows, fast)
        results.append(result)

        status_icon = "✓" if result["passed"] else "✗"
        print(f"     {status_icon}  {result['elapsed']:.2f}秒 | {result['data_rows']}行数据")
        print(f"     SQL: {result['sql']}...")

        if result["issues"]:
            print(f"     问题: {', '.join(result['issues'])}")

        if result["passed"]:
            passed_count += 1

    # 汇总
    print(f"\n{'='*70}")
    print(f"测试结果汇总")
    print(f"{'='*70}")
    print(f"  总测试数: {len(test_cases)}")
    print(f"  通过:     {passed_count}")
    print(f"  失败:     {len(test_cases) - passed_count}")
    print(f"  通过率:   {passed_count/len(test_cases)*100:.1f}%")

    # 失败详情
    failed = [r for r in results if not r["passed"]]
    if failed:
        print(f"\n失败的测试用例:")
        for r in failed:
            print(f"  ✗ {r['question']}")
            print(f"     问题: {', '.join(r['issues'])}")

    # 响应时间统计
    times = [r["elapsed"] for r in results]
    avg_time = sum(times) / len(times)
    print(f"\n响应时间统计:")
    print(f"  平均: {avg_time:.2f}秒")
    print(f"  最快: {min(times):.2f}秒")
    print(f"  最慢: {max(times):.2f}秒")

    # 快速路径测试（已训练问题应该很快）
    fast_results = [r for r, (_, _, fast) in zip(results, test_cases) if fast]
    if fast_results:
        fast_times = [r["elapsed"] for r in fast_results]
        avg_fast = sum(fast_times) / len(fast_results)
        print(f"\n已训练问题（快速路径）:")
        print(f"  数量: {len(fast_results)}")
        print(f"  平均响应时间: {avg_fast:.2f}秒")
        fast_pass_2s = sum(1 for t in fast_times if t < 2.0)
        fast_pass_3s = sum(1 for t in fast_times if t < 3.0)
        print(f"  <2秒比例: {fast_pass_2s}/{len(fast_results)} ({fast_pass_2s/len(fast_results)*100:.1f}%)")
        print(f"  <3秒比例: {fast_pass_3s}/{len(fast_results)} ({fast_pass_3s/len(fast_results)*100:.1f}%)")

    # 数据质量检查
    total_data_rows = sum(r["data_rows"] for r in results)
    print(f"\n数据质量:")
    print(f"  总返回数据行数: {total_data_rows}")
    print(f"  有数据的测试: {sum(1 for r in results if r['data_rows'] > 0)}/{len(results)}")

    print(f"\n{'='*70}")
    if passed_count == len(test_cases):
        print("✓ 所有测试通过！训练数据验证成功。")
    else:
        print(f"⚠ 有 {len(test_cases) - passed_count} 个测试未通过，请检查。")
    print(f"{'='*70}")

    return passed_count == len(test_cases)


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
