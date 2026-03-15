"""
장기기억 관리 CLI.

사용법:
  python memory_cli.py --agent claude list
  python memory_cli.py --agent claude list --limit 20
  python memory_cli.py --agent claude search "소설 좋아함"
  python memory_cli.py --agent claude delete 123456789
  python memory_cli.py --agent claude clear
  python memory_cli.py --agent claude count
"""
import argparse
import time
from agents.memory import MemoryManager


def fmt_time(ts: int) -> str:
    try:
        return time.strftime("%Y-%m-%d %H:%M", time.localtime(ts))
    except Exception:
        return "-"


def cmd_list(mem: MemoryManager, limit: int) -> None:
    items = mem.list_all(limit=limit)
    if not items:
        print("저장된 기억이 없습니다.")
        return
    print(f"{'ID':>20}  {'시간':>16}  {'출처':>8}  내용")
    print("-" * 80)
    for item in items:
        ts = fmt_time(item.get("timestamp", 0))
        src = item.get("source", "?")[:8]
        content = item.get("content", "")[:50]
        print(f"{item['id']:>20}  {ts:>16}  {src:>8}  {content}")
    print(f"\n총 {len(items)}개 (전체: {mem.count()}개)")


def cmd_search(mem: MemoryManager, query: str, top_k: int = 5) -> None:
    import asyncio
    results = asyncio.run(mem.search(query, top_k=top_k))
    if not results:
        print("관련 기억을 찾지 못했습니다.")
        return
    print(f"[{query!r}] 관련 기억 {len(results)}개:")
    for i, content in enumerate(results, 1):
        print(f"  {i}. {content}")


def cmd_delete(mem: MemoryManager, memory_id: int) -> None:
    ok = mem.delete(memory_id)
    if ok:
        print(f"삭제 완료: id={memory_id}")
    else:
        print(f"삭제 실패: id={memory_id}")


def cmd_clear(mem: MemoryManager) -> None:
    items = mem.list_all(limit=10000)
    if not items:
        print("삭제할 기억이 없습니다.")
        return
    confirm = input(f"정말 {len(items)}개를 모두 삭제하시겠습니까? (yes 입력): ")
    if confirm.strip().lower() != "yes":
        print("취소됨")
        return
    deleted = 0
    for item in items:
        if mem.delete(item["id"]):
            deleted += 1
    print(f"{deleted}개 삭제 완료")


def main() -> None:
    parser = argparse.ArgumentParser(description="장기기억 관리 CLI")
    parser.add_argument("--agent", required=True, choices=["claude", "gemini", "codex"], help="에이전트 이름")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="기억 목록 조회")
    p_list.add_argument("--limit", type=int, default=50, help="최대 출력 개수")

    p_search = sub.add_parser("search", help="기억 검색")
    p_search.add_argument("query", help="검색할 내용")
    p_search.add_argument("--top", type=int, default=5, help="검색 결과 수")

    p_delete = sub.add_parser("delete", help="기억 삭제")
    p_delete.add_argument("id", type=int, help="삭제할 기억 ID")

    sub.add_parser("clear", help="전체 기억 삭제")
    sub.add_parser("count", help="기억 개수 확인")

    args = parser.parse_args()
    mem = MemoryManager(args.agent)

    if args.cmd == "list":
        cmd_list(mem, args.limit)
    elif args.cmd == "search":
        cmd_search(mem, args.query, top_k=args.top)
    elif args.cmd == "delete":
        cmd_delete(mem, args.id)
    elif args.cmd == "clear":
        cmd_clear(mem)
    elif args.cmd == "count":
        print(f"[{args.agent}] 장기기억: {mem.count()}개")


if __name__ == "__main__":
    main()
