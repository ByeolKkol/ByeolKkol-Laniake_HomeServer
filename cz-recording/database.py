import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://localhost:5432/chzzk")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def query_global_cookies(db, cookie_model):
    return db.query(cookie_model).filter(cookie_model.channel_id.is_(None))


def ensure_upload_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    if "upload_logs" not in tables:
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE upload_logs (
                        id SERIAL PRIMARY KEY,
                        recording_id INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
                        destination VARCHAR(128) NOT NULL,
                        status VARCHAR(32) NOT NULL DEFAULT 'queued',
                        progress_percent INTEGER,
                        bytes_uploaded BIGINT,
                        bytes_total BIGINT,
                        started_at TIMESTAMPTZ,
                        message TEXT,
                        drive_file_id VARCHAR(255),
                        drive_file_url TEXT,
                        uploaded_at TIMESTAMPTZ,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    CREATE INDEX ix_upload_logs_id ON upload_logs (id);
                    CREATE INDEX ix_upload_logs_recording_id ON upload_logs (recording_id);
                    """
                )
            )
        return

    existing_columns = {column["name"] for column in inspector.get_columns("upload_logs")}
    desired_columns = {
        "progress_percent": "INTEGER",
        "bytes_uploaded": "BIGINT",
        "bytes_total": "BIGINT",
        "started_at": "TIMESTAMPTZ",
        "drive_file_id": "VARCHAR(255)",
        "drive_file_url": "TEXT",
        "updated_at": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    }
    with engine.begin() as conn:
        for name, definition in desired_columns.items():
            if name not in existing_columns:
                conn.execute(text(f"ALTER TABLE upload_logs ADD COLUMN {name} {definition}"))


def ensure_channel_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "channels" not in tables:
        return

    existing_columns = {column["name"] for column in inspector.get_columns("channels")}
    if "quality" in existing_columns:
        return

    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE channels ADD COLUMN quality VARCHAR(32) NOT NULL DEFAULT 'best'")
        )
