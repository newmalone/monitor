"""
LLM 自然语言回答生成器
负责基于 SQL、数据、validation 状态生成自然语言回答
降级策略：无 LLM 时退化为格式化输出
"""
import json
import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)


class AnswerGenerator:
    """LLM 自然语言回答生成器"""

    # 提示词模板
    ANSWER_PROMPT = """你是智能运维助手。基于以下信息回答用户问题。

【用户问题】
{question}

【生成的 SQL】
{sql}

【查询结果】（{row_count} 条记录，状态: {status}）
{data_summary}

{anomaly_hint}

要求：
1. 先给出直接答案（一句话）
2. 补充关键洞察（数据趋势、对比）
3. 简洁明了，不超过 200 字
4. 如果数据为空或异常，需明确告知
"""

    ANOMALY_HINT = """【异常提醒】
⚠️ {anomaly_reason}
请在回答中主动提示用户。"""

    def __init__(self, client: Optional[Any] = None, model: str = "deepseek-chat"):
        self.client = client
        self.model = model

    def generate(self, context: dict) -> str:
        """生成自然语言回答

        Args:
            context: 包含 question, sql, data, validation, success, last_error 等字段

        Returns:
            自然语言回答字符串
        """
        # 1. 失败场景
        if not context.get("success", True):
            return self._format_failure(context)

        # 2. 空结果场景
        data = context.get("data")
        validation = context.get("validation", {})
        if not data or validation.get("status") == "empty":
            return self._format_empty(context)

        # 3. 成功场景：调用 LLM 或降级
        if self.client is None:
            return self._format_fallback(context)

        return self._call_llm(context)

    def generate_stream(self, context: dict):
        """P4: 流式生成自然语言回答（generator）

        Yields:
            str: 每次产出文本片段
        """
        # 1. 失败场景
        if not context.get("success", True):
            yield self._format_failure(context)
            return

        # 2. 空结果场景
        data = context.get("data")
        validation = context.get("validation", {})
        if not data or validation.get("status") == "empty":
            yield self._format_empty(context)
            return

        # 3. 无 LLM 降级
        if self.client is None:
            yield self._format_fallback(context)
            return

        # 4. LLM 流式调用
        content_yielded = False
        try:
            prompt = self._build_prompt(context)
            logger.info(f"LLM stream prompt length: {len(prompt)} chars")
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是智能运维助手，专注于设备运维数据分析。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=500,
                stream=True,
            )
            for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                content = getattr(delta, "content", None) if delta else None
                if content:
                    content_yielded = True
                    yield content

            if not content_yielded:
                logger.warning("LLM stream returned no content, falling back to manual format")
                yield self._format_fallback(context)
            else:
                logger.info(f"LLM stream completed, content_yielded={content_yielded}")

            # 异常值追加提示
            if validation.get("is_anomaly"):
                anomaly_reason = validation.get("anomaly_reason", "数据存在异常")
                yield f"\n\n⚠️ 异常值提示：{anomaly_reason}"
        except Exception as e:
            logger.error(f"LLM stream failed: {e}")
            # LLM 流式失败，降级到一次性输出
            try:
                yield self._format_fallback(context)
            except Exception:
                yield f"生成回答时出错：{str(e)}"

    def _format_failure(self, context: dict) -> str:
        """失败回答"""
        last_error = context.get("last_error", "未知错误")
        return (
            f"我尝试了多种查询方式仍未能成功生成有效的 SQL。\n"
            f"最后错误：{last_error}\n"
            f"请尝试更具体的问题，或换个方式描述。"
        )

    def _format_empty(self, context: dict) -> str:
        """空结果回答"""
        question = context.get("question", "")
        return (
            f"未找到与「{question}」相关的设备数据。\n"
            f"可能原因：\n"
            f"• 时间范围内没有记录\n"
            f"• 筛选条件过于严格\n"
            f"建议放宽条件或换个时间范围试试。"
        )

    def _format_fallback(self, context: dict) -> str:
        """降级回答（无 LLM）"""
        data = context.get("data", [])
        validation = context.get("validation", {})
        row_count = validation.get("row_count", len(data))

        if not data:
            return self._format_empty(context)

        lines = [f"查询成功，共 {row_count} 条记录：\n"]
        for i, row in enumerate(data[:5], 1):
            parts = []
            for k, v in row.items():
                if v is not None:
                    val = f"{v:.2f}" if isinstance(v, float) else str(v)
                    parts.append(f"{k}:{val}")
            lines.append(f"  {i}. " + " | ".join(parts))
        if row_count > 5:
            lines.append(f"\n（另有 {row_count - 5} 条结果）")

        # 异常值提示
        if validation.get("is_anomaly"):
            lines.append(f"\n\n⚠️ 异常值提示：{validation.get('anomaly_reason', '数据存在异常')}")

        return "\n".join(lines)

    def _call_llm(self, context: dict) -> str:
        """调用 LLM 生成自然语言回答"""
        try:
            prompt = self._build_prompt(context)
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是智能运维助手，专注于设备运维数据分析。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=500,
            )
            answer = response.choices[0].message.content.strip()
            logger.info(f"LLM answer generated: {answer[:100]}")

            # 异常值追加提示
            validation = context.get("validation", {})
            if validation.get("is_anomaly"):
                anomaly_reason = validation.get("anomaly_reason", "数据存在异常")
                answer += f"\n\n⚠️ 异常值提示：{anomaly_reason}"
            return answer
        except Exception as e:
            logger.error(f"LLM answer generation failed: {e}")
            # LLM 调用失败，降级到格式化输出
            return self._format_fallback(context)

    def _build_prompt(self, context: dict) -> str:
        """构建 LLM 提示词"""
        question = context.get("question", "")
        sql = context.get("sql", "")
        data = context.get("data", [])
        validation = context.get("validation", {})

        row_count = validation.get("row_count", len(data))
        status = validation.get("status", "multi")
        data_summary = self._format_data_summary(data, row_count)
        anomaly_hint = ""
        if validation.get("is_anomaly"):
            anomaly_hint = self.ANOMALY_HINT.format(
                anomaly_reason=validation.get("anomaly_reason", "数据存在异常")
            )

        return self.ANSWER_PROMPT.format(
            question=question,
            sql=sql,
            row_count=row_count,
            status=status,
            data_summary=data_summary,
            anomaly_hint=anomaly_hint,
        )

    def _format_data_summary(self, data: list, row_count: int) -> str:
        """格式化数据摘要（超过 10 行截断）"""
        if not data:
            return "（无数据）"

        MAX_ROWS = 10
        display = data[:MAX_ROWS]
        lines = []
        for row in display:
            parts = []
            for k, v in row.items():
                if v is not None:
                    val = f"{v:.2f}" if isinstance(v, float) else str(v)
                    parts.append(f"{k}={val}")
            lines.append("  " + ", ".join(parts))

        if row_count > MAX_ROWS:
            lines.append(f"  ... 还有 {row_count - MAX_ROWS} 条记录")

        return "\n".join(lines)
