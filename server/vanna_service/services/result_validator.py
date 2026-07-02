"""
SQL 结果验证器
负责对 SQL 执行结果做四类验证：empty / single / multi / anomaly
异常值检测基于数值统计（中位数偏差、变异系数）
"""
import logging
import statistics
from typing import Any

logger = logging.getLogger(__name__)


class ResultValidator:
    """SQL 结果验证器"""

    def validate(self, data: list) -> dict:
        """验证 SQL 执行结果

        Args:
            data: SQL 执行返回的 list[dict]

        Returns:
            {
                "status": "empty" | "single" | "multi" | "anomaly",
                "row_count": int,
                "is_anomaly": bool,
                "anomaly_reason": str | None,
                "anomaly_value": Any | None,
                "stats": dict | None,
            }
        """
        # 1. 空数据
        if not data or data == [{}]:
            return {
                "status": "empty",
                "row_count": 0,
                "is_anomaly": False,
                "anomaly_reason": None,
                "anomaly_value": None,
                "stats": None,
            }

        # 2. 单行
        if len(data) == 1:
            return {
                "status": "single",
                "row_count": 1,
                "is_anomaly": False,
                "anomaly_reason": None,
                "anomaly_value": None,
                "stats": None,
            }

        # 3. 多行 - 检查异常值
        row_count = len(data)
        is_anomaly, reason, value, stats = self._detect_anomaly(data)

        if is_anomaly:
            return {
                "status": "anomaly",
                "row_count": row_count,
                "is_anomaly": True,
                "anomaly_reason": reason,
                "anomaly_value": value,
                "stats": stats,
            }

        return {
            "status": "multi",
            "row_count": row_count,
            "is_anomaly": False,
            "anomaly_reason": None,
            "anomaly_value": None,
            "stats": stats,
        }

    def _detect_anomaly(self, data: list) -> tuple:
        """异常值检测：基于数值统计
        - 任一数值列存在偏离中位数 3 倍以上
        - 或变异系数 (std/mean) > 1
        """
        try:
            # 找出所有数值列
            numeric_columns = self._extract_numeric_columns(data)
            if not numeric_columns:
                return False, None, None, None

            stats_all = {}
            for col_name, values in numeric_columns.items():
                if not values:
                    continue
                mean = statistics.mean(values)
                median = statistics.median(values)
                std = statistics.stdev(values) if len(values) > 1 else 0.0

                stats_all[col_name] = {
                    "mean": round(mean, 4),
                    "median": round(median, 4),
                    "std": round(std, 4),
                }

                # 规则 1：任一值偏离中位数 3 倍以上
                if median != 0:
                    for v in values:
                        if abs(v - median) > abs(median) * 3:
                            return True, f"列[{col_name}]值{v}偏离中位数{median}超过3倍", v, stats_all

                # 规则 2：变异系数 > 1（标准差大于均值）
                if mean != 0 and std / abs(mean) > 1:
                    return True, f"列[{col_name}]变异系数{std/abs(mean):.2f}过高", values, stats_all

            return False, None, None, stats_all

        except Exception as e:
            logger.warning(f"异常检测失败: {e}")
            return False, None, None, None

    def _extract_numeric_columns(self, data: list) -> dict:
        """从数据中提取所有数值列"""
        if not data:
            return {}

        numeric_columns = {}
        first_row = data[0]
        for col_name in first_row.keys():
            values = []
            for row in data:
                v = row.get(col_name)
                if v is None:
                    continue
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    values.append(float(v))
            if values:
                numeric_columns[col_name] = values

        return numeric_columns
