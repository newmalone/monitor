"""
FastAPI 主应用
Vanna AI Text-to-SQL 服务入口
"""
import logging
import sys
import os
from pathlib import Path
from contextlib import asynccontextmanager

# 加载 .env 文件（如果存在）
_env_path = Path(__file__).parent / '.env'
if _env_path.exists():
    with open(_env_path, 'r', encoding='utf-8') as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _key, _val = _line.split('=', 1)
                os.environ.setdefault(_key.strip(), _val.strip())
    print(f"[vanna_app] Loaded .env from {_env_path}")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from config import SERVER_HOST, SERVER_PORT, DEBUG, LLM_PROVIDER
from services.db_connector import DBConnector
from services.vanna_manager import VannaManager
from services.context_manager import ContextStore
from api.chat import router as chat_router, set_dependencies as set_chat_deps
from api.train import router as train_router, set_dependencies as set_train_deps
from api.chart import router as chart_router, set_dependencies as set_chart_deps
from api.training import router as training_router, set_dependencies as set_training_deps

# 配置日志
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(
            Path(__file__).parent / "vanna_service.log",
            encoding="utf-8"
        ),
    ],
)

logger = logging.getLogger(__name__)

# 全局实例
db_connector = None
vanna_manager = None
context_store = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global db_connector, vanna_manager, context_store

    # 启动时初始化
    logger.info("=" * 50)
    logger.info("Vanna Service Starting...")
    logger.info(f"LLM Provider: {LLM_PROVIDER}")
    logger.info(f"Server Port: {SERVER_PORT}")
    logger.info("=" * 50)

    try:
        # 初始化数据库
        db_connector = DBConnector()
        db_connector.init_db()
        logger.info("Database initialized successfully")

        # 初始化上下文存储
        context_store = ContextStore()
        logger.info("Context store initialized")

        # 初始化 Vanna
        vanna_manager = VannaManager()
        vanna_manager.db_connector = db_connector
        vanna_manager.init_vanna()
        logger.info("Vanna initialized successfully")

        # 设置路由依赖
        set_chat_deps(vanna_manager, context_store)
        set_train_deps(vanna_manager)
        set_chart_deps(vanna_manager)
        set_training_deps(vanna_manager)

        logger.info("Vanna Service started successfully!")

    except Exception as e:
        logger.error(f"Failed to start Vanna Service: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise

    yield

    # 关闭时清理
    logger.info("Vanna Service shutting down...")


# 创建 FastAPI 应用
app = FastAPI(
    title="Vanna AI Text-to-SQL Service",
    description="运维管理系统智能问答服务 - 基于 Vanna AI 的自然语言转 SQL 引擎",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应配置具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(chat_router)
app.include_router(train_router)
app.include_router(chart_router)
app.include_router(training_router)


@app.get("/api/vanna/status")
async def status():
    """服务健康检查 + 状态"""
    if not vanna_manager:
        return {
            "status": "initializing",
            "message": "服务正在初始化中",
        }

    vanna_status = vanna_manager.get_status()
    return {
        "status": "running",
        "llm_provider": LLM_PROVIDER,
        **vanna_status,
    }


@app.get("/health")
async def health_check():
    """简单健康检查"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "vanna_app:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=DEBUG,
        log_level="debug" if DEBUG else "info",
    )
