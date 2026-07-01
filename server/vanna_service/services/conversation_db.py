"""
基于 SQLite 的对话存储
替代原有的 JSON 文件存储方式
使用 app.db 中的 conversations 和 messages 表
"""
import sqlite3
import json
import logging
import uuid
from typing import Optional, List
from datetime import datetime
from pathlib import Path

from config import SQLITE_DB_PATH
from models.schemas import ConversationItem

logger = logging.getLogger(__name__)


class SQLiteConversationStore:
    """基于 SQLite 的对话存储管理，与现有 ContextStore 兼容"""

    def __init__(self, db_path: str = None):
        self.db_path = db_path or SQLITE_DB_PATH
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """初始化数据库表"""
        conn = self._get_conn()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT DEFAULT '新对话',
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    turn_count INTEGER DEFAULT 0
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT,
                    sql TEXT,
                    result_data TEXT,
                    timestamp DATETIME NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC)"
            )
            conn.commit()
            logger.info(f"SQLite conversation tables initialized at {self.db_path}")
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to initialize conversation tables: {e}")
            raise
        finally:
            conn.close()

    def create(self, user_id: str) -> "ConversationContext":
        """创建新对话"""
        from services.context_manager import ConversationContext

        conversation_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        conn = self._get_conn()
        try:
            conn.execute(
                "INSERT INTO conversations (id, user_id, title, created_at, updated_at, turn_count) VALUES (?, ?, ?, ?, ?, ?)",
                (conversation_id, user_id, "新对话", now, now, 0),
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

        ctx = ConversationContext(conversation_id, user_id)
        ctx.created_at = now
        ctx.updated_at = now
        logger.info(f"Created new conversation {conversation_id} for user {user_id}")
        return ctx

    def get(self, conversation_id: str) -> Optional["ConversationContext"]:
        """获取对话上下文"""
        from services.context_manager import ConversationContext, ConversationTurn

        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?",
                (conversation_id,),
            ).fetchone()
            if not row:
                return None

            ctx = ConversationContext(
                conversation_id=row["id"],
                user_id=row["user_id"],
                title=row["title"],
            )
            ctx.created_at = row["created_at"]
            ctx.updated_at = row["updated_at"]

            # 加载所有消息
            messages = conn.execute(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC",
                (conversation_id,),
            ).fetchall()

            # 按 user/assistant 配对组装成 turns
            turns = []
            user_msg = None
            for msg in messages:
                if msg["role"] == "user":
                    user_msg = msg
                elif msg["role"] == "assistant" and user_msg:
                    turn = ConversationTurn(
                        user_input=user_msg["content"],
                        assistant_output=msg["content"],
                        sql=msg["sql"],
                        result=json.loads(msg["result_data"]) if msg["result_data"] else None,
                        timestamp=user_msg["timestamp"],
                    )
                    turns.append(turn)
                    user_msg = None

            ctx.turns = turns
            return ctx
        finally:
            conn.close()

    def list_by_user(self, user_id: str) -> List[ConversationItem]:
        """列出用户的所有对话"""
        items = []
        conn = self._get_conn()
        try:
            rows = conn.execute(
                "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,),
            ).fetchall()

            for row in rows:
                # 获取最后一条消息
                last_msg = conn.execute(
                    "SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1",
                    (row["id"],),
                ).fetchone()

                items.append(ConversationItem(
                    id=row["id"],
                    title=row["title"],
                    last_message=last_msg["content"][:100] if last_msg else "",
                    created_at=row["created_at"],
                    turn_count=row["turn_count"],
                ))
        finally:
            conn.close()

        return items

    def delete(self, conversation_id: str) -> bool:
        """删除对话及其所有消息"""
        conn = self._get_conn()
        try:
            cursor = conn.execute(
                "DELETE FROM conversations WHERE id = ?",
                (conversation_id,),
            )
            conn.commit()
            deleted = cursor.rowcount > 0
            if deleted:
                logger.info(f"Deleted conversation {conversation_id}")
            return deleted
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to delete conversation {conversation_id}: {e}")
            return False
        finally:
            conn.close()

    def delete_all(self, user_id: str) -> int:
        """删除用户的所有对话"""
        conn = self._get_conn()
        try:
            # 先获取所有对话 ID
            conv_ids = conn.execute(
                "SELECT id FROM conversations WHERE user_id = ?",
                (user_id,),
            ).fetchall()
            conv_ids = [r["id"] for r in conv_ids]

            if not conv_ids:
                return 0

            # 删除所有相关消息
            placeholders = ",".join("?" * len(conv_ids))
            conn.execute(
                f"DELETE FROM messages WHERE conversation_id IN ({placeholders})",
                conv_ids,
            )
            # 删除所有对话
            cursor = conn.execute(
                f"DELETE FROM conversations WHERE id IN ({placeholders})",
                conv_ids,
            )
            conn.commit()
            count = cursor.rowcount
            logger.info(f"Deleted {count} conversations for user {user_id}")
            return count
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to delete all conversations for user {user_id}: {e}")
            return 0
        finally:
            conn.close()

    def save_turn(self, conversation_id: str, user_input: str, assistant_output: str,
                  sql: str = None, result: list = None, timestamp: str = None) -> bool:
        """保存一轮对话（追加 user 和 assistant 消息）"""
        now = timestamp or datetime.now().isoformat()
        result_data = json.dumps(result, ensure_ascii=False) if result else None

        conn = self._get_conn()
        try:
            # 插入用户消息
            conn.execute(
                "INSERT INTO messages (conversation_id, role, content, timestamp) VALUES (?, 'user', ?, ?)",
                (conversation_id, user_input, now),
            )
            # 插入助手消息
            conn.execute(
                "INSERT INTO messages (conversation_id, role, content, sql, result_data, timestamp) VALUES (?, 'assistant', ?, ?, ?, ?)",
                (conversation_id, assistant_output, sql, result_data, now),
            )
            # 更新对话元数据
            conn.execute(
                "UPDATE conversations SET turn_count = turn_count + 1, updated_at = ?, title = CASE WHEN turn_count = 0 THEN ? ELSE title END WHERE id = ?",
                (now, user_input[:50] + ("..." if len(user_input) > 50 else ""), conversation_id),
            )
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to save turn for conversation {conversation_id}: {e}")
            return False
        finally:
            conn.close()

    def get_messages(self, conversation_id: str, offset: int = 0, limit: int = 50) -> dict:
        """获取对话的所有消息（支持分页）"""
        conn = self._get_conn()
        try:
            # 获取总数
            total = conn.execute(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = ?",
                (conversation_id,),
            ).fetchone()[0]

            # 获取分页消息
            rows = conn.execute(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC LIMIT ? OFFSET ?",
                (conversation_id, limit, offset),
            ).fetchall()

            messages = []
            for row in rows:
                msg = {
                    "id": row["id"],
                    "role": row["role"],
                    "content": row["content"],
                    "sql": row["sql"],
                    "result_data": json.loads(row["result_data"]) if row["result_data"] else None,
                    "timestamp": row["timestamp"],
                }
                messages.append(msg)

            return {
                "total": total,
                "offset": offset,
                "limit": limit,
                "messages": messages,
            }
        finally:
            conn.close()
