"""
聊天 API 路由
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from models.schemas import AskRequest, AskResponse, ConversationItem
from services.context_manager import ContextStore
from services.history_loader import HistoryLoader
from services.vanna_manager import VannaManager
from services.chart_generator import generate_chart_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vanna", tags=["chat"])

# 全局实例（由 vanna_app.py 初始化）
vanna_manager: Optional[VannaManager] = None
context_store: Optional[ContextStore] = None
history_loader: Optional[HistoryLoader] = None  # P6: 新增


def set_dependencies(vm: VannaManager, cs: ContextStore = None, hl: HistoryLoader = None):
    """设置依赖实例"""
    global vanna_manager, context_store, history_loader
    vanna_manager = vm
    context_store = cs
    history_loader = hl


@router.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest):
    """普通问答"""
    if not vanna_manager:
        raise HTTPException(status_code=503, detail="Vanna 服务未初始化")

    # 获取或创建对话上下文
    conversation_id = request.conversation_id
    ctx = None

    # P6: 优先使用 history_loader（SQLite）
    if history_loader:
        ctx = history_loader.get_or_create(
            conversation_id=conversation_id,
            user_id=request.user_id,
        )
        conversation_id = ctx.conversation_id
    elif conversation_id:
        ctx = context_store.get(conversation_id)
        if not ctx:
            raise HTTPException(status_code=404, detail="会话不存在")
    else:
        ctx = context_store.create(request.user_id)
        conversation_id = ctx.conversation_id

    # 调用 Vanna 提问
    result = vanna_manager.ask(request.question, ctx)

    # 生成图表配置（如果有数据）
    chart = None
    if result.get("data"):
        chart = generate_chart_config(result["data"])

    # 记录对话轮次
    current_entities = ctx.extract_entities(request.question)
    ctx.add_turn(
        user_input=request.question,
        assistant_output=result.get("answer", ""),
        sql=result.get("sql"),
        result=result.get("data"),
        entities=current_entities,
    )
    # P6: SQLite 持久化（如果走 history_loader）
    if history_loader and history_loader.store:
        try:
            history_loader.store.save_turn(
                conversation_id=conversation_id,
                user_input=request.question,
                assistant_output=result.get("answer", ""),
                sql=result.get("sql"),
                result=result.get("data"),
            )
        except Exception as e:
            logger.warning(f"SQLite persist failed: {e}")
    else:
        ctx.save()

    return AskResponse(
        answer=result.get("answer", ""),
        sql=result.get("sql"),
        data=result.get("data"),
        chart=chart,
        conversation_id=conversation_id,
    )


@router.post("/ask/stream")
async def ask_stream(request: AskRequest):
    """流式问答（SSE）"""
    if not vanna_manager:
        raise HTTPException(status_code=503, detail="Vanna 服务未初始化")

    # 获取或创建对话上下文
    conversation_id = request.conversation_id
    ctx = None

    if conversation_id:
        ctx = context_store.get(conversation_id)
        if not ctx:
            raise HTTPException(status_code=404, detail="会话不存在")
    else:
        ctx = context_store.create(request.user_id)
        conversation_id = ctx.conversation_id

    async def event_stream():
        """SSE 事件流 - P4: 走真实 LLM 流式"""
        try:
            # 发送会话ID
            yield f"event: conversation_id\ndata: {conversation_id}\n\n"

            # 累积内容（用于 add_turn）
            full_content = ""
            final_sql = None
            final_data = None

            # 调用 VannaManager.ask_stream 走真实 LLM 流式
            for event_type, event_data in vanna_manager.ask_stream(request.question, ctx):
                if event_type == "content":
                    full_content += event_data
                    # SSE 规范要求 data 字段不能包含换行符，需要逐行发送
                    for line in event_data.split('\n'):
                        yield f"event: content\ndata: {line}\n\n"
                elif event_type == "sql":
                    final_sql = event_data
                    for line in event_data.split('\n'):
                        yield f"event: sql\ndata: {line}\n\n"
                elif event_type == "data":
                    import json
                    try:
                        final_data = json.loads(event_data)
                    except Exception:
                        final_data = None
                    yield f"event: data\ndata: {event_data}\n\n"
                elif event_type == "validation":
                    yield f"event: validation\ndata: {event_data}\n\n"
                elif event_type == "done":
                    yield "event: done\ndata: done\n\n"
                elif event_type == "error":
                    yield f"event: error\ndata: {event_data}\n\n"
                else:
                    yield f"event: {event_type}\ndata: {event_data}\n\n"

            # 记录对话轮次
            current_entities = ctx.extract_entities(request.question)
            ctx.add_turn(
                user_input=request.question,
                assistant_output=full_content,
                sql=final_sql,
                result=final_data,
                entities=current_entities,
            )
            ctx.save()

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"event: error\ndata: {str(e)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations", response_model=list[ConversationItem])
async def list_conversations(user_id: str):
    """列出用户的对话"""
    if not context_store:
        raise HTTPException(status_code=503, detail="服务未初始化")
    return context_store.list_by_user(user_id)


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """获取单个对话详情"""
    if not context_store:
        raise HTTPException(status_code=503, detail="服务未初始化")

    ctx = context_store.get(conversation_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="会话不存在")

    return {
        "conversation_id": ctx.conversation_id,
        "user_id": ctx.user_id,
        "title": ctx.title,
        "created_at": ctx.created_at,
        "turns": [turn.to_dict() for turn in ctx.turns],
    }


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """删除对话"""
    if not context_store:
        raise HTTPException(status_code=503, detail="服务未初始化")

    if not context_store.delete(conversation_id):
        raise HTTPException(status_code=404, detail="会话不存在")

    return {"status": "success", "message": "会话已删除"}


@router.post("/conversations/new")
async def create_new_conversation(user_id: str = "web-user"):
    """主动创建新对话（不发起提问）"""
    if not context_store:
        raise HTTPException(status_code=503, detail="服务未初始化")

    ctx = context_store.create(user_id)
    # 持久化空对话
    ctx.save()

    return {
        "conversation_id": ctx.conversation_id,
        "user_id": ctx.user_id,
        "title": ctx.title,
        "created_at": ctx.created_at,
        "updated_at": ctx.updated_at,
    }


@router.post("/conversations/clear_all")
async def clear_all_conversations(user_id: str = Query("web-user", description="用户ID")):
    """清除用户的所有对话"""
    if not context_store:
        raise HTTPException(status_code=503, detail="服务未初始化")

    count = context_store.delete_all(user_id)
    return {"status": "success", "message": f"已清除 {count} 个会话", "count": count}


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    offset: int = 0,
    limit: int = 50,
):
    """获取对话的所有消息（支持分页）"""
    if not context_store:
        raise HTTPException(status_code=503, detail="服务未初始化")

    # 验证对话是否存在
    ctx = context_store.get(conversation_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 检查是否有 get_messages 方法（SQLiteConversationStore 特有）
    if hasattr(context_store, "get_messages"):
        return context_store.get_messages(conversation_id, offset=offset, limit=limit)

    # 回退：使用 ContextStore 的 JSON 文件方式
    return {
        "total": len(ctx.turns),
        "offset": offset,
        "limit": limit,
        "messages": [
            {"role": "user", "content": turn.user_input, "timestamp": turn.timestamp}
            for turn in ctx.turns[offset:offset+limit]
        ] + [
            {"role": "assistant", "content": turn.assistant_output, "sql": turn.sql,
             "result_data": turn.result, "timestamp": turn.timestamp}
            for turn in ctx.turns[offset:offset+limit]
        ],
    }
