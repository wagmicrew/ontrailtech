"""Expo Go admin endpoints — PM2 process management for ontrail-expo."""
import json
import logging
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from models import User
from dependencies import require_admin

logger = logging.getLogger(__name__)

router = APIRouter()

PM2_PROCESS_NAME = "ontrail-expo"
PM2_LOG_FILE = Path.home() / ".pm2" / "logs" / f"{PM2_PROCESS_NAME}-out.log"


# ── Response schemas ──

class ExpoStatusResponse(BaseModel):
    status: str
    port: int
    uptime: int
    memory_mb: float
    pid: int


class ExpoRestartResponse(BaseModel):
    status: str
    message: str


class ExpoPortRequest(BaseModel):
    port: int = Field(..., ge=1024, le=65535)


class ExpoPortResponse(BaseModel):
    port: int
    message: str


class ExpoLogsResponse(BaseModel):
    lines: list[str]


class ExpoSessionsResponse(BaseModel):
    count: int
    sessions: list[dict]


# ── Helpers ──

def _get_pm2_process_info() -> dict | None:
    """Run `pm2 jlist` and extract info for the ontrail-expo process."""
    try:
        result = subprocess.run(
            ["pm2", "jlist"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None
        processes = json.loads(result.stdout)
        for proc in processes:
            if proc.get("name") == PM2_PROCESS_NAME:
                return proc
        return None
    except Exception:
        logger.exception("Failed to query PM2")
        return None


def _parse_status(proc: dict) -> ExpoStatusResponse:
    """Parse PM2 process JSON into ExpoStatusResponse."""
    env = proc.get("pm2_env", {})
    monit = proc.get("monit", {})

    status_map = {
        "online": "running",
        "stopping": "stopped",
        "stopped": "stopped",
        "errored": "errored",
    }
    raw_status = env.get("status", "unknown")
    status = status_map.get(raw_status, raw_status)

    # Extract port from args string (e.g. "expo start --port 8081 --tunnel")
    port = 8081
    args = env.get("args", "")
    if isinstance(args, list):
        args = " ".join(args)
    if "--port" in args:
        try:
            parts = args.split("--port")
            port = int(parts[1].strip().split()[0])
        except (IndexError, ValueError):
            pass

    uptime_ms = env.get("pm_uptime", 0)
    import time
    uptime = int((time.time() * 1000 - uptime_ms) / 1000) if uptime_ms else 0

    memory_bytes = monit.get("memory", 0)
    memory_mb = round(memory_bytes / (1024 * 1024), 1)

    pid = proc.get("pid", 0)

    return ExpoStatusResponse(
        status=status,
        port=port,
        uptime=max(uptime, 0),
        memory_mb=memory_mb,
        pid=pid,
    )


# ── GET /admin/expo/status ──

@router.get("/status", response_model=ExpoStatusResponse)
async def expo_status(user: User = Depends(require_admin)):
    """Return PM2 process status for ontrail-expo."""
    proc = _get_pm2_process_info()
    if proc is None:
        return ExpoStatusResponse(status="stopped", port=8081, uptime=0, memory_mb=0, pid=0)
    return _parse_status(proc)


# ── POST /admin/expo/restart ──

@router.post("/restart", response_model=ExpoRestartResponse)
async def expo_restart(user: User = Depends(require_admin)):
    """Restart the ontrail-expo PM2 process (or start if stopped)."""
    proc = _get_pm2_process_info()

    try:
        if proc is None:
            # Process not in PM2 list — try to start it
            result = subprocess.run(
                ["pm2", "start", "ecosystem.config.js", "--only", PM2_PROCESS_NAME],
                capture_output=True, text=True, timeout=15,
                cwd=str(Path(__file__).resolve().parents[3] / "infra" / "pm2"),
            )
        else:
            result = subprocess.run(
                ["pm2", "restart", PM2_PROCESS_NAME],
                capture_output=True, text=True, timeout=15,
            )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"PM2 command failed: {result.stderr.strip()}",
            )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="PM2 command timed out")

    # Fetch new status
    new_proc = _get_pm2_process_info()
    new_status = _parse_status(new_proc).status if new_proc else "unknown"

    return ExpoRestartResponse(status=new_status, message="Expo process restarted")


# ── PUT /admin/expo/port ──

@router.put("/port", response_model=ExpoPortResponse)
async def expo_update_port(
    req: ExpoPortRequest,
    user: User = Depends(require_admin),
):
    """Update the Expo Go server port in PM2 config and restart."""
    ecosystem_path = Path(__file__).resolve().parents[3] / "infra" / "pm2" / "ecosystem.config.js"

    if not ecosystem_path.exists():
        raise HTTPException(status_code=500, detail="PM2 ecosystem config not found")

    # Read and update the port in the ecosystem config
    content = ecosystem_path.read_text()
    import re
    updated = re.sub(
        r"(--port\s+)\d+",
        f"\\g<1>{req.port}",
        content,
    )
    ecosystem_path.write_text(updated)

    # Restart with new config
    try:
        result = subprocess.run(
            ["pm2", "restart", PM2_PROCESS_NAME, "--update-env"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"PM2 restart failed: {result.stderr.strip()}",
            )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="PM2 restart timed out")

    return ExpoPortResponse(port=req.port, message=f"Port updated to {req.port} and process restarted")


# ── GET /admin/expo/logs ──

@router.get("/logs", response_model=ExpoLogsResponse)
async def expo_logs(user: User = Depends(require_admin)):
    """Return the last 50 lines from the PM2 log file."""
    if not PM2_LOG_FILE.exists():
        return ExpoLogsResponse(lines=[])

    try:
        with open(PM2_LOG_FILE, "r") as f:
            all_lines = f.readlines()
        last_50 = [line.rstrip("\n") for line in all_lines[-50:]]
        return ExpoLogsResponse(lines=last_50)
    except Exception:
        logger.exception("Failed to read PM2 log file")
        return ExpoLogsResponse(lines=[])


# ── GET /admin/expo/sessions ──

@router.get("/sessions", response_model=ExpoSessionsResponse)
async def expo_sessions(user: User = Depends(require_admin)):
    """Return count and details of active WebSocket connections."""
    # Check active connections by inspecting the Expo dev server
    # For now, use netstat/ss to count WebSocket connections to the Expo port
    proc = _get_pm2_process_info()
    port = 8081
    if proc:
        status = _parse_status(proc)
        port = status.port

    try:
        result = subprocess.run(
            ["ss", "-tn", f"sport = :{port}"],
            capture_output=True, text=True, timeout=5,
        )
        lines = result.stdout.strip().split("\n")[1:]  # skip header
        sessions = []
        for line in lines:
            parts = line.split()
            if len(parts) >= 5:
                sessions.append({
                    "state": parts[0],
                    "local": parts[3],
                    "peer": parts[4],
                })
        return ExpoSessionsResponse(count=len(sessions), sessions=sessions)
    except Exception:
        logger.exception("Failed to query active sessions")
        return ExpoSessionsResponse(count=0, sessions=[])
