"""
轻量级 SQLite 向量存储（替代 ChromaDB）
用于 Vanna 0.7.5 的向量检索功能
使用余弦相似度进行向量匹配
"""
import sqlite3
import numpy as np
import json
import logging
from typing import Optional, List, Dict
from pathlib import Path

logger = logging.getLogger(__name__)


class SQLiteVectorStore:
    """基于 SQLite 的向量存储，支持余弦相似度检索"""

    def __init__(self, db_path: str = None, collection_name: str = "vanna"):
        self.db_path = db_path or "vanna_vectors.db"
        self.collection_name = collection_name
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self):
        conn = self._get_conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS vectors (
                id TEXT PRIMARY KEY,
                collection TEXT NOT NULL,
                document TEXT,
                embedding BLOB,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vectors_collection ON vectors(collection)")
        conn.commit()
        conn.close()
        logger.info(f"SQLiteVectorStore initialized at {self.db_path}")

    def add(self, ids: List[str], documents: List[str], embeddings: List[List[float]], metadatas: List[Dict] = None):
        """添加向量"""
        conn = self._get_conn()
        for i, (id_, doc, emb) in enumerate(zip(ids, documents, embeddings)):
            meta = json.dumps(metadatas[i]) if metadatas else None
            emb_bytes = json.dumps(emb)
            conn.execute(
                "INSERT OR REPLACE INTO vectors (id, collection, document, embedding, metadata) VALUES (?, ?, ?, ?, ?)",
                (id_, self.collection_name, doc, emb_bytes, meta)
            )
        conn.commit()
        conn.close()

    def query(self, query_embeddings: List[List[float]], n_results: int = 10, where: Dict = None) -> Dict:
        """查询最相似的向量（余弦相似度）"""
        results = {"ids": [], "documents": [], "metadatas": [], "distances": []}
        query_emb = np.array(query_embeddings[0])

        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT id, document, embedding, metadata FROM vectors WHERE collection = ?",
            (self.collection_name,)
        )

        candidates = []
        for row in cursor.fetchall():
            id_, doc, emb_str, meta_str = row
            emb = np.array(json.loads(emb_str))
            # 余弦相似度
            norm_q = np.linalg.norm(query_emb)
            norm_c = np.linalg.norm(emb)
            if norm_q == 0 or norm_c == 0:
                similarity = 0
            else:
                similarity = float(np.dot(query_emb, emb) / (norm_q * norm_c))
            meta = json.loads(meta_str) if meta_str else {}
            candidates.append((id_, doc, meta, similarity))

        # 按相似度降序
        candidates.sort(key=lambda x: x[3], reverse=True)
        top_k = candidates[:n_results]

        for id_, doc, meta, sim in top_k:
            results["ids"].append([id_])
            results["documents"].append([doc])
            results["metadatas"].append([meta])
            results["distances"].append([1 - sim])  # distance = 1 - similarity

        conn.close()
        return results

    def delete(self, ids: List[str]):
        """删除向量"""
        conn = self._get_conn()
        conn.execute(
            "DELETE FROM vectors WHERE collection = ? AND id IN ({})".format(
                ",".join("?" * len(ids))
            ),
            [self.collection_name] + ids
        )
        conn.commit()
        conn.close()

    def count(self) -> int:
        """获取向量数量"""
        conn = self._get_conn()
        result = conn.execute(
            "SELECT COUNT(*) FROM vectors WHERE collection = ?",
            (self.collection_name,)
        ).fetchone()
        conn.close()
        return result[0] if result else 0

    def get(self, ids: List[str] = None) -> Dict:
        """获取向量"""
        conn = self._get_conn()
        if ids:
            cursor = conn.execute(
                "SELECT id, document, metadata FROM vectors WHERE collection = ? AND id IN ({})".format(
                    ",".join("?" * len(ids))
                ),
                [self.collection_name] + ids
            )
        else:
            cursor = conn.execute(
                "SELECT id, document, metadata FROM vectors WHERE collection = ?",
                (self.collection_name,)
            )

        results = {"ids": [], "documents": [], "metadatas": []}
        for row in cursor.fetchall():
            id_, doc, meta_str = row
            results["ids"].append(id_)
            results["documents"].append(doc)
            results["metadatas"].append(json.loads(meta_str) if meta_str else {})
        conn.close()
        return results

    def reset(self):
        """清空集合"""
        conn = self._get_conn()
        conn.execute("DELETE FROM vectors WHERE collection = ?", (self.collection_name,))
        conn.commit()
        conn.close()

    def get_or_create_collection(self, name: str):
        """兼容性方法（模拟 ChromaDB collection）"""
        self.collection_name = name
        return self

    def list_collections(self):
        """列出所有集合"""
        conn = self._get_conn()
        result = conn.execute("SELECT DISTINCT collection FROM vectors").fetchall()
        conn.close()
        return [r[0] for r in result]
