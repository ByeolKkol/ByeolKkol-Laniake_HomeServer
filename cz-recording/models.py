from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.sql import func

from database import Base


class Channel(Base):
    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    quality = Column(String(32), nullable=False, default="best", server_default="best")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Cookie(Base):
    __tablename__ = "cookies"
    __table_args__ = (
        Index(
            "uq_cookies_global_cookie_name",
            "cookie_name",
            unique=True,
            postgresql_where=text("channel_id IS NULL"),
        ),
        Index(
            "ix_cookies_channel_cookie_name",
            "channel_id",
            "cookie_name",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("channels.id", ondelete="CASCADE"), nullable=True)
    cookie_name = Column(String(255), nullable=False)
    cookie_value = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Recording(Base):
    __tablename__ = "recordings"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("channels.id", ondelete="SET NULL"), nullable=True)
    stream_id = Column(String(128), nullable=True, index=True)
    title = Column(String(500), nullable=True)
    file_path = Column(Text, nullable=False)
    file_size_bytes = Column(BigInteger, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    status = Column(String(32), nullable=False, default="pending")
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UploadLog(Base):
    __tablename__ = "upload_logs"

    id = Column(Integer, primary_key=True, index=True)
    recording_id = Column(Integer, ForeignKey("recordings.id", ondelete="CASCADE"), nullable=False)
    destination = Column(String(128), nullable=False)
    status = Column(String(32), nullable=False, default="queued")
    progress_percent = Column(Integer, nullable=True)
    bytes_uploaded = Column(BigInteger, nullable=True)
    bytes_total = Column(BigInteger, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    message = Column(Text, nullable=True)
    drive_file_id = Column(String(255), nullable=True)
    drive_file_url = Column(Text, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
