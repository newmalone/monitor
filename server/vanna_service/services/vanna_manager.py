"""
Vanna AI 核心管理器（优化版）
使用 Vanna 0.7.5 经典 API + SQLite 向量存储 + SQLite 数据库
关键改进：
1. 全量上下文注入（DDL/SQL/文档） - 绕过 MD5 伪向量的局限性
2. 更智能的中文提示工程 - 明确约束字段映射
3. 严格的状态统计 - 按类型分别计数
"""
import json
import hashlib
import random
import logging
from datetime import datetime
from typing import Optional
from services.db_connector import DBConnector
from services.context_manager import ConversationContext
from services.sqlite_vector_store import SQLiteVectorStore
from config import (
    get_llm_config, LLM_PROVIDER, VANNA_MODEL_NAME, SQLITE_DB_PATH, BASE_DIR
)

logger = logging.getLogger(__name__)


class VannaManager:
    """Vanna 管理器"""

    def __init__(self):
        self.vn = None
        self.db_connector = DBConnector()
        self.vector_store = None
        self._initialized = False
        self.answer_generator = None  # P3: 延迟初始化（init_vanna 中创建）
        self.rag_fallback = None  # P5: 延迟初始化（init_vanna 中创建）

    def init_vanna(self):
        """初始化 Vanna"""
        try:
            from vanna.base import VannaBase
            from openai import OpenAI

            llm_config = get_llm_config()

            # 初始化向量存储（与业务数据同目录）
            import os as _os
            from pathlib import Path as _Path
            vector_db_dir = str(_Path(SQLITE_DB_PATH).parent) if _Path(SQLITE_DB_PATH).is_absolute() else str(BASE_DIR / "data")
            _os.makedirs(vector_db_dir, exist_ok=True)
            vector_store_path = _os.path.join(vector_db_dir, "vanna_vectors.db")
            self.vector_store = SQLiteVectorStore(
                db_path=vector_store_path,
                collection_name=VANNA_MODEL_NAME
            )

            class VannaLocal(VannaBase):
                """自定义 Vanna 类"""

                def __init__(self, config=None):
                    super().__init__(config=config or {})
                    self.db_connector = DBConnector()
                    self.vector_store = None
                    self._client = None
                    self._model = None

                def set_vector_store(self, vs):
                    self.vector_store = vs

                def set_llm_client(self, client, model_name):
                    self._client = client
                    self._model = model_name

                # ========== 核心 SQL 执行 ==========
                def run_sql(self, sql: str, **kwargs) -> list:
                    try:
                        conn = self.db_connector.get_connection()
                        cursor = conn.cursor()
                        # 安全防护：只允许 SELECT 语句
                        sql_stripped = sql.strip().upper()
                        if not sql_stripped.startswith("SELECT"):
                            logger.warning(f"Blocked non-SELECT SQL: {sql[:100]}")
                            return []
                        cursor.execute(sql)
                        columns = [desc[0] for desc in cursor.description] if cursor.description else []
                        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
                        conn.close()
                        logger.info(f"SQL executed, {len(rows)} rows: {sql[:100]}")
                        return rows
                    except Exception as e:
                        logger.error(f"SQL execution error: {e}")
                        return []

                # ========== 嵌入生成（确定性） ==========
                _embedding_tried = False
                _embedding_available = False

                def generate_embedding(self, data: str, **kwargs) -> list:
                    # 火山引擎不支持 OpenAI embedding 接口，直接使用 MD5 确定性哈希
                    # 回退：使用确定性 MD5 哈希生成1536维向量
                    h = hashlib.md5(data.encode()).hexdigest()
                    seed = int(h[:12], 16)
                    rng = random.Random(seed)
                    return [rng.gauss(0, 1) for _ in range(1536)]

                # ========== 训练数据存储 ==========
                def add_question_sql(self, question: str, sql: str, **kwargs) -> str:
                    doc = json.dumps({"question": question, "sql": sql}, ensure_ascii=False)
                    emb = self.generate_embedding(question)
                    id_ = f"sql_{hashlib.md5(question.encode()).hexdigest()[:8]}"
                    self.vector_store.add([id_], [doc], [emb], [{"type": "sql"}])
                    logger.info(f"Trained SQL pair: {question}")
                    return id_

                def add_ddl(self, ddl: str, **kwargs) -> str:
                    doc = json.dumps({"ddl": ddl}, ensure_ascii=False)
                    emb = self.generate_embedding(ddl)
                    # 从 DDL 中提取表名作为 ID
                    import re
                    match = re.search(r'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)', ddl, re.IGNORECASE)
                    table_name = match.group(1) if match else f"table_{random.randint(1,1000)}"
                    id_ = f"ddl_{table_name}"
                    self.vector_store.add([id_], [doc], [emb], [{"type": "ddl"}])
                    logger.info(f"Trained DDL: {table_name}")
                    return id_

                def add_documentation(self, documentation: str, **kwargs) -> str:
                    doc = json.dumps({"documentation": documentation}, ensure_ascii=False)
                    emb = self.generate_embedding(documentation)
                    id_ = f"doc_{hashlib.md5(documentation[:100].encode()).hexdigest()[:8]}"
                    self.vector_store.add([id_], [doc], [emb], [{"type": "doc"}])
                    logger.info(f"Trained doc: {documentation[:50]}...")
                    return id_

                # ========== 上下文检索（关键改进：全量返回） ==========
                # 由于嵌入使用回退，不依赖相似度，直接返回所有同类型训练数据
                def _get_by_type(self, type_name: str) -> list:
                    """从向量存储中按类型获取"""
                    all_data = self.vector_store.get()
                    items = []
                    for doc, meta in zip(all_data.get("documents", []), all_data.get("metadatas", [])):
                        if isinstance(meta, dict) and meta.get("type") == type_name:
                            try:
                                items.append(json.loads(doc))
                            except Exception:
                                continue
                    return items

                def get_related_ddl(self, question: str, **kwargs) -> list:
                    """返回所有 DDL 定义（表数量有限，全量提供给 LLM 更精准）"""
                    items = self._get_by_type("ddl")
                    return [item["ddl"] for item in items]

                def get_similar_question_sql(self, question: str, **kwargs) -> list:
                    """返回所有 SQL 问答对（作为 few-shot 示例）"""
                    items = self._get_by_type("sql")
                    return items

                def get_related_documentation(self, question: str, **kwargs) -> list:
                    """返回所有业务文档"""
                    items = self._get_by_type("doc")
                    return [item["documentation"] for item in items]

                # ========== 训练数据管理 ==========
                def get_training_data(self, **kwargs) -> dict:
                    data = self.vector_store.get()
                    # 按类型分组返回
                    by_type = {"ddl": [], "sql": [], "doc": []}
                    for doc, meta in zip(data.get("documents", []), data.get("metadatas", [])):
                        if isinstance(meta, dict):
                            t = meta.get("type", "doc")
                            if t in by_type:
                                try:
                                    by_type[t].append(json.loads(doc))
                                except Exception:
                                    continue
                    return {**data, "by_type": by_type}

                def remove_training_data(self, id: str, **kwargs) -> bool:
                    try:
                        self.vector_store.delete([id])
                        return True
                    except Exception:
                        return False

                # ========== LLM 调用（带优化提示词） ==========
                def submit_prompt(self, prompt, **kwargs) -> str:
                    if not self._client:
                        return "LLM 未配置，无法生成回答。"
                    try:
                        response = self._client.chat.completions.create(
                            model=self._model,
                            messages=[
                                {"role": "system", "content": "你是一个专业的 SQLite 数据库查询助手。根据用户需求，只返回一个合法的 SQL 查询语句，不包含任何解释、注释或 Markdown 标记。如果无法确定 SQL，只返回关键字 SELECT_FAILED。"},
                                {"role": "user", "content": prompt}
                            ],
                            temperature=0.1,
                            max_tokens=1024,
                        )
                        answer = response.choices[0].message.content.strip()
                        # 清理可能的 Markdown 代码块标记
                        if "```" in answer:
                            import re
                            match = re.search(r"```(?:sql)?\s*(.+?)\s*```", answer, re.DOTALL | re.IGNORECASE)
                            if match:
                                answer = match.group(1).strip()
                        # 清理多余说明
                        for marker in ["--", "以下", "解释", "说明"]:
                            idx = answer.lower().find(marker.lower())
                            if idx > 10:
                                answer = answer[:idx].strip()
                        logger.info(f"LLM generated SQL: {answer[:200]}")
                        return answer
                    except Exception as e:
                        logger.error(f"LLM API error: {e}")
                        return f"LLM_ERROR"

                def system_message(self, msg: str) -> str:
                    return msg

                def user_message(self, msg: str) -> str:
                    return msg

                def assistant_message(self, msg: str) -> str:
                    return msg

                def log(self, message, **kwargs):
                    logger.debug(f"Vanna: {message}")

            # 初始化 Vanna 实例
            self.vn = VannaLocal(config={})
            self.vn.set_vector_store(self.vector_store)

            # 配置 LLM
            if llm_config.get("api_key"):
                try:
                    client = OpenAI(
                        api_key=llm_config["api_key"],
                        base_url=llm_config["api_base"],
                    )
                    self.vn.set_llm_client(client, llm_config.get("model", "deepseek-chat"))
                    logger.info(f"LLM client configured: {LLM_PROVIDER} / {llm_config.get('model')}")
                except Exception as e:
                    logger.warning(f"Failed to configure LLM client: {e}")
            else:
                logger.warning("Vanna initialized WITHOUT LLM (no API key)")

            # P3: 创建 AnswerGenerator（使用与 SQL 相同的 LLM client）
            try:
                from services.answer_generator import AnswerGenerator
                self.answer_generator = AnswerGenerator(
                    client=self.vn._client,
                    model=llm_config.get("model", "deepseek-chat"),
                )
                logger.info("AnswerGenerator initialized")
            except Exception as e:
                logger.warning(f"Failed to init AnswerGenerator: {e}")
                self.answer_generator = None

            # P5: 创建 RAG 兜底检索器
            try:
                from services.rag_fallback import RAGFallback
                # 使用 sqlite_vector_store 作为 vector store
                rag_store = None
                if hasattr(self, "vector_store") and self.vector_store:
                    rag_store = self.vector_store
                elif self.vn and hasattr(self.vn, "vector_store") and self.vn.vector_store:
                    rag_store = self.vn.vector_store
                self.rag_fallback = RAGFallback(
                    vector_store=rag_store,
                    threshold=0.5,
                    top_k=3,
                )
                logger.info("RAGFallback initialized")
            except Exception as e:
                logger.warning(f"Failed to init RAGFallback: {e}")
                self.rag_fallback = None

            # 训练数据库 schema（首次自动训练）
            self._train_schema_auto()
            self._initialized = True
            logger.info(f"Vanna initialized. DB={SQLITE_DB_PATH}, trained={self.get_train_status()}")

        except Exception as e:
            logger.error(f"Vanna init failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise

    def _train_schema_auto(self):
        """自动从数据库中提取并训练表结构"""
        tables = self.db_connector.get_table_names()
        existing = [d for d in self._get_by_type_from_vs("ddl")] if self.vector_store else []

        for table in tables:
            # 跳过已训练的表（检查是否有对应的 DDL）
            already_trained = any(table in d for d in existing) if existing else False
            if already_trained:
                continue

            ddl = self.db_connector.get_table_schema(table)
            if ddl:
                try:
                    self.vn.add_ddl(ddl)
                except Exception as e:
                    logger.warning(f"DDL train failed for {table}: {e}")

    def _get_by_type_from_vs(self, type_name: str) -> list:
        """从向量存储获取指定类型的文档"""
        if not self.vector_store:
            return []
        all_data = self.vector_store.get()
        items = []
        for doc, meta in zip(all_data.get("documents", []), all_data.get("metadatas", [])):
            if isinstance(meta, dict) and meta.get("type") == type_name:
                try:
                    items.append(json.loads(doc))
                except Exception:
                    continue
        return items

    # ========== 对外 API：问答 ==========
    def _match_sql_by_keyword(self, question: str) -> str:
        """关键词匹配：从训练的 SQL 问答对中找到最匹配的 SQL

        策略（按优先级从高到低）：
        1. 精确匹配：训练问题与用户问题完全相同或高度包含
        2. 意图优先匹配：先识别用户意图（在线率/总数/离线等），再找对应SQL
        3. 关键词评分匹配：综合评分找最佳匹配
        """
        try:
            sql_pairs = self.vn.get_similar_question_sql(question)
        except Exception as e:
            logger.error(f"get_similar_question_sql failed: {e}")
            return None
        if not sql_pairs:
            return None

        # ========== 策略 0: 精确匹配（最高优先级）==========
        q_clean = question.strip().rstrip("？?。！!")
        for pair in sql_pairs:
            if not isinstance(pair, dict):
                continue
            pair_q = str(pair.get("question", "")).strip().rstrip("？?。！!")
            if pair_q == q_clean:
                logger.info(f"Exact match: {question[:50]}")
                return pair.get("sql")
            # 高度包含（互相包含且长度差异小）
            if (pair_q in q_clean or q_clean in pair_q) and abs(len(pair_q) - len(q_clean)) <= 5:
                logger.info(f"Near-exact match: {question[:50]}")
                return pair.get("sql")

        # ========== 策略 1: 意图优先匹配 ==========
        # 先识别用户的核心意图，再在训练数据中找对应SQL
        def _has(kws, text):
            return any(k in text for k in kws)

        # 意图关键词（按特异性从高到低排列，避免冲突）
        intent_rules = [
            # 高特异性意图（必须优先匹配）
            (["在线率", "在线比例", "在线百分比"], "在线率", lambda q: "在线率" in q),
            (["离线率", "离线比例"], "离线率", lambda q: "离线率" in q),
            (["异常率", "故障率"], "异常率", lambda q: "异常率" in q),
            (["离线设备", "离线列表", "离线设备列表", "所有离线"], "离线设备列表", lambda q: ("列出" in q or "列表" in q) and "离线" in q),
            (["异常设备", "故障设备", "异常列表"], "异常设备列表", lambda q: ("列出" in q or "列表" in q) and ("异常" in q or "故障" in q)),
            (["网络延迟", "平均延迟", "延迟统计", "丢包率"], "网络延迟", lambda q: ("延迟" in q or "丢包" in q)),
            (["各区域设备数量对比", "区域设备数量对比", "各区设备数量"], "区域对比", lambda q: ("各区域" in q or "各区" in q) and ("对比" in q or "数量" in q)),
            (["各区域设备在线率", "各区在线率", "区域在线率对比"], "区域在线率", lambda q: ("各区域" in q or "各区" in q or "区域" in q) and "在线率" in q),
            (["各厂商设备数量", "厂商设备数量对比", "厂商数量"], "厂商数量", lambda q: ("各厂商" in q or "厂商" in q) and ("数量" in q or "对比" in q)),
            (["各厂商设备在线率", "厂商在线率"], "厂商在线率", lambda q: ("各厂商" in q or "厂商" in q) and "在线率" in q),
            (["设备类型", "类型分布", "各类型设备"], "设备类型", lambda q: ("类型" in q) and ("分布" in q or "数量" in q or "各" in q)),
            (["状态分布", "各状态", "状态统计"], "状态分布", lambda q: "状态" in q and ("分布" in q or "统计" in q)),
            (["趋势", "变化趋势", "最近.*天.*趋势", "每天.*趋势"], "趋势", lambda q: ("趋势" in q or "变化" in q)),
            (["TOP5", "top5", "Top5", "最多.*厂商", "厂商最多"], "TOP5", lambda q: ("TOP5" in q or "top5" in q or "Top5" in q or "最多" in q)),
            (["维护单位", "运维单位"], "维护单位", lambda q: "维护" in q or "运维" in q),
            (["各区域各厂商", "区域厂商分布"], "区域厂商分布", lambda q: "区域" in q and "厂商" in q),
            (["各区域.*状态", "区域.*分布"], "区域状态分布", lambda q: "区域" in q and "状态" in q),
            # 中等特异性
            (["在线设备", "在线数量", "在线多少"], "在线设备数", lambda q: "在线" in q and ("数量" in q or "多少" in q or "有" in q)),
            (["离线数量", "离线多少", "离线设备有多少"], "离线设备数", lambda q: "离线" in q and ("数量" in q or "多少" in q or "有" in q)),
            (["异常数量", "异常多少", "异常设备有多少"], "异常设备数", lambda q: ("异常" in q or "故障" in q) and ("数量" in q or "多少" in q)),
            (["设备总数", "总共有多少", "一共多少", "一共有多少", "设备总量"], "设备总数", lambda q: ("总数" in q or "总共" in q or "一共" in q or "总量" in q)),
            (["有多少台设备", "多少台设备", "设备数量"], "设备数量", lambda q: ("多少台" in q or "多少设备" in q or "设备数量" in q)),
            # 区域查询（需要同时匹配区域名）
            (["梁溪区", "锡山区", "惠山区", "滨湖区", "新吴区", "经开区"], "区域查询", lambda q: any(r in q for r in ["梁溪区", "锡山区", "惠山区", "滨湖区", "新吴区", "经开区"])),
            # 厂商查询
            (["海康", "海康威视", "大华", "宇视", "华为", "中兴", "移动", "中信科", "航天大为", "天安"], "厂商查询", lambda q: any(m in q for m in ["海康", "大华", "宇视", "华为", "中兴", "移动", "中信科", "航天大为", "天安"])),
        ]

        # 按意图规则匹配
        for intent_kws, intent_name, intent_check in intent_rules:
            if not intent_check(question):
                continue
            # 找到该意图下最匹配的训练问题
            best_pair = None
            best_score = 0
            for pair in sql_pairs:
                if not isinstance(pair, dict):
                    continue
                pair_q = str(pair.get("question", ""))
                pair_sql = str(pair.get("sql", ""))
                if not pair_sql:
                    continue

                score = 0
                # 意图关键词匹配
                for kw in intent_kws:
                    if kw in question and kw in pair_q:
                        score += 10
                # 训练问题必须包含意图关键词
                if any(kw in pair_q for kw in intent_kws):
                    score += 5
                # 字符重叠
                for ch in question:
                    if ch in pair_q and ch not in " ，。？的是了有在多少":
                        score += 1
                # 训练问题包含意图关键词且SQL也包含对应字段
                if intent_name == "在线率" and "online_rate" in pair_sql:
                    score += 20
                if intent_name == "设备总数" and ("total" in pair_sql.lower() or "COUNT(*)" in pair_sql) and "online_rate" not in pair_sql:
                    score += 15
                if intent_name == "在线设备数" and "online_count" in pair_sql:
                    score += 15
                if intent_name == "离线设备数" and "offline_count" in pair_sql:
                    score += 15
                if intent_name == "异常设备数" and "abnormal_count" in pair_sql:
                    score += 15

                if score > best_score:
                    best_score = score
                    best_pair = pair

            if best_pair and best_score >= 10:
                logger.info(f"Intent match [{intent_name}]: {question[:50]}, score={best_score}")
                return best_pair.get("sql")

        # ========== 策略 2: 关键词评分兜底 ==========
        question_keywords = ["在线率", "离线设备", "异常设备", "设备总数", "设备数量", "各区域",
                             "各厂商", "状态分布", "网络延迟", "海康威视", "大华", "宇视",
                             "TOP5", "top5", "Top5",
                             "最近", "变化趋势", "每天", "列出", "明细", "维护单位",
                             "在线", "离线", "异常", "总数", "区域", "厂商", "类型"]

        best_pair = None
        best_score = 0
        for pair in sql_pairs:
            if not isinstance(pair, dict):
                continue
            pair_question = str(pair.get("question", ""))
            pair_sql = str(pair.get("sql", ""))
            if not pair_question or not pair_sql:
                continue

            score = 0
            for kw in question_keywords:
                if kw in question and kw in pair_question:
                    score += 5
            overlap = 0
            for ch in question:
                if ch in pair_question and ch not in " ，。？的是了有":
                    overlap += 1
            score += overlap
            if pair_question in question or question in pair_question:
                score += 50
            if score > best_score:
                best_score = score
                best_pair = pair

        if best_pair and best_score >= 8:
            return best_pair.get("sql")

        return None

    # ========== SQL 执行安全包装 ==========
    def _normalize_sql_date(self, sql: str) -> str:
        """将 SQL 中的硬编码日期替换为动态日期

        训练数据中的 SQL 可能包含固定日期（如 '2026-06-16'），
        需要替换为最新快照日期或动态日期表达式。
        """
        if not sql:
            return sql

        import re

        # 获取最新快照日期
        try:
            conn = self.db_connector.get_connection()
            row = conn.execute("SELECT MAX(snapshot_date) as max_date FROM devices").fetchone()
            latest_date = row["max_date"] if row else None
            conn.close()
        except Exception:
            latest_date = None

        if not latest_date:
            return sql

        # 替换硬编码的快照日期为最新日期
        # 匹配 snapshot_date = 'YYYY-MM-DD' 格式
        sql = re.sub(
            r"snapshot_date\s*=\s*'(\d{4}-\d{2}-\d{2})'",
            f"snapshot_date = '{latest_date}'",
            sql
        )
        # 匹配 date('YYYY-MM-DD', ...) 格式
        sql = re.sub(
            r"date\('\d{4}-\d{2}-\d{2}'",
            f"date('{latest_date}'",
            sql
        )
        # 匹配 snapshot_date >= date('YYYY-MM-DD', ...) 中的日期
        sql = re.sub(
            r"snapshot_date\s*>=\s*date\('\d{4}-\d{2}-\d{2}'",
            f"snapshot_date >= date('{latest_date}'",
            sql
        )

        return sql

    def _safe_run_sql(self, sql: str) -> object:
        """安全执行 SQL，统一返回格式
        - 成功: list[dict]
        - 失败: {"_error": "...", "_sql": "..."}
        - 非 SELECT 阻止: {"_error": "...", "_sql": "..."}
        """
        if not sql or not sql.strip():
            return {"_error": "SQL 为空", "_sql": sql or ""}

        # 安全防护：只允许 SELECT
        sql_upper = sql.strip().upper()
        if not sql_upper.startswith("SELECT") and not sql_upper.startswith("WITH"):
            return {"_error": "只允许 SELECT/WITH 语句", "_sql": sql}

        # 动态替换硬编码日期
        sql = self._normalize_sql_date(sql)

        try:
            result = self.vn.run_sql(sql)
            return result
        except Exception as e:
            logger.error(f"SQL execution error: {e}")
            return {"_error": str(e), "_sql": sql}

    def _is_sql_error(self, result: object) -> bool:
        """判断 SQL 执行结果是否为错误"""
        return isinstance(result, dict) and "_error" in result

    def _extract_error_message(self, result: object) -> str:
        """从错误结果中提取错误信息"""
        if isinstance(result, dict) and "_error" in result:
            return result["_error"]
        return ""

    def ask(self, question: str, conversation_context: ConversationContext = None) -> dict:
        if not self._initialized:
            return {"answer": "服务尚未初始化，请稍后再试。", "sql": None, "data": None}

        try:
            # P2: 重试机制 - 最多 2 次重试
            max_retries = 2
            sql_raw = None
            data = None
            last_error = None
            prev_error = None

            for attempt in range(max_retries + 1):
                # 连续相同错误时停止
                if last_error and last_error == prev_error:
                    logger.warning(f"连续相同错误，停止重试: {last_error}")
                    break
                prev_error = last_error

                # 生成 SQL
                sql_raw = self._generate_sql(
                    question, conversation_context, last_error
                )
                if not sql_raw:
                    # 无法生成 SQL，退出循环
                    break

                # 执行 SQL
                exec_result = self._safe_run_sql(sql_raw)
                if not self._is_sql_error(exec_result):
                    data = exec_result
                    last_error = None
                    break

                # 执行失败，记录错误
                last_error = self._extract_error_message(exec_result)
                logger.warning(
                    f"SQL attempt {attempt + 1}/{max_retries + 1} failed: {last_error}"
                )

            # 全部重试失败
            if data is None and last_error:
                # P3 + P5: 失败场景使用 AnswerGenerator + RAG 兜底
                result = self._generate_answer(
                    question=question,
                    sql=None,
                    data=None,
                    validation={"status": "error", "row_count": 0, "is_anomaly": False},
                    success=False,
                    last_error=last_error,
                )
                # P5: 追加 RAG 推荐
                self._append_rag_suggestions(result, question)
                return result

            # 完全没有 SQL
            if not sql_raw:
                result = {
                    "answer": f"我理解了您的问题，但暂未找到合适的查询方式。",
                    "sql": None,
                    "data": None,
                }
                # P5: 追加 RAG 推荐
                self._append_rag_suggestions(result, question)
                return result

            # P2: 使用 ResultValidator 验证结果
            try:
                from services.result_validator import ResultValidator
                validator = ResultValidator()
                validation = validator.validate(data if isinstance(data, list) else [])
                logger.info(f"Result validation: {validation['status']}")
            except Exception as e:
                logger.warning(f"Validation failed: {e}")
                validation = {"status": "multi", "row_count": len(data) if data else 0}

            # P3: 使用 AnswerGenerator 生成自然语言回答
            result = self._generate_answer(
                question=question,
                sql=sql_raw,
                data=data,
                validation=validation,
                success=True,
            )

            # P5: 空结果时追加 RAG 推荐
            if validation.get("status") == "empty" or (data is not None and len(data) == 0):
                self._append_rag_suggestions(result, question)

            return result

        except Exception as e:
            logger.error(f"Vanna ask error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {"answer": f"处理问题时出错：{str(e)}", "sql": None, "data": None}

    def _append_rag_suggestions(self, result: dict, question: str) -> None:
        """P5: 在结果中追加 RAG 推荐（直接修改 result）"""
        if not self.rag_fallback:
            return
        try:
            rag_text = self.rag_fallback.search_and_format(question)
            if rag_text:
                result["answer"] = (result.get("answer", "") + "\n\n" + rag_text).strip()
                result["rag_suggestions"] = True
        except Exception as e:
            logger.warning(f"RAG append failed: {e}")

    def _generate_answer(
        self,
        question: str,
        sql: str = None,
        data: list = None,
        validation: dict = None,
        success: bool = True,
        last_error: str = None,
    ) -> dict:
        """P3: 使用 AnswerGenerator 生成自然语言回答"""
        context = {
            "question": question,
            "sql": sql,
            "data": data,
            "validation": validation or {"status": "multi", "row_count": 0, "is_anomaly": False},
            "success": success,
            "last_error": last_error,
        }

        # 优先使用 AnswerGenerator
        if self.answer_generator is not None:
            try:
                answer = self.answer_generator.generate(context)
                return {
                    "answer": answer,
                    "sql": sql,
                    "data": data,
                    "validation": validation,
                }
            except Exception as e:
                logger.warning(f"AnswerGenerator failed: {e}, falling back to manual format")

        # 降级：手动格式化
        return self._format_answer_manual(context)

    def _format_answer_manual(self, context: dict) -> dict:
        """降级：手动格式化回答（兼容旧实现）"""
        data = context.get("data")
        validation = context.get("validation", {})
        sql = context.get("sql")
        success = context.get("success", True)
        last_error = context.get("last_error")

        if not success and last_error:
            answer = f"我尝试了多种查询方式仍未能成功生成有效的 SQL。\n最后错误：{last_error}\n请尝试更具体的问题。"
        elif data and len(data) > 0:
            answer = f"查询成功！共 {len(data)} 条记录：\n\n"
            for row in data[:5]:
                parts = []
                for k, v in row.items():
                    if v is not None:
                        val = f"{v:.2f}" if isinstance(v, float) else str(v)
                        parts.append(f"{k}:{val}")
                answer += "  • " + " | ".join(parts) + "\n"
            if len(data) > 5:
                answer += f"\n（另有 {len(data)-5} 条结果，已在图表中展示）"
            if validation.get("is_anomaly"):
                answer += f"\n\n⚠️ 异常值提示：{validation.get('anomaly_reason', '数据存在异常')}"
        else:
            answer = f"已生成SQL但查询结果为空（可能没有符合条件的记录）。\nSQL: {(sql or '')[:120]}"

        return {
            "answer": answer,
            "sql": sql,
            "data": data,
            "validation": validation,
        }

    def ask_stream(self, question: str, conversation_context: "ConversationContext" = None):
        """P4: 真实 LLM 流式问答

        Yields:
            (event_type, data) 元组：
            - ("conversation_id", id)
            - ("sql", sql_str)
            - ("content", chunk) 多次
            - ("data", json_str)
            - ("validation", json_str)
            - ("done", "")
            - ("error", error_str)
        """
        try:
            if not self._initialized:
                yield ("error", "服务未初始化")
                return

            # 1. 生成 SQL（同步）
            sql_raw = self._generate_sql(question, conversation_context, None)
            if sql_raw:
                yield ("sql", sql_raw)

            # 2. 执行 SQL
            exec_result = self._safe_run_sql(sql_raw) if sql_raw else None

            if not exec_result or (isinstance(exec_result, dict) and "_error" in exec_result):
                # 失败：走 AnswerGenerator 流式（错误模板）
                validation = {"status": "error", "row_count": 0, "is_anomaly": False}
                last_error = self._extract_error_message(exec_result) if exec_result else "无法生成 SQL"
                ctx = {
                    "question": question,
                    "sql": None,
                    "data": None,
                    "validation": validation,
                    "success": False,
                    "last_error": last_error,
                }
                if self.answer_generator:
                    for chunk in self.answer_generator.generate_stream(ctx):
                        yield ("content", chunk)
                else:
                    yield ("content", f"我尝试了多种查询方式仍未能成功。\n最后错误：{last_error}")
                # P5: 失败时追加 RAG 推荐
                if self.rag_fallback:
                    try:
                        rag_text = self.rag_fallback.search_and_format(question)
                        if rag_text:
                            yield ("content", f"\n\n{rag_text}")
                    except Exception as e:
                        logger.warning(f"RAG stream append failed: {e}")
                yield ("done", "")
                return

            data = exec_result

            # 3. 验证结果
            try:
                from services.result_validator import ResultValidator
                validator = ResultValidator()
                validation = validator.validate(data if isinstance(data, list) else [])
            except Exception:
                validation = {"status": "multi", "row_count": len(data) if data else 0, "is_anomaly": False}

            # 4. 推送数据（一次性）
            if data:
                import json
                yield ("data", json.dumps(data, ensure_ascii=False))

            # 5. 推送 validation
            import json
            yield ("validation", json.dumps(validation, ensure_ascii=False))

            # 6. 流式生成回答
            ctx = {
                "question": question,
                "sql": sql_raw,
                "data": data,
                "validation": validation,
                "success": True,
            }
            if self.answer_generator:
                for chunk in self.answer_generator.generate_stream(ctx):
                    yield ("content", chunk)
            else:
                # 降级：一次性推送
                answer = self._format_answer_manual(ctx)["answer"]
                yield ("content", answer)

            yield ("done", "")

        except Exception as e:
            logger.error(f"ask_stream error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            yield ("error", str(e))

    def _generate_sql(self, question: str, conversation_context, last_error: str = None) -> str:
        """生成 SQL（优先关键词匹配，LLM 兜底）

        策略：
        1. 优先使用关键词匹配已训练的 SQL 问答对（快速，无需 LLM）
        2. 关键词匹配失败时，才调用 LLM 生成 SQL

        Args:
            question: 用户问题
            conversation_context: 对话上下文
            last_error: 上次执行的错误信息（用于重试反馈）

        Returns:
            清理后的 SQL 字符串，失败返回 None
        """
        # 获取训练数据（用于上下文）
        sql_pairs = self.vn.get_similar_question_sql(question)

        # 策略 1: 优先使用关键词匹配（快速路径）
        matched_sql = self._match_sql_by_keyword(question)
        if matched_sql:
            logger.info(f"Keyword match found for: {question[:50]}")
            return matched_sql

        # 策略 2: 关键词匹配失败，调用 LLM
        has_llm = hasattr(self.vn, '_client') and self.vn._client is not None

        sql_raw = None
        if has_llm:
            # LLM 模式
            ddls = self.vn.get_related_ddl(question)
            docs = self.vn.get_related_documentation(question)

            history_text = ""
            if conversation_context and conversation_context.turns:
                # 使用增强的上下文 Prompt（包含追问意图和实体信息）
                history_text = conversation_context.build_context_prompt(
                    question, include_intent=True
                )

            schema_text = "\n".join(ddls) if ddls else "无表结构"
            example_text = ""
            for i, pair in enumerate(sql_pairs[:10]):
                if "question" in pair and "sql" in pair:
                    example_text += f"示例{i+1}: 问题='{pair['question']}' -> SQL={pair['sql']}\n"

            # P2: 重试时追加错误反馈
            error_feedback = ""
            if last_error:
                error_feedback = f"""
【上次错误反馈】
上次生成的 SQL 出现错误：{last_error}
请重新生成修正后的 SQL。
"""

            enhanced_prompt = f"""
根据以下数据库表结构和示例，请为用户问题生成一条 SQLite SQL。
只返回 SQL，不要任何其他文字！

【表结构】
{schema_text}

【业务说明】
devices 表存储设备信息；snapshot_date 字段是快照日期；
status 字段: 在线/离线/异常；region 字段是区域；manufacturer_name 是厂商；
查询最新数据请用：snapshot_date = (SELECT MAX(snapshot_date) FROM devices)

【示例】
{example_text}

【对话上下文】
{history_text}

{error_feedback}

【用户问题】
{question}

请只返回一条 SQLite SELECT 语句：
"""
            sql_raw = self.vn.submit_prompt(enhanced_prompt)
            # 清理 LLM 输出
            if sql_raw:
                sql_raw = sql_raw.strip()
                # 去掉 markdown code block
                if "```" in sql_raw:
                    import re as _re
                    m = _re.search(r"```(?:sql)?\s*(.+?)\s*```", sql_raw, _re.DOTALL | _re.IGNORECASE)
                    if m:
                        sql_raw = m.group(1).strip()
                # 去掉多余说明文字
                idx = sql_raw.find("SELECT")
                if idx > 0:
                    sql_raw = sql_raw[idx:]
                idx2 = sql_raw.upper().find("FROM")
                if idx2 == -1 and "SELECT" not in sql_raw.upper():
                    sql_raw = None

        return sql_raw

    # ========== 对外 API：训练 ==========
    def train_ddl(self, ddl_sql: str) -> dict:
        try:
            self.vn.add_ddl(ddl_sql)
            return {"status": "success", "message": "DDL 训练成功"}
        except Exception as e:
            logger.error(f"DDL training error: {e}")
            return {"status": "error", "message": str(e)}

    def train_sql(self, question: str, sql: str) -> dict:
        try:
            self.vn.add_question_sql(question, sql)
            return {"status": "success", "message": "SQL 问答对训练成功"}
        except Exception as e:
            logger.error(f"SQL training error: {e}")
            return {"status": "error", "message": str(e)}

    def train_doc(self, content: str, tags: list = None) -> dict:
        try:
            self.vn.add_documentation(content)
            return {"status": "success", "message": "文档训练成功"}
        except Exception as e:
            logger.error(f"Doc training error: {e}")
            return {"status": "error", "message": str(e)}

    # ========== 对外 API：状态 ==========
    def get_train_status(self) -> dict:
        """获取详细训练状态（按类型分别计数）"""
        ddl_count = len(self._get_by_type_from_vs("ddl"))
        sql_count = len(self._get_by_type_from_vs("sql"))
        doc_count = len(self._get_by_type_from_vs("doc"))
        total = ddl_count + sql_count + doc_count
        tables = self.db_connector.get_table_names() if self.db_connector else []
        row_counts = {}
        if self.db_connector:
            for t in tables:
                try:
                    row_counts[t] = self.db_connector.get_row_count(t)
                except Exception:
                    row_counts[t] = 0
        return {
            "ddl_count": ddl_count,
            "sql_count": sql_count,
            "doc_count": doc_count,
            "total": total,
            "tables": tables,
            "row_counts": row_counts,
        }

    def get_status(self) -> dict:
        """获取服务总体状态"""
        ts = self.get_train_status()
        return {
            "trained": self._initialized and ts["total"] > 0,
            "llm_provider": LLM_PROVIDER,
            "memory_size": ts["total"],
            "tables": ts["tables"],
            "row_counts": ts["row_counts"],
        }

    def execute_sql(self, sql: str) -> list:
        """调试：直接执行 SQL"""
        try:
            return self.vn.run_sql(sql)
        except Exception as e:
            logger.error(f"Execute SQL error: {e}")
            return []

    def reset_training(self) -> dict:
        """清空所有训练数据（用于重新训练）"""
        try:
            if self.vector_store:
                self.vector_store.reset()
            return {"status": "success", "message": "训练数据已清空"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    # ========== 训练数据管理 ==========
    def get_training_data(self, type_filter: str = None, page: int = 1, page_size: int = 20) -> dict:
        """获取所有训练数据（支持分页和类型过滤）"""
        try:
            data = self.vector_store.get()
            items = []
            for doc_id, doc, meta in zip(data.get("ids", []), data.get("documents", []), data.get("metadatas", [])):
                if isinstance(meta, dict):
                    t = meta.get("type", "doc")
                    if type_filter and t != type_filter:
                        continue
                    try:
                        parsed = json.loads(doc)
                    except Exception:
                        parsed = {"raw": doc}
                    items.append({
                        "id": doc_id,
                        "type": t,
                        "data": parsed,
                        "metadata": meta,
                    })

            total = len(items)
            start = (page - 1) * page_size
            end = start + page_size
            paged_items = items[start:end]

            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "items": paged_items,
            }
        except Exception as e:
            logger.error(f"Failed to get training data: {e}")
            return {"total": 0, "page": page, "page_size": page_size, "items": []}

    def get_sql_pairs(self, page: int = 1, page_size: int = 50) -> dict:
        """获取 SQL question-answer pairs 列表"""
        try:
            items = self._get_by_type_from_vs("sql")
            result = []
            for i, item in enumerate(items):
                if isinstance(item, dict):
                    result.append({
                        "index": i,
                        "question": item.get("question", ""),
                        "sql": item.get("sql", ""),
                    })

            total = len(result)
            start = (page - 1) * page_size
            end = start + page_size
            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "items": result[start:end],
            }
        except Exception as e:
            logger.error(f"Failed to get SQL pairs: {e}")
            return {"total": 0, "page": page, "page_size": page_size, "items": []}

    def update_sql_pair(self, id: str, question: str, sql: str) -> dict:
        """更新训练 SQL 对"""
        try:
            # 先删除旧的
            self.vector_store.delete([id])
            # 再添加新的（保持相同 ID）
            doc = json.dumps({"question": question, "sql": sql}, ensure_ascii=False)
            emb = self.vn.generate_embedding(question)
            self.vector_store.add([id], [doc], [emb], [{"type": "sql"}])
            return {"status": "success", "message": "SQL 对已更新"}
        except Exception as e:
            logger.error(f"Failed to update SQL pair: {e}")
            return {"status": "error", "message": str(e)}

    def delete_training_data(self, id: str) -> dict:
        """删除特定训练数据"""
        try:
            success = self.vector_store.delete([id])
            if success:
                return {"status": "success", "message": "训练数据已删除"}
            return {"status": "error", "message": "删除失败，数据可能不存在"}
        except Exception as e:
            logger.error(f"Failed to delete training data: {e}")
            return {"status": "error", "message": str(e)}

    def get_training_history(self) -> dict:
        """获取训练历史（按类型统计）"""
        try:
            status = self.get_train_status()
            items = []

            # 从向量存储获取所有数据的创建时间（如果可用）
            data = self.vector_store.get()
            timestamps_by_type = {"ddl": [], "sql": [], "doc": []}

            for meta_str in data.get("metadatas", []):
                if isinstance(meta_str, dict):
                    t = meta_str.get("type", "doc")
                    if t in timestamps_by_type:
                        ts = meta_str.get("created_at", meta_str.get("timestamp"))
                        if ts:
                            timestamps_by_type[t].append(ts)

            items.append({
                "timestamp": datetime.now().isoformat(),
                "status": "success",
                "ddl_count": status["ddl_count"],
                "sql_count": status["sql_count"],
                "doc_count": status["doc_count"],
                "total": status["total"],
                "tables": status["tables"],
            })

            return {
                "items": items,
                "summary": status,
            }
        except Exception as e:
            logger.error(f"Failed to get training history: {e}")
            return {"items": [], "summary": {}}

    def benchmark_test(self, questions: list = None) -> dict:
        """运行基准测试（用于训练前后对比）"""
        # 默认基准问题集
        if questions is None:
            questions = [
                "设备总数是多少？",
                "各区域设备数量对比",
                "海康威视设备在线率",
                "列出所有离线设备",
                "异常设备有多少？",
                "各厂商设备数量TOP5",
                "设备状态分布",
                "各区域各厂商设备分布",
                "最近7天设备数量变化趋势",
                "维护单位有哪些？",
            ]

        results = []
        success_count = 0
        total_count = len(questions)

        for q in questions:
            result = self.ask(q)
            has_sql = result.get("sql") is not None
            has_data = result.get("data") is not None and len(result.get("data", [])) > 0
            is_success = has_sql and has_data

            if is_success:
                success_count += 1

            results.append({
                "question": q,
                "has_sql": has_sql,
                "has_data": has_data,
                "success": is_success,
                "sql": result.get("sql"),
                "data_count": len(result.get("data", [])) if result.get("data") else 0,
                "answer_preview": result.get("answer", "")[:100],
            })

        return {
            "total_questions": total_count,
            "success_count": success_count,
            "success_rate": round(success_count / total_count * 100, 2) if total_count > 0 else 0,
            "results": results,
        }
