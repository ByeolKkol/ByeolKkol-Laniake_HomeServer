"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "channels",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("channel_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("quality", sa.String(32), nullable=False, server_default="best"),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_channels_id", "channels", ["id"])
    op.create_index("ix_channels_channel_id", "channels", ["channel_id"], unique=True)

    op.create_table(
        "cookies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("channel_id", sa.Integer(), sa.ForeignKey("channels.id", ondelete="CASCADE"), nullable=True),
        sa.Column("cookie_name", sa.String(255), nullable=False),
        sa.Column("cookie_value", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cookies_id", "cookies", ["id"])
    op.create_index(
        "uq_cookies_global_cookie_name",
        "cookies",
        ["cookie_name"],
        unique=True,
        postgresql_where=sa.text("channel_id IS NULL"),
    )
    op.create_index("ix_cookies_channel_cookie_name", "cookies", ["channel_id", "cookie_name"])

    op.create_table(
        "recordings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("channel_id", sa.Integer(), sa.ForeignKey("channels.id", ondelete="SET NULL"), nullable=True),
        sa.Column("stream_id", sa.String(128), nullable=True),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recordings_id", "recordings", ["id"])
    op.create_index("ix_recordings_stream_id", "recordings", ["stream_id"])

    op.create_table(
        "upload_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recording_id", sa.Integer(), sa.ForeignKey("recordings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("destination", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("progress_percent", sa.Integer(), nullable=True),
        sa.Column("bytes_uploaded", sa.BigInteger(), nullable=True),
        sa.Column("bytes_total", sa.BigInteger(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("drive_file_id", sa.String(255), nullable=True),
        sa.Column("drive_file_url", sa.Text(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_upload_logs_id", "upload_logs", ["id"])
    op.create_index("ix_upload_logs_recording_id", "upload_logs", ["recording_id"])


def downgrade() -> None:
    op.drop_table("upload_logs")
    op.drop_table("recordings")
    op.drop_table("cookies")
    op.drop_table("channels")
