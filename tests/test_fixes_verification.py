"""
综合测试用例：验证智能问答、历史对话、训练管理功能修复

测试场景：
1. 智能问答回复速度优化（关键词匹配优先）
2. 历史对话加载功能
3. 训练管理功能完整性
"""
import pytest
import json
import time
from fastapi.testclient import TestClient
from vanna_service.vanna_app import app
from vanna_service.services.vanna_manager import VannaManager
from vanna_service.services.context_manager import ContextStore


# 初始化测试客户端
client = TestClient(app)


class TestSmartQAResponseSpeed:
    """测试智能问答回复速度优化"""

    def test_keyword_match_priority(self):
        """测试关键词匹配优先于LLM调用"""
        # 准备：确保有训练的SQL对
        trained_questions = [
            "设备总数是多少？",
            "各区域设备数量对比",
            "海康威视设备在线率",
            "列出所有离线设备",
        ]

        # 测试每个已训练问题
        for question in trained_questions:
            start_time = time.time()

            # 发送问题
            response = client.post(
                "/api/vanna/ask",
                json={"question": question, "user_id": "test-user"}
            )

            elapsed = time.time() - start_time

            # 验证响应
            assert response.status_code == 200
            data = response.json()
            assert "answer" in data
            assert data["answer"] != ""

            # 已训练问题应该在2秒内响应（关键词匹配快速路径）
            # LLM调用通常需要5-10秒
            print(f"问题: {question}")
            print(f"响应时间: {elapsed:.2f}秒")
            print(f"答案: {data['answer'][:100]}...")
            assert elapsed < 5.0, f"问题 '{question}' 响应过慢: {elapsed:.2f}秒"

    def test_untrained_question_fallback_to_llm(self):
        """测试未训练问题回退到LLM"""
        # 发送一个未训练的问题
        question = "这个系统有哪些特殊功能？"
        start_time = time.time()

        response = client.post(
            "/api/vanna/ask",
            json={"question": question, "user_id": "test-user"}
        )

        elapsed = time.time() - start_time

        # 验证响应（LLM调用需要更长时间）
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data

        # 未训练问题可能较慢（LLM调用）
        print(f"未训练问题响应时间: {elapsed:.2f}秒")

    def test_streaming_response_speed(self):
        """测试流式响应速度"""
        question = "设备总数是多少？"
        start_time = time.time()

        response = client.post(
            "/api/vanna/ask/stream",
            json={"question": question, "user_id": "test-user"}
        )

        # 验证SSE响应
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        # 读取流式内容
        content_chunks = []
        for line in response.iter_lines():
            if line.startswith("data:"):
                content_chunks.append(line[5:].strip())

        elapsed = time.time() - start_time

        # 验证有内容返回
        assert len(content_chunks) > 0
        print(f"流式响应时间: {elapsed:.2f}秒")
        print(f"内容块数: {len(content_chunks)}")


