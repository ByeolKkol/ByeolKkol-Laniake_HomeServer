#!/usr/bin/env python3
"""CHZZK Recorder DB 점검/정리 스크립트

사용법:
  DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/chzzk \
    ../.venv/bin/python db_check_and_repair.py --hours 6 --fix

기본은 read-only 점검. --fix를 주면 정리 쿼리 적용.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime

from sqlalchemy import text

from database import engine


def _scalar(conn, query: str, **params):
    return conn.execute(text(query), params).scalar()


def collect_metrics(hours: int) -> dict:
    with engine.begin() as conn:
        metrics = {
            "channels_total": _scalar(conn, "SELECT COUNT(*) FROM channels"),
            "recordings_total": _scalar(conn, "SELECT COUNT(*) FROM recordings"),
            "upload_logs_total": _scalar(conn, "SELECT COUNT(*) FROM upload_logs"),
            "recordings_stale_active": _scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM recordings
                WHERE status IN ('recording', 'queued')
                  AND started_at IS NOT NULL
                  AND started_at < NOW() - (:hours || ' hours')::interval
                """,
                hours=hours,
            ),
            "recordings_completed_missing_path": _scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM recordings
                WHERE status = 'completed'
                  AND (file_path IS NULL OR file_path = '')
                """,
            ),
            "uploads_stale_in_progress": _scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM upload_logs
                WHERE status IN ('queued', 'uploading', 'in_progress')
                  AND created_at < NOW() - (:hours || ' hours')::interval
                """,
                hours=hours,
            ),
            "uploads_orphaned": _scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM upload_logs u
                LEFT JOIN recordings r ON r.id = u.recording_id
                WHERE r.id IS NULL
                """,
            ),
        }

        rec_status = conn.execute(
            text("SELECT status, COUNT(*) FROM recordings GROUP BY status ORDER BY COUNT(*) DESC")
        ).fetchall()
        up_status = conn.execute(
            text("SELECT status, COUNT(*) FROM upload_logs GROUP BY status ORDER BY COUNT(*) DESC")
        ).fetchall()

    metrics["recording_status_breakdown"] = [{"status": s, "count": c} for s, c in rec_status]
    metrics["upload_status_breakdown"] = [{"status": s, "count": c} for s, c in up_status]
    return metrics


def apply_repairs(hours: int) -> dict:
    repaired = {
        "recordings_stale_active_to_failed": 0,
        "recordings_completed_missing_path_to_failed": 0,
        "uploads_stale_to_failed": 0,
        "uploads_orphaned_deleted": 0,
    }

    now = datetime.now(UTC)
    with engine.begin() as conn:
        q1 = conn.execute(
            text(
                """
                UPDATE recordings
                SET status = 'failed',
                    ended_at = COALESCE(ended_at, :now),
                    title = COALESCE(title, 'stale recording auto-repaired')
                WHERE status IN ('recording', 'queued')
                  AND started_at IS NOT NULL
                  AND started_at < NOW() - (:hours || ' hours')::interval
                """
            ),
            {"hours": hours, "now": now},
        )
        repaired["recordings_stale_active_to_failed"] = q1.rowcount or 0

        q2 = conn.execute(
            text(
                """
                UPDATE recordings
                SET status = 'failed',
                    ended_at = COALESCE(ended_at, :now),
                    title = COALESCE(title, 'completed without file_path auto-repaired')
                WHERE status = 'completed'
                  AND (file_path IS NULL OR file_path = '')
                """
            ),
            {"now": now},
        )
        repaired["recordings_completed_missing_path_to_failed"] = q2.rowcount or 0

        q3 = conn.execute(
            text(
                """
                UPDATE upload_logs
                SET status = 'failed',
                    message = COALESCE(message, 'stale upload auto-repaired'),
                    updated_at = :now
                WHERE status IN ('queued', 'uploading', 'in_progress')
                  AND created_at < NOW() - (:hours || ' hours')::interval
                """
            ),
            {"hours": hours, "now": now},
        )
        repaired["uploads_stale_to_failed"] = q3.rowcount or 0

        q4 = conn.execute(
            text(
                """
                DELETE FROM upload_logs u
                WHERE NOT EXISTS (
                  SELECT 1 FROM recordings r WHERE r.id = u.recording_id
                )
                """
            )
        )
        repaired["uploads_orphaned_deleted"] = q4.rowcount or 0

    return repaired


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours", type=int, default=6, help="stale 판정 시간(시간)")
    parser.add_argument("--fix", action="store_true", help="정리 쿼리 실제 적용")
    args = parser.parse_args()

    before = collect_metrics(args.hours)
    result = {
        "ok": True,
        "hours": args.hours,
        "fix_applied": False,
        "before": before,
    }

    if args.fix:
        repaired = apply_repairs(args.hours)
        after = collect_metrics(args.hours)
        result["fix_applied"] = True
        result["repaired"] = repaired
        result["after"] = after

    print(json.dumps(result, ensure_ascii=False, default=str, indent=2))


if __name__ == "__main__":
    main()
