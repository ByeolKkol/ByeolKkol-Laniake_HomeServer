import asyncio
import logging
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from utils import ensure_directory, safe_filename

logger = logging.getLogger(__name__)


RECORDING_SEMAPHORE = asyncio.Semaphore(5)
MAX_STREAM_TITLE_FILENAME_LENGTH = 100
KST = timedelta(hours=9)


@dataclass
class RecordingResult:
    channel_id: str
    output_file: str
    command: list[str]
    return_code: int
    stdout: str
    stderr: str
    started_at: datetime
    ended_at: datetime

    @property
    def succeeded(self) -> bool:
        return self.return_code == 0


def _streamlink_bin() -> str:
    binary = shutil.which("streamlink")
    if not binary:
        raise FileNotFoundError("streamlink executable is not available in PATH")
    return binary


def _build_streamlink_command(
    *,
    stream_url: str,
    quality: str,
    output_file: Path,
    cookies: dict[str, str] | None,
) -> list[str]:
    command = [_streamlink_bin(), stream_url, quality, "-o", str(output_file)]
    for name, value in (cookies or {}).items():
        command.extend(["--http-cookie", f"{name}={value}"])
    return command


def _build_recording_filename(
    *,
    channel_id: str,
    display_name: str | None,
    stream_title: str | None,
    now: datetime,
) -> str:
    stamp = now.strftime("%y%m%d_%H%M%S")
    display_part = safe_filename(display_name or channel_id, fallback=channel_id)
    title_source = (stream_title or "untitled").strip()
    title_part = safe_filename(title_source, fallback="untitled")[:MAX_STREAM_TITLE_FILENAME_LENGTH]
    return f"{display_part}_{stamp}_{title_part}.ts"


async def run_streamlink_recording(
    *,
    channel_id: str,
    display_name: str | None = None,
    stream_title: str | None = None,
    stream_url: str,
    output_dir: str | Path,
    quality: str = "best",
    cookies: dict[str, str] | None = None,
    _path_sink: list | None = None,
) -> RecordingResult:
    """
    Run a streamlink recording to completion.
    Concurrency is capped by RECORDING_SEMAPHORE (max 5 in-flight recordings).
    """
    async with RECORDING_SEMAPHORE:
        now_utc = datetime.now(tz=UTC)
        now_kst = now_utc + KST
        directory = ensure_directory(output_dir)
        filename = _build_recording_filename(
            channel_id=channel_id,
            display_name=display_name,
            stream_title=stream_title,
            now=now_kst,
        )
        output_file = directory / filename
        if _path_sink is not None:
            _path_sink.append(str(output_file))
        command = _build_streamlink_command(
            stream_url=stream_url,
            quality=quality,
            output_file=output_file,
            cookies=cookies,
        )
        logger.info("Starting recording channel=%s output=%s", channel_id, output_file)

        started_at = datetime.now(tz=UTC)
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await process.communicate()
        except asyncio.CancelledError:
            process.kill()
            try:
                await process.communicate()
            except Exception:
                pass
            raise
        ended_at = datetime.now(tz=UTC)

        result = RecordingResult(
            channel_id=channel_id,
            output_file=str(output_file),
            command=command,
            return_code=process.returncode,
            stdout=stdout.decode("utf-8", errors="replace"),
            stderr=stderr.decode("utf-8", errors="replace"),
            started_at=started_at,
            ended_at=ended_at,
        )
        if result.succeeded:
            logger.info("Recording completed channel=%s file=%s", channel_id, output_file)
        else:
            logger.error(
                "Recording failed channel=%s code=%s stderr=%s",
                channel_id,
                result.return_code,
                result.stderr[-500:],
            )
        return result


async def start_streamlink_recording(
    *,
    channel_id: str,
    display_name: str | None = None,
    stream_title: str | None = None,
    stream_url: str,
    output_dir: str | Path,
    quality: str = "best",
    cookies: dict[str, str] | None = None,
    _path_sink: list | None = None,
) -> asyncio.Task[RecordingResult]:
    """
    Schedule a recording task and return it immediately.
    """
    return asyncio.create_task(
        run_streamlink_recording(
            channel_id=channel_id,
            display_name=display_name,
            stream_title=stream_title,
            stream_url=stream_url,
            output_dir=output_dir,
            quality=quality,
            cookies=cookies,
            _path_sink=_path_sink,
        )
    )
