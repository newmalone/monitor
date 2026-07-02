"""
RAG 兜底检索器
当 SQL 生成失败或执行错误时，从训练库中检索相似问答对作为建议
"""
import logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)


class RAGFallback:
    """RAG 兜底检索器

    触发时机：SQL 生成失败 / SQL 执行错误 / 空结果
    输出：相似问答列表（已按 score 降序、阈值过滤、top_k 限制）
    """

    def __init__(self, vector_store: Any = None, threshold: float = 0.5, top_k: int = 3):
        self.vector_store = vector_store
        self.threshold = threshold
        self.top_k = top_k

    def search(self, question: str) -> List[Dict]:
        """检索相似问答

        Args:
            question: 用户问题

        Returns:
            相似问答列表，每项包含 question, sql, score
        """
        if not self.vector_store or not question or not question.strip():
            return []

        try:
            # 从向量存储检索
            raw_results = self.vector_store.search(question, k=self.top_k * 2)
        except Exception as e:
            logger.warning(f"RAG vector store search failed: {e}")
            return []

        # 统一字段名
        normalized = []
        for r in raw_results:
            score = r.get("score", r.get("similarity", 0.0))
            q = r.get("question", r.get("q", ""))
            sql = r.get("sql", r.get("s", ""))
            normalized.append({
                "question": q,
                "sql": sql,
                "score": float(score),
            })

        # 阈值过滤
        filtered = [r for r in normalized if r["score"] >= self.threshold]

        # 排序（按 score 降序）
        filtered.sort(key=lambda x: x["score"], reverse=True)

        # 限制 top_k
        return filtered[:self.top_k]

    def format_suggestions(self, results: List[Dict]) -> str:
        """格式化相似问题为建议文本

        Args:
            results: search 返回的列表

        Returns:
            markdown 格式的提示文本
        """
        if not results:
            return "未找到相似的历史问题，您可以换个方式描述您的需求。"

        lines = ["您可以参考以下相似问题：\n"]
        for i, r in enumerate(results, 1):
            score_pct = f"{r['score'] * 100:.0f}%"
            lines.append(f"{i}. **{r['question']}** （相似度 {score_pct}）")
        lines.append("\n请尝试用类似的方式提问。")
        return "\n".join(lines)

    def search_and_format(self, question: str) -> str:
        """一键搜索 + 格式化"""
        results = self.search(question)
        return self.format_suggestions(results)
