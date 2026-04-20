"""Expo Go admin endpoints — PM2 process management for ontrail-expo."""
import json
import logging
import re
import subprocess
import time
import urllib.request
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from models import User
from dependencies import require_admin

logger = logging.getLogger(__name__)

router = APIRouter()

PM2_PROCESS_NAME = "ontrail-expo"
PM2_LOG_FILE = Path.home() / ".pm2" / "logs" / f"{PM2_PROCESS_NAME}-out.log"
CLOUDFLARE_PROCESS_NAME = "ontrail-expo-cloudflare"
CLOUDFLARE_LOG_FILE = Path.home() / ".pm2" / "logs" / f"{CLOUDFLARE_PROCESS_NAME}-out.log"
CLOUDFLARE_ERROR_LOG_FILE = Path.home() / ".pm2" / "logs" / f"{CLOUDFLARE_PROCESS_NAME}-error.log"
PROJECT_ROOT = Path(__file__).resolve().parents[3]
PM2_ECOSYSTEM_PATH = PROJECT_ROOT / "infra" / "pm2" / "ecosystem.config.js"
DEFAULT_EXPO_PORT = 8082
EXPO_WEB_URL = "https://expo.ontrail.tech"
EXPO_MANIFEST_URL = "https://expo.ontrail.tech/index.exp"
EXPO_DEEP_LINK = "exps://expo.ontrail.tech/index.exp"


# ── Response schemas ──

class ExpoStatusResponse(BaseModel):
    status: str
    port: int
    uptime: int
    memory_mb: float
    pid: int
    mode: str = "tunnel"
    web_url: str = EXPO_WEB_URL
    manifest_url: str = EXPO_MANIFEST_URL
    deep_link: str = EXPO_DEEP_LINK
    cloudflare_status: str = "stopped"
    cloudflare_url: str | None = None
    port_health_status: str = "unknown"
    port_health_message: str = ""
    port_health_pid: int | None = None


class ExpoPortHealthResponse(BaseModel):
    port: int
    status: str
    message: str
    pid: int | None = None


class ExpoRestartResponse(BaseModel):
    status: str
    message: str


class ExpoControlResponse(BaseModel):
    status: str
    message: str


class ExpoPortRequest(BaseModel):
    port: int = Field(..., ge=1024, le=65535)


class ExpoPortResponse(BaseModel):
    port: int
    message: str


class ExpoModeRequest(BaseModel):
    mode: str = Field(..., pattern="^(tunnel|lan|local)$")


class ExpoModeResponse(BaseModel):
    mode: str
    message: str


class ExpoLogsResponse(BaseModel):
    lines: list[str]


class ExpoSessionsResponse(BaseModel):
    count: int
    sessions: list[dict]


class ExpoPrewarmResponse(BaseModel):
    status: str
    message: str


class ExpoCloudflareResponse(BaseModel):
    status: str
    message: str
    url: str | None = None


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


