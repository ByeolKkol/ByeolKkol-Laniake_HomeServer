"""에이전트별 장기기억 관리 — Milvus Lite + sentence-transformers 임베딩."""
import asyncio
import os
import time
from functools import lru_cache

from pymilvus import MilvusClient, DataType
from sentence_transformers import SentenceTransformer

_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
_COLLECTION = "memories_v3"
_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"  # 400MB, 한국어 포함 다국어
_DIMS = 384
_DUP_THRESHOLD = 0.88  # 코사인 유사도 이상이면 중복으로 판단


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    """모델 싱글톤 — 프로세스당 1회만 로드."""
    print(f"[memory] 임베딩 모델 로드 중: {_MODEL_NAME}")
    model = SentenceTransformer(_MODEL_NAME)
    print("[memory] 임베딩 모델 로드 완료")
    return model


def _embed(text: str) -> list[float]:
    return _get_model().encode(text, normalize_embeddings=True).tolist()


def _db_path(agent_name: str) -> str:
    os.makedirs(_DATA_DIR, exist_ok=True)
    return os.path.join(_DATA_DIR, f"memory_{agent_name}_v3.db")


class MemoryManager:
    def __init__(self, agent_name: str) -> None:
        self.agent_name = agent_name
        self._client: MilvusClient | None = None

    def _init(self) -> MilvusClient:
        if self._client is None:
            self._client = MilvusClient(_db_path(self.agent_name))
            if not self._client.has_collection(_COLLECTION):
                schema = MilvusClient.create_schema(auto_id=True)
                schema.add_field("id", DataType.INT64, is_primary=True)
                schema.add_field("content", DataType.VARCHAR, max_length=2000)
                schema.add_field("source", DataType.VARCHAR, max_length=100)
                schema.add_field("timestamp", DataType.INT64)
                schema.add_field("vector", DataType.FLOAT_VECTOR, dim=_DIMS)
                idx = self._client.prepare_index_params()
                idx.add_index("vector", index_type="FLAT", metric_type="COSINE")
                self._client.create_collection(_COLLECTION, schema=schema, index_params=idx)
        return self._client

    async def add(self, content: str, source: str = "chat") -> bool:
        """중복 체크 후 저장. 저장하면 True, 중복이면 False."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._sync_add, content, source)

    def _sync_add(self, content: str, source: str) -> bool:
        vector = _embed(content)
        c = self._init()
        # 중복 체크
        try:
            results = c.search(
                _COLLECTION,
                data=[vector],
                anns_field="vector",
                limit=1,
                output_fields=["content"],
                search_params={"metric_type": "COSINE"},
            )
            if results and results[0]:
                score = results[0][0].get("distance", 0)
                if score >= _DUP_THRESHOLD:
                    return False  # 중복 스킵
        except Exception as e:
            print(f"[memory:{self.agent_name}] 중복 체크 실패: {e}")
        c.insert(_COLLECTION, [{
            "content": content,
            "source": source,
            "timestamp": int(time.time()),
            "vector": vector,
        }])
        return True

    async def search(self, query: str, top_k: int = 5) -> list[str]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._search, query, top_k)

    def _search(self, query: str, top_k: int) -> list[str]:
        try:
            vector = _embed(query)
            results = self._init().search(
                _COLLECTION,
                data=[vector],
                anns_field="vector",
                limit=top_k,
                output_fields=["content"],
                search_params={"metric_type": "COSINE"},
            )
            return [hit["entity"]["content"] for hit in results[0]]
        except Exception as e:
            print(f"[memory:{self.agent_name}] 검색 실패: {e}")
            return []

    def list_all(self, limit: int = 100, offset: int = 0) -> list[dict]:
        """모든 기억 조회 (id, content, source, timestamp 포함)."""
        try:
            results = self._init().query(
                _COLLECTION,
                filter="",
                output_fields=["id", "content", "source", "timestamp"],
                limit=limit,
                offset=offset,
            )
            return sorted(results, key=lambda x: x.get("timestamp", 0), reverse=True)
        except Exception as e:
            print(f"[memory:{self.agent_name}] 목록 조회 실패: {e}")
            return []

    def delete(self, memory_id: int) -> bool:
        """ID로 기억 삭제."""
        try:
            self._init().delete(_COLLECTION, ids=[memory_id])
            return True
        except Exception as e:
            print(f"[memory:{self.agent_name}] 삭제 실패 (id={memory_id}): {e}")
            return False

    def count(self) -> int:
        try:
            return self._init().query(
                _COLLECTION, filter="", output_fields=["count(*)"]
            )[0]["count(*)"]
        except Exception as e:
            print(f"[memory:{self.agent_name}] 카운트 실패: {e}")
            return 0
