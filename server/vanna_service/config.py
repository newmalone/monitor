"""
Vanna 服务全局配置
通过环境变量实现所有配置项，无需修改代码
"""
import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent

# ==================== 服务器配置 ====================
SERVER_HOST = os.getenv("VANNA_SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("VANNA_SERVER_PORT", "3002"))
DEBUG = os.getenv("VANNA_DEBUG", "false").lower() == "true"

# ==================== 数据库配置 ====================
DATA_DIR = BASE_DIR / "vanna_service" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# SQLite 数据库路径（存储业务数据）
SQLITE_DB_PATH = os.getenv(
    "VANNA_SQLITE_DB_PATH",
    str(DATA_DIR / "app.db")
)

# ChromaDB 路径（存储向量记忆）
CHROMA_DB_PATH = os.getenv(
    "VANNA_CHROMA_DB_PATH",
    str(DATA_DIR / "chroma_db")
)

# ==================== LLM 配置 ====================
# LLM 提供商选择: "volcano", "deepseek", "openai"
LLM_PROVIDER = os.getenv("VANNA_LLM_PROVIDER", "volcano").lower()

# Volcano (火山方舟) 配置
VOLCANO_API_KEY = os.getenv("VANNA_VOLCANO_API_KEY", "")
VOLCANO_API_BASE = os.getenv("VANNA_VOLCANO_API_BASE", "https://ark.cn-beijing.volces.com/api/v3")
VOLCANO_MODEL = os.getenv("VANNA_VOLCANO_MODEL", "ep-20260325151414-kk5gj")

# DeepSeek 配置
DEEPSEEK_API_KEY = os.getenv("VANNA_DEEPSEEK_API_KEY", "")
DEEPSEEK_API_BASE = os.getenv("VANNA_DEEPSEEK_API_BASE", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("VANNA_DEEPSEEK_MODEL", "deepseek-chat")

# OpenAI 配置
OPENAI_API_KEY = os.getenv("VANNA_OPENAI_API_KEY", "")
OPENAI_API_BASE = os.getenv("VANNA_OPENAI_API_BASE", "https://api.openai.com/v1")
OPENAI_MODEL = os.getenv("VANNA_OPENAI_MODEL", "gpt-4o")

# ==================== Vanna 配置 ====================
# Vanna 模型名称（用于 ChromaDB collection）
VANNA_MODEL_NAME = os.getenv("VANNA_MODEL_NAME", "monitor_ops")

# 训练相关
MAX_TRAINING_SAMPLES = int(os.getenv("VANNA_MAX_TRAINING_SAMPLES", "1000"))

# ==================== 对话配置 ====================
# 最大保留对话轮数
MAX_CONVERSATION_TURNS = int(os.getenv("VANNA_MAX_CONVERSATION_TURNS", "5"))

# 对话存储路径
CONVERSATIONS_DIR = DATA_DIR / "conversations"
CONVERSATIONS_DIR.mkdir(parents=True, exist_ok=True)


def get_llm_config() -> dict:
    """获取当前 LLM 提供商的配置"""
    configs = {
        "volcano": {
            "api_key": VOLCANO_API_KEY,
            "api_base": VOLCANO_API_BASE,
            "model": VOLCANO_MODEL,
        },
        "deepseek": {
            "api_key": DEEPSEEK_API_KEY,
            "api_base": DEEPSEEK_API_BASE,
            "model": DEEPSEEK_MODEL,
        },
        "openai": {
            "api_key": OPENAI_API_KEY,
            "api_base": OPENAI_API_BASE,
            "model": OPENAI_MODEL,
        },
    }
    return configs.get(LLM_PROVIDER, configs["volcano"])