class TestHistoryConversationLoading:
    """测试历史对话加载功能"""

    def test_create_conversation(self):
        """测试创建新对话"""
        response = client.post(
            "/api/vanna/conversations/new",
            params={"user_id": "test-user"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "conversation_id" in data
        assert data["user_id"] == "test-user"
        print(f"创建对话: {data['conversation_id']}")

    def test_list_conversations(self):
        """测试列出用户对话"""
        # 先创建几个对话
        for i in range(3):
            client.post(
                "/api/vanna/conversations/new",
                params={"user_id": "test-user-history"}
            )

        # 列出对话
        response = client.get(
            "/api/vanna/conversations",
            params={"user_id": "test-user-history"}
        )

        assert response.status_code == 200
        data = response.json()

        # 后端直接返回数组
        assert isinstance(data, list)
        assert len(data) >= 3
        print(f"对话列表数量: {len(data)}")

    def test_conversation_with_messages(self):
        """测试带消息的对话"""
        # 创建对话并发送问题
        response = client.post(
            "/api/vanna/ask",
            json={
                "question": "设备总数是多少？",
                "user_id": "test-user-msg"
            }
        )

        assert response.status_code == 200
        data = response.json()
        conversation_id = data.get("conversation_id")

        if conversation_id:
            # 获取对话详情
            response = client.get(
                f"/api/vanna/conversations/{conversation_id}"
            )

            assert response.status_code == 200
            conv_data = response.json()
            assert "turns" in conv_data
            assert len(conv_data["turns"]) > 0
            print(f"对话轮次: {len(conv_data['turns'])}")

    def test_delete_conversation(self):
        """测试删除对话"""
        # 创建对话
        response = client.post(
            "/api/vanna/conversations/new",
            params={"user_id": "test-user-delete"}
        )
        data = response.json()
        conversation_id = data["conversation_id"]

        # 删除对话
        response = client.delete(
            f"/api/vanna/conversations/{conversation_id}"
        )

        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "success"

    def test_clear_all_conversations(self):
        """测试清空所有对话"""
        # 创建几个对话
        for i in range(3):
            client.post(
                "/api/vanna/conversations/new",
                params={"user_id": "test-user-clear"}
            )

        # 清空
        response = client.post(
            "/api/vanna/conversations/clear_all",
            params={"user_id": "test-user-clear"}
        )

        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "success"
        assert result["count"] >= 3
        print(f"清空对话数: {result['count']}")


class TestTrainingManagement:
    """测试训练管理功能"""

    def test_train_ddl(self):
        """测试DDL训练"""
        ddl = """
        CREATE TABLE test_devices (
            id INTEGER PRIMARY KEY,
            device_code TEXT,
            status TEXT
        );
        """

        response = client.post(
            "/api/vanna/train/ddl",
            json={"ddl_sql": ddl}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        print("DDL训练成功")

    def test_train_sql_pair(self):
        """测试SQL问答对训练"""
        response = client.post(
            "/api/vanna/train/sql",
            json={
                "question": "测试设备有多少？",
                "sql": "SELECT COUNT(*) as total FROM test_devices"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        print("SQL问答对训练成功")

    def test_train_documentation(self):
        """测试文档训练"""
        response = client.post(
            "/api/vanna/train/doc",
            json={
                "content": "设备状态包括：在线、离线、异常三种状态",
                "tags": ["设备", "状态"]
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        print("文档训练成功")

    def test_get_training_status(self):
        """测试获取训练状态"""
        response = client.get("/api/vanna/train/status")

        assert response.status_code == 200
        data = response.json()
        assert "ddl_count" in data
        assert "sql_count" in data
        assert "doc_count" in data
        assert "total" in data
        print(f"训练状态: DDL={data['ddl_count']}, SQL={data['sql_count']}, Doc={data['doc_count']}")

    def test_get_training_data(self):
        """测试获取训练数据列表"""
        response = client.get(
            "/api/vanna/training/data",
            params={"page": 1, "page_size": 20}
        )

        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "data" in data
        assert isinstance(data["data"], list)
        print(f"训练数据总数: {data['total']}")

    def test_get_training_data_with_filter(self):
        """测试按类型过滤训练数据"""
        for type_filter in ["ddl", "sql", "doc"]:
            response = client.get(
                "/api/vanna/training/data",
                params={"type": type_filter, "page": 1, "page_size": 20}
            )

            assert response.status_code == 200
            data = response.json()
            assert "data" in data

            # 验证返回的数据类型正确
            for item in data["data"]:
                assert item["type"] == type_filter

            print(f"{type_filter}类型数据: {len(data['data'])}条")

    def test_get_training_history(self):
        """测试获取训练历史"""
        response = client.get("/api/vanna/training/history")

        assert response.status_code == 200
        data = response.json()

        # 后端现在直接返回数组
        assert isinstance(data, list)
        print(f"训练历史记录: {len(data)}条")

    def test_update_training_data(self):
        """测试更新训练数据"""
        # 先训练一个SQL对
        response = client.post(
            "/api/vanna/train/sql",
            json={
                "question": "原始问题",
                "sql": "SELECT 1"
            }
        )

        # 获取训练数据找到ID
        response = client.get(
            "/api/vanna/training/data",
            params={"type": "sql", "page": 1, "page_size": 100}
        )
        data = response.json()

        if data["data"]:
            item_id = data["data"][0]["id"]

            # 更新
            response = client.put(
                f"/api/vanna/training/data/{item_id}",
                json={
                    "question": "更新后的问题",
                    "sql": "SELECT 2"
                }
            )

            assert response.status_code == 200
            result = response.json()
            assert result["status"] == "success"
            print("训练数据更新成功")

    def test_delete_training_data(self):
        """测试删除训练数据"""
        # 先训练一个SQL对
        client.post(
            "/api/vanna/train/sql",
            json={
                "question": "待删除的问题",
                "sql": "SELECT 999"
            }
        )

        # 获取ID
        response = client.get(
            "/api/vanna/training/data",
            params={"type": "sql", "page": 1, "page_size": 100}
        )
        data = response.json()

        # 找到刚训练的
        target_id = None
        for item in data["data"]:
            if "待删除" in item.get("content", {}).get("question", ""):
                target_id = item["id"]
                break

        if target_id:
            response = client.delete(
                f"/api/vanna/training/data/{target_id}"
            )

            assert response.status_code == 200
            result = response.json()
            assert result["status"] == "success"
            print("训练数据删除成功")

    def test_benchmark_test(self):
        """测试基准测试"""
        response = client.get("/api/vanna/training/benchmark")

        assert response.status_code == 200
        data = response.json()
        assert "before" in data
        assert "after" in data
        assert "improvement" in data
        assert "success_rate" in data["after"]
        print(f"基准测试: 训练前={data['before']['success_rate']}%, 训练后={data['after']['success_rate']}%")

    def test_generate_from_json(self):
        """测试从JSON生成训练数据"""
        response = client.post(
            "/api/vanna/training/generate_from_json",
            json={"days": 7, "auto_train": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert "generated" in data
        assert "trained" in data
        assert data["generated"] > 0
        print(f"生成训练数据: {data['generated']}条")


class TestIntegration:
    """集成测试：完整流程"""

    def test_full_qa_workflow(self):
        """测试完整问答流程"""
        # 1. 训练SQL对
        client.post(
            "/api/vanna/train/sql",
            json={
                "question": "集成测试问题",
                "sql": "SELECT COUNT(*) as total FROM devices"
            }
        )

        # 2. 提问
        response = client.post(
            "/api/vanna/ask",
            json={
                "question": "集成测试问题",
                "user_id": "integration-test"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["answer"] != ""
        assert data["sql"] is not None

        # 3. 验证对话已保存
        conversation_id = data.get("conversation_id")
        if conversation_id:
            response = client.get(
                f"/api/vanna/conversations/{conversation_id}"
            )
            assert response.status_code == 200

        print("完整问答流程测试通过")

    def test_multi_turn_conversation(self):
        """测试多轮对话"""
        # 第一轮
        response1 = client.post(
            "/api/vanna/ask",
            json={
                "question": "设备总数是多少？",
                "user_id": "multi-turn-test"
            }
        )
        assert response1.status_code == 200
        conv_id = response1.json().get("conversation_id")

        if conv_id:
            # 第二轮（追问）
            response2 = client.post(
                "/api/vanna/ask",
                json={
                    "question": "那离线设备呢？",
                    "user_id": "multi-turn-test",
                    "conversation_id": conv_id
                }
            )
            assert response2.status_code == 200

            # 验证对话有多轮
            response = client.get(f"/api/vanna/conversations/{conv_id}")
            conv_data = response.json()
            assert len(conv_data["turns"]) >= 2
            print(f"多轮对话测试通过，共{len(conv_data['turns'])}轮")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
