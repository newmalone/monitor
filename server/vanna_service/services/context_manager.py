"""
多轮对话上下文管理器
负责管理用户对话历史、实体提取和上下文构建
"""
import json
import re
import logging
from datetime import datetime
from typing import Optional, TypedDict
from pathlib import Path
from config import CONVERSATIONS_DIR, MAX_CONVERSATION_TURNS

# Delay import to avoid circular dependency
ConversationItem = None  # Will be imported on first use

logger = logging.getLogger(__name__)

# 实体识别模式
ENTITY_PATTERNS = {
    "date": r"(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日|今天|昨天|前天|本周|上周|本月|上月|最近\s*\d+\s*天|近\s*\d+\s*天)",
    "region": r"(锡山区|惠山区|滨湖区|梁溪区|新吴区|经开区|江阴市|宜兴市|无锡|宜兴|江阴)",
    "manufacturer": r"(海康威视|大华|宇视|华为|中兴|烽火|移动|联通|电信|海康)",
    "device_type": r"(MEC|OLT|ONU|交换机|路由器|防火墙|摄像头|AP|枪机|球机|半球机|云台)",
}


class ConversationTurn:
    """单轮对话"""

    def __init__(self, user_input: str, assistant_output: str,
                 sql: str = None, result: list = None,
                 timestamp: str = None, entities: dict = None):
        self.user_input = user_input
        self.assistant_output = assistant_output
        self.sql = sql
        self.result = result
        self.timestamp = timestamp or datetime.now().isoformat()
        self.entities = entities or {}

    def to_dict(self) -> dict:
        return {
            "user_input": self.user_input,
            "assistant_output": self.assistant_output,
            "sql": self.sql,
            "result": self.result,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ConversationTurn":
        return cls(
            user_input=data["user_input"],
            assistant_output=data["assistant_output"],
            sql=data.get("sql"),
            result=data.get("result"),
            timestamp=data.get("timestamp"),
        )


class ConversationContext:
    """对话上下文"""

    def __init__(self, conversation_id: str, user_id: str, title: str = None):
        self.conversation_id = conversation_id
        self.user_id = user_id
        self.title = title or "新对话"
        self.turns: list[ConversationTurn] = []
        self.created_at = datetime.now().isoformat()
        self.updated_at = self.created_at

    def add_turn(self, user_input: str, assistant_output: str,
                 sql: str = None, result: list = None, entities: dict = None):
        """添加一轮对话，最多保留 MAX_CONVERSATION_TURNS 轮"""
        turn = ConversationTurn(user_input, assistant_output, sql, result,
                                entities=entities)
        self.turns.append(turn)
        # 保留最近 N 轮
        if len(self.turns) > MAX_CONVERSATION_TURNS:
            self.turns = self.turns[-MAX_CONVERSATION_TURNS:]
        self.updated_at = datetime.now().isoformat()
        # 第一轮时自动生成标题
        if len(self.turns) == 1:
            self.title = user_input[:50] + ("..." if len(user_input) > 50 else "")

    def extract_entities(self, user_input: str) -> dict:
        """从用户输入中提取实体"""
        entities = {}
        for entity_type, pattern in ENTITY_PATTERNS.items():
            matches = re.findall(pattern, user_input)
            if matches:
                entities[entity_type] = matches
        return entities

    def build_context_prompt(self, current_question: str, include_intent: bool = False) -> str:
        """构建包含历史的上下文提示词

        include_intent=True 时追加 [追问意图] 和 [提取的实体] 信息块，
        用于 LLM 更好理解追问上下文。
        """
        if not self.turns:
            return current_question

        parts = ["以下是之前的对话历史：\n"]
        for i, turn in enumerate(self.turns, 1):
            parts.append(f"第{i}轮：")
            parts.append(f"用户：{turn.user_input}")
            if turn.sql:
                parts.append(f"SQL：{turn.sql}")
            parts.append(f"助手：{turn.assistant_output}")
            parts.append("")

        if include_intent:
            last_turn = self.turns[-1]
            intent_info = self.analyze_followup_intent(current_question)
            parts.append("[追问意图]")
            parts.append(f"is_followup: {intent_info['is_followup']}")
            parts.append(f"intent_type: {intent_info['intent_type']}")
            if intent_info.get("reference_entity"):
                parts.append(f"reference_entity: {intent_info['reference_entity']}")
            parts.append("")
            parts.append("[提取的实体]")
            cur_entities = self.extract_entities(current_question)
            last_entities = last_turn.entities or {}
            for key in ["date", "region", "manufacturer", "device_type"]:
                cur_vals = cur_entities.get(key, [])
                last_vals = last_entities.get(key, [])
                parts.append(f"{key}: 当前={cur_vals}, 历史={last_vals}")
            parts.append("")

        parts.append(f"\n当前问题：{current_question}")
        parts.append("\n请结合上述对话历史，回答当前问题。")

        return "\n".join(parts)

    def analyze_followup_intent(self, current_question: str) -> dict:
        """分析追问意图
        返回：
        - is_followup: bool
        - intent_type: refine_filter | drill_down | compare | diagnosis | new_query
        - reference_entity: 从历史中提取的引用实体
        """
        intent = {
            "is_followup": False,
            "intent_type": "new_query",
            "reference_entity": None,
        }

        if not self.turns:
            return intent

        last_turn = self.turns[-1]
        last_entities = last_turn.entities or {}
        cur_entities = self.extract_entities(current_question)

        # 规则 1：诊断意图（最高优先级）
        diagnosis_kws = ["为什么", "原因", "怎么回事", "故障", "出错了", "不正常"]
        if any(kw in current_question for kw in diagnosis_kws):
            intent["is_followup"] = True
            intent["intent_type"] = "diagnosis"
            return intent

        # 规则 2：对比意图
        compare_kws = ["对比", "比较", "差异", "跟", "比"]
        if any(kw in current_question for kw in compare_kws):
            intent["is_followup"] = True
            intent["intent_type"] = "compare"
            intent["reference_entity"] = last_entities
            return intent

        # 规则 3：下钻意图（查看明细）
        drill_kws = ["具体有哪些", "详情", "详细", "明细", "列出", "分别"]
        if any(kw in current_question for kw in drill_kws):
            intent["is_followup"] = True
            intent["intent_type"] = "drill_down"
            intent["reference_entity"] = last_entities
            return intent

        # 规则 4：过滤细化意图
        refine_indicators = ["呢", "那", "那这", "还有", "另外", "看看", "换成", "改为", "再", "再看看"]
        has_refine_word = any(w in current_question for w in refine_indicators)
        # 当前问题有新的实体（区域/厂商/设备类型/状态）
        cur_entity_keys = [k for k in ["region", "manufacturer", "device_type", "status"] if cur_entities.get(k)]
        has_new_entity = bool(cur_entity_keys)
        # 但如果新实体集合与历史实体完全不同，且问题不是细化/追问形式，应视为 new_query
        # 例："在线率？" → "无锡有多少路口？"（无锡是全新实体且无追问指示词 → new_query）
        if has_refine_word and has_new_entity:
            intent["is_followup"] = True
            intent["intent_type"] = "refine_filter"
            intent["reference_entity"] = last_entities
            return intent
        if has_new_entity and not has_refine_word:
            # 检查是否与历史实体有重叠（区域/厂商/设备类型有交集）
            overlap = False
            for k in cur_entity_keys:
                cur_vals = set(cur_entities.get(k, []))
                last_vals = set(last_entities.get(k, []))
                if cur_vals & last_vals:
                    overlap = True
                    break
            if overlap:
                intent["is_followup"] = True
                intent["intent_type"] = "refine_filter"
                intent["reference_entity"] = last_entities
                return intent
            # 否则 new_query
            return intent
        if has_refine_word and not has_new_entity:
            intent["is_followup"] = True
            intent["intent_type"] = "refine_filter"
            intent["reference_entity"] = last_entities
            return intent

        # 默认：new_query（无关新问题）
        return intent

    def save(self):
        """持久化对话到 SQLite（优先）和文件（兼容）"""
        # 优先写入 SQLite
        try:
            from services.conversation_db import SQLiteConversationStore
            store = SQLiteConversationStore()
            if self.turns:
                # 获取现有 turn_count
                existing = store.get(self.conversation_id)
                current_turn_count = len(existing.turns) if existing else 0
                # 只保存新增的 turns
                new_turns = self.turns[current_turn_count:]
                for turn in new_turns:
                    store.save_turn(
                        self.conversation_id,
                        turn.user_input,
                        turn.assistant_output,
                        turn.sql,
                        turn.result,
                        turn.timestamp,
                    )
            else:
                # 确保对话存在于 SQLite
                conn = store._get_conn()
                try:
                    row = conn.execute(
                        "SELECT id FROM conversations WHERE id = ?",
                        (self.conversation_id,),
                    ).fetchone()
                    if not row:
                        conn.execute(
                            "INSERT INTO conversations (id, user_id, title, created_at, updated_at, turn_count) VALUES (?, ?, ?, ?, ?, ?)",
                            (self.conversation_id, self.user_id, self.title, self.created_at, self.updated_at, 0),
                        )
                        conn.commit()
                finally:
                    conn.close()
        except Exception as e:
            logger.warning(f"SQLite save failed, falling back to file: {e}")

        # 兼容：同时写入 JSON 文件
        file_path = CONVERSATIONS_DIR / f"{self.conversation_id}.json"
        data = {
            "conversation_id": self.conversation_id,
            "user_id": self.user_id,
            "title": self.title,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "turns": [turn.to_dict() for turn in self.turns],
        }
        file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.debug(f"Saved conversation {self.conversation_id}")

    @classmethod
    def load(cls, conversation_id: str) -> Optional["ConversationContext"]:
        """从文件加载对话"""
        file_path = CONVERSATIONS_DIR / f"{conversation_id}.json"
        if not file_path.exists():
            return None
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            ctx = cls(
                conversation_id=data["conversation_id"],
                user_id=data["user_id"],
                title=data["title"],
            )
            ctx.created_at = data["created_at"]
            ctx.updated_at = data["updated_at"]
            ctx.turns = [ConversationTurn.from_dict(t) for t in data.get("turns", [])]
            return ctx
        except Exception as e:
            logger.error(f"Failed to load conversation {conversation_id}: {e}")
            return None


class ContextStore:
    """对话存储管理（优先使用 SQLite，兼容 JSON 文件回退）"""

    def __init__(self):
        try:
            from services.conversation_db import SQLiteConversationStore
            self.sqlite_store = SQLiteConversationStore()
        except Exception as e:
            logger.warning(f"SQLiteConversationStore init failed: {e}")
            self.sqlite_store = None

    def create(self, user_id: str) -> ConversationContext:
        """创建新对话"""
        if self.sqlite_store:
            return self.sqlite_store.create(user_id)
        # 回退：JSON 文件
        import uuid
        conversation_id = str(uuid.uuid4())
        ctx = ConversationContext(conversation_id, user_id)
        ctx.save()
        logger.info(f"Created new conversation {conversation_id} for user {user_id}")
        return ctx

    def get(self, conversation_id: str) -> Optional[ConversationContext]:
        """获取对话"""
        if self.sqlite_store:
            return self.sqlite_store.get(conversation_id)
        # 回退：JSON 文件
        return ConversationContext.load(conversation_id)

    def list_by_user(self, user_id: str) -> list:
        """列出用户的所有对话"""
        if self.sqlite_store:
            return self.sqlite_store.list_by_user(user_id)
        # 回退：JSON 文件
        from models.schemas import ConversationItem
        items = []
        if not CONVERSATIONS_DIR.exists():
            return items
        for file_path in CONVERSATIONS_DIR.glob("*.json"):
            try:
                data = json.loads(file_path.read_text(encoding="utf-8"))
                if data.get("user_id") == user_id:
                    turns = data.get("turns", [])
                    last_msg = ""
                    if turns:
                        last_msg = turns[-1].get("assistant_output", "")[:100]
                    items.append(ConversationItem(
                        id=data["conversation_id"],
                        title=data.get("title", "新对话"),
                        last_message=last_msg,
                        created_at=data.get("created_at", ""),
                        turn_count=len(turns),
                    ))
            except Exception as e:
                logger.warning(f"Failed to read conversation file {file_path}: {e}")
        items.sort(key=lambda x: x.created_at, reverse=True)
        return items

    def delete(self, conversation_id: str) -> bool:
        """删除对话"""
        if self.sqlite_store:
            return self.sqlite_store.delete(conversation_id)
        # 回退：JSON 文件
        file_path = CONVERSATIONS_DIR / f"{conversation_id}.json"
        if file_path.exists():
            file_path.unlink()
            logger.info(f"Deleted conversation {conversation_id}")
            return True
        return False

    def delete_all(self, user_id: str) -> int:
        """删除用户的所有对话"""
        if self.sqlite_store:
            return self.sqlite_store.delete_all(user_id)
        # 回退：JSON 文件
        count = 0
        if not CONVERSATIONS_DIR.exists():
            return 0
        for file_path in CONVERSATIONS_DIR.glob("*.json"):
            try:
                data = json.loads(file_path.read_text(encoding="utf-8"))
                if data.get("user_id") == user_id:
                    file_path.unlink()
                    count += 1
            except Exception:
                pass
        return count

    def save_turn(self, conversation_id: str, user_input: str, assistant_output: str,
                  sql: str = None, result: list = None, timestamp: str = None) -> bool:
        """保存一轮对话"""
        if self.sqlite_store:
            return self.sqlite_store.save_turn(conversation_id, user_input, assistant_output, sql, result, timestamp)
        return False

    def get_messages(self, conversation_id: str, offset: int = 0, limit: int = 50) -> dict:
        """获取对话消息"""
        if self.sqlite_store and hasattr(self.sqlite_store, "get_messages"):
            return self.sqlite_store.get_messages(conversation_id, offset, limit)
        # 回退：从 Context 获取
        ctx = self.get(conversation_id)
        if not ctx:
            return {"total": 0, "offset": offset, "limit": limit, "messages": []}
        messages = []
        for turn in ctx.turns:
            messages.append({"role": "user", "content": turn.user_input, "timestamp": turn.timestamp})
            messages.append({"role": "assistant", "content": turn.assistant_output, "sql": turn.sql,
                             "result_data": turn.result, "timestamp": turn.timestamp})
        return {"total": len(messages), "offset": offset, "limit": limit, "messages": messages[offset:offset+limit]}