def _get_named_pm2_process(name: str) -> dict | None:
    try:
        result = subprocess.run(
            ["pm2", "jlist"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None
        processes = json.loads(result.stdout)
        for proc in processes:
            if proc.get("name") == name:
                return proc
        return None
    except Exception:
        logger.exception("Failed to query PM2 process %s", name)
        return None


def _get_args_string(proc: dict | None) -> str:
    if not proc:
        return ""
    args = proc.get("pm2_env", {}).get("args", "")
    if isinstance(args, list):
        return " ".join(args)
    return str(args or "")


def _detect_mode(args: str) -> str:
    if "--tunnel" in args:
        return "tunnel"
    if "--host localhost" in args or "--localhost" in args:
        return "local"
    if "--host lan" in args or "--lan" in args:
        return "lan"
    return "proxy"


def _normalize_expo_args(args: str, port: int | None = None, mode: str | None = None) -> str:
    normalized = args or ""
    normalized = normalized.replace("expo start", " ")
    normalized = re.sub(r"--port\s+\d+", "", normalized)
    normalized = re.sub(r"--tunnel\b", "", normalized)
    normalized = re.sub(r"--lan\b", "", normalized)
    normalized = re.sub(r"--localhost\b", "", normalized)
    normalized = re.sub(r"--host\s+\w+", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    target_port = port or DEFAULT_EXPO_PORT
    target_mode = mode or _detect_mode(args)
    preserved_flags = []
    if "--strict-port" in args and "--strict-port" not in normalized:
        preserved_flags.append("--strict-port")

    normalized = f"{normalized} --port {target_port}".strip()

    if target_mode == "tunnel":
        normalized += " --tunnel"
    elif target_mode == "lan":
        normalized += " --host lan"
    elif target_mode == "local":
        normalized += " --host localhost"

    if preserved_flags:
        normalized = f"{normalized} {' '.join(preserved_flags)}".strip()

    return normalized.strip()


def _update_ecosystem_config(port: int | None = None, mode: str | None = None) -> str:
    if not PM2_ECOSYSTEM_PATH.exists():
        raise HTTPException(status_code=500, detail="PM2 ecosystem config not found")

    content = PM2_ECOSYSTEM_PATH.read_text()
    pattern = re.compile(r"(name:\s*'ontrail-expo'[\s\S]*?args:\s*')([^']*)(')")

    def replacer(match: re.Match[str]) -> str:
        current_args = match.group(2)
        new_args = _normalize_expo_args(current_args, port=port, mode=mode)
        return f"{match.group(1)}{new_args}{match.group(3)}"

    updated_content, replacements = pattern.subn(replacer, content, count=1)
    if replacements != 1:
        raise HTTPException(status_code=500, detail="Unable to update Expo PM2 config")

    PM2_ECOSYSTEM_PATH.write_text(updated_content)
    return updated_content


def _run_pm2(command: list[str], *, cwd: Path | None = None, timeout: int = 15) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(cwd) if cwd else None,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="PM2 command timed out")

    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr.strip() or result.stdout.strip() or "PM2 command failed")
    return result


def _get_listening_pid_for_port(port: int) -> int | None:
    try:
        result = subprocess.run(
            ["ss", "-ltnp", f"sport = :{port}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None

        for line in result.stdout.splitlines()[1:]:
            match = re.search(r"pid=(\d+)", line)
            if match:
                return int(match.group(1))
    except Exception:
        logger.exception("Failed to inspect listening port %s", port)
    return None


def _pid_descends_from(pid: int, ancestor_pid: int) -> bool:
    current_pid = pid

    try:
        while current_pid and current_pid > 1:
            if current_pid == ancestor_pid:
                return True

            result = subprocess.run(
                ["ps", "-o", "ppid=", "-p", str(current_pid)],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode != 0:
                return False

            parent_text = result.stdout.strip()
            if not parent_text:
                return False

            parent_pid = int(parent_text)
            if parent_pid == ancestor_pid:
                return True
            if parent_pid == current_pid:
                return False

            current_pid = parent_pid
    except Exception:
        logger.exception("Failed to inspect process ancestry pid=%s ancestor=%s", pid, ancestor_pid)

    return False


def _get_port_health(port: int, proc: dict | None = None) -> ExpoPortHealthResponse:
    pm2_proc = proc or _get_pm2_process_info()
    ontrail_pid = pm2_proc.get("pid") if pm2_proc else None
    listener_pid = _get_listening_pid_for_port(port)

    if listener_pid is None:
        return ExpoPortHealthResponse(
            port=port,
            status="free",
            message=f"Port {port} is free.",
            pid=None,
        )

    if ontrail_pid and (listener_pid == ontrail_pid or _pid_descends_from(listener_pid, ontrail_pid)):
        return ExpoPortHealthResponse(
            port=port,
            status="bound-by-ontrail",
            message=f"Port {port} is bound by the current OnTrail Expo process.",
            pid=listener_pid,
        )

    return ExpoPortHealthResponse(
        port=port,
        status="in-use-by-other-process",
        message=f"Port {port} is already in use by another process.",
        pid=listener_pid,
    )


def _get_cloudflare_url() -> str | None:
    try:
        for log_file in (CLOUDFLARE_LOG_FILE, CLOUDFLARE_ERROR_LOG_FILE):
            if not log_file.exists():
                continue
            for line in reversed(log_file.read_text().splitlines()):
                match = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
                if match:
                    return match.group(0)
    except Exception:
        logger.exception("Failed to parse Cloudflare tunnel log")
    return None


def _get_cloudflare_status() -> tuple[str, str | None]:
    proc = _get_named_pm2_process(CLOUDFLARE_PROCESS_NAME)
    if proc is None:
        return "stopped", None

    raw_status = proc.get("pm2_env", {}).get("status", "stopped")
    status_map = {
        "online": "running",
        "stopped": "stopped",
        "stopping": "stopped",
        "errored": "errored",
    }
    return status_map.get(raw_status, raw_status), _get_cloudflare_url()


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
    port = DEFAULT_EXPO_PORT
    args = _get_args_string(proc)
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

    port_health = _get_port_health(port, proc)

    return ExpoStatusResponse(
        status=status,
        port=port,
        uptime=max(uptime, 0),
        memory_mb=memory_mb,
        pid=pid,
        mode=_detect_mode(args),
        web_url=EXPO_WEB_URL,
        manifest_url=EXPO_MANIFEST_URL,
        deep_link=EXPO_DEEP_LINK,
        cloudflare_status=_get_cloudflare_status()[0],
        cloudflare_url=_get_cloudflare_status()[1],
        port_health_status=port_health.status,
        port_health_message=port_health.message,
        port_health_pid=port_health.pid,
    )


# ── GET /admin/expo/status ──

@router.get("/status", response_model=ExpoStatusResponse)
async def expo_status(user: User = Depends(require_admin)):
    """Return PM2 process status for ontrail-expo."""
    proc = _get_pm2_process_info()
    if proc is None:
        cloudflare_status, cloudflare_url = _get_cloudflare_status()
        return ExpoStatusResponse(
            status="stopped",
            port=DEFAULT_EXPO_PORT,
            uptime=0,
            memory_mb=0,
            pid=0,
            mode="tunnel",
            manifest_url=EXPO_MANIFEST_URL,
            cloudflare_status=cloudflare_status,
            cloudflare_url=cloudflare_url,
            port_health_status=_get_port_health(DEFAULT_EXPO_PORT).status,
            port_health_message=_get_port_health(DEFAULT_EXPO_PORT).message,
            port_health_pid=_get_port_health(DEFAULT_EXPO_PORT).pid,
        )
    return _parse_status(proc)


@router.get("/port-check", response_model=ExpoPortHealthResponse)
async def expo_port_check(
    port: int = Query(DEFAULT_EXPO_PORT, ge=1024, le=65535),
    user: User = Depends(require_admin),
):
    """Check whether a requested Expo port is free, owned by OnTrail, or busy."""
    del user
    return _get_port_health(port)


@router.post("/start", response_model=ExpoControlResponse)
async def expo_start(user: User = Depends(require_admin)):
    """Start the Expo Go PM2 process if it is not already running."""
    proc = _get_pm2_process_info()
    if proc and _parse_status(proc).status == "running":
        return ExpoControlResponse(status="running", message="Expo process is already running")

    if proc is None:
        _run_pm2(["pm2", "start", "ecosystem.config.js", "--only", PM2_PROCESS_NAME], cwd=PM2_ECOSYSTEM_PATH.parent)
    else:
        _run_pm2(["pm2", "restart", PM2_PROCESS_NAME])

    new_proc = _get_pm2_process_info()
    new_status = _parse_status(new_proc).status if new_proc else "unknown"
    return ExpoControlResponse(status=new_status, message="Expo process started")


@router.post("/stop", response_model=ExpoControlResponse)
async def expo_stop(user: User = Depends(require_admin)):
    """Stop the Expo Go PM2 process."""
    proc = _get_pm2_process_info()
    if proc is None:
        return ExpoControlResponse(status="stopped", message="Expo process is already stopped")

    current_status = _parse_status(proc).status
    if current_status == "stopped":
        return ExpoControlResponse(status="stopped", message="Expo process is already stopped")

    _run_pm2(["pm2", "stop", PM2_PROCESS_NAME])
    return ExpoControlResponse(status="stopped", message="Expo process stopped")


# ── POST /admin/expo/restart ──

@router.post("/restart", response_model=ExpoRestartResponse)
async def expo_restart(user: User = Depends(require_admin)):
    """Restart the ontrail-expo PM2 process (or start if stopped)."""
    proc = _get_pm2_process_info()

    if proc is None:
        _run_pm2(["pm2", "start", "ecosystem.config.js", "--only", PM2_PROCESS_NAME], cwd=PM2_ECOSYSTEM_PATH.parent)
    else:
        _run_pm2(["pm2", "restart", PM2_PROCESS_NAME])

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
    _update_ecosystem_config(port=req.port)
    _run_pm2(["pm2", "restart", PM2_PROCESS_NAME, "--update-env"])

    return ExpoPortResponse(port=req.port, message=f"Port updated to {req.port} and process restarted")


@router.put("/mode", response_model=ExpoModeResponse)
async def expo_update_mode(
    req: ExpoModeRequest,
    user: User = Depends(require_admin),
):
    """Switch Expo connection mode and restart the process."""
    _update_ecosystem_config(mode=req.mode)
    _run_pm2(["pm2", "restart", PM2_PROCESS_NAME, "--update-env"])
    return ExpoModeResponse(mode=req.mode, message=f"Expo connection mode updated to {req.mode}")


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
    port = DEFAULT_EXPO_PORT
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


@router.post("/prewarm", response_model=ExpoPrewarmResponse)
async def expo_prewarm(user: User = Depends(require_admin)):
    """Touch the Expo server locally so Metro stays warm before device connects."""
    proc = _get_pm2_process_info()
    if proc is None:
        raise HTTPException(status_code=400, detail="Expo process is not running")

    status = _parse_status(proc)
    if status.status != "running":
        raise HTTPException(status_code=400, detail="Expo process is not running")

    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{status.port}", timeout=10) as response:
            response.read(512)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Expo prewarm failed: {exc}")

    return ExpoPrewarmResponse(status="running", message="Expo bundler prewarmed")


@router.post("/cloudflare/start", response_model=ExpoCloudflareResponse)
async def expo_cloudflare_start(user: User = Depends(require_admin)):
    """Start a Cloudflare quick tunnel for the Expo server."""
    proc = _get_pm2_process_info()
    if proc is None or _parse_status(proc).status != "running":
        raise HTTPException(status_code=400, detail="Expo process must be running before starting a Cloudflare tunnel")

    port = _parse_status(proc).port
    existing_status, existing_url = _get_cloudflare_status()
    if existing_status == "running":
        return ExpoCloudflareResponse(status="running", message="Cloudflare tunnel is already running", url=existing_url)

    _run_pm2([
        "pm2", "start", "cloudflared",
        "--name", CLOUDFLARE_PROCESS_NAME,
        "--",
        "tunnel", "--url", f"http://127.0.0.1:{port}", "--no-autoupdate",
    ], timeout=20)

    time.sleep(4)
    tunnel_url = _get_cloudflare_url()
    return ExpoCloudflareResponse(status="running", message="Cloudflare tunnel started", url=tunnel_url)


@router.post("/cloudflare/stop", response_model=ExpoCloudflareResponse)
async def expo_cloudflare_stop(user: User = Depends(require_admin)):
    """Stop the Cloudflare quick tunnel for the Expo server."""
    status, url = _get_cloudflare_status()
    if status == "stopped":
        return ExpoCloudflareResponse(status="stopped", message="Cloudflare tunnel is already stopped", url=url)

    _run_pm2(["pm2", "delete", CLOUDFLARE_PROCESS_NAME])
    return ExpoCloudflareResponse(status="stopped", message="Cloudflare tunnel stopped", url=None)
