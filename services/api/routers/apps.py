"""
App Installer Router — /admin/apps
Handles uploading, installing, uninstalling and configuring .app packages.

.app file format (ZIP):
  manifest.json        – required: id, name, version, description, author,
                          tables_created[], settings_schema[]
  install.sql          – SQL executed on install
  uninstall.sql        – SQL executed on full uninstall (drops tables + data)
  uninstall_keep.sql   – SQL executed when keeping data (removes constraints/views only)
  icon.svg             – optional SVG icon
"""
import io
import json
import zipfile
from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_admin
from models import InstalledApp

router = APIRouter()

# ── max upload size: 10 MB ──────────────────────────────────────────────────
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_SQL_BYTES = 512 * 1024  # 512 KB per SQL file


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class AppSettingsUpdate(BaseModel):
    settings: dict[str, Any]


class AppStatusUpdate(BaseModel):
    status: str  # "installed" | "disabled"


# ── Helpers ──────────────────────────────────────────────────────────────────

def _serialize_app(app: InstalledApp) -> dict:
    return {
        "id": str(app.id),
        "app_id": app.app_id,
        "name": app.name,
        "version": app.version,
        "description": app.description,
        "author": app.author,
        "icon": app.icon,
        "status": app.status,
        "settings": app.settings or {},
        "settings_schema": app.settings_schema or [],
        "tables_created": app.tables_created or [],
        "manifest": app.manifest or {},
        "installed_at": app.installed_at.isoformat() if app.installed_at else None,
        "updated_at": app.updated_at.isoformat() if app.updated_at else None,
    }


def _extract_app_zip(data: bytes) -> dict:
    """Parse a .app ZIP and return its components."""
    if not zipfile.is_zipfile(io.BytesIO(data)):
        raise HTTPException(400, "Uploaded file is not a valid ZIP archive")

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = zf.namelist()

        if "manifest.json" not in names:
            raise HTTPException(400, "manifest.json missing from .app package")

        manifest_raw = zf.read("manifest.json")
        try:
            manifest = json.loads(manifest_raw)
        except json.JSONDecodeError:
            raise HTTPException(400, "manifest.json is not valid JSON")

        for required in ("id", "name", "version"):
            if not manifest.get(required):
                raise HTTPException(400, f"manifest.json missing required field: {required}")

        def _read_sql(filename: str) -> Optional[str]:
            if filename not in names:
                return None
            raw = zf.read(filename)
            if len(raw) > MAX_SQL_BYTES:
                raise HTTPException(400, f"{filename} exceeds 512 KB limit")
            return raw.decode("utf-8")

        icon: Optional[str] = None
        if "icon.svg" in names:
            icon = zf.read("icon.svg").decode("utf-8", errors="replace")

        return {
            "manifest": manifest,
            "install_sql": _read_sql("install.sql"),
            "uninstall_sql": _read_sql("uninstall.sql"),
            "uninstall_keep_sql": _read_sql("uninstall_keep.sql"),
            "icon": icon,
        }


async def _exec_sql_script(db: AsyncSession, sql: str) -> list[str]:
    """Execute a multi-statement SQL script; returns list of executed statement previews."""
    executed = []
    # Split on semicolons, skip blank/comment lines
    statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]
    for stmt in statements:
        if stmt:
            await db.execute(text(stmt))
            executed.append(stmt[:80])
    return executed


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("")
async def list_apps(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    result = await db.execute(select(InstalledApp).order_by(InstalledApp.installed_at.desc()))
    apps = result.scalars().all()
    return [_serialize_app(a) for a in apps]


@router.post("/upload")
async def upload_app(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Upload a .app package and return parsed manifest — does NOT install yet."""
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds 10 MB limit")

    parsed = _extract_app_zip(data)
    manifest = parsed["manifest"]
    app_id = manifest["id"]

    # Check if already installed
    existing = await db.execute(select(InstalledApp).where(InstalledApp.app_id == app_id))
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"App '{app_id}' is already installed. Uninstall it first to reinstall.")

    # Persist to DB (status = "uploaded", not yet installed)
    app = InstalledApp(
        app_id=app_id,
        name=manifest.get("name", app_id),
        version=manifest.get("version", "0.0.0"),
        description=manifest.get("description"),
        author=manifest.get("author"),
        icon=parsed["icon"],
        status="uploaded",
        settings={},
        settings_schema=manifest.get("settings_schema", []),
        tables_created=manifest.get("tables_created", []),
        manifest={
            **manifest,
            "_has_install_sql": parsed["install_sql"] is not None,
            "_has_uninstall_sql": parsed["uninstall_sql"] is not None,
            "_has_uninstall_keep_sql": parsed["uninstall_keep_sql"] is not None,
            "_install_sql": parsed["install_sql"],
            "_uninstall_sql": parsed["uninstall_sql"],
            "_uninstall_keep_sql": parsed["uninstall_keep_sql"],
        },
    )
    db.add(app)
    await db.flush()
    return _serialize_app(app)


@router.post("/{app_id}/install")
async def install_app(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Run install.sql and mark the app as installed."""
    result = await db.execute(select(InstalledApp).where(InstalledApp.app_id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(404, "App not found")
    if app.status == "installed":
        raise HTTPException(409, "App is already installed")

    install_sql = (app.manifest or {}).get("_install_sql")
    executed = []
    if install_sql:
        try:
            executed = await _exec_sql_script(db, install_sql)
        except Exception as exc:
            raise HTTPException(500, f"install.sql failed: {exc}")

    app.status = "installed"
    app.installed_at = datetime.utcnow()
    await db.flush()

    return {"status": "installed", "statements_executed": len(executed), "app": _serialize_app(app)}


@router.delete("/{app_id}")
async def uninstall_app(
    app_id: str,
    keep_data: bool = False,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """
    Uninstall an app.
    - keep_data=false  → run uninstall.sql (drops tables + truncates data), then delete record
    - keep_data=true   → run uninstall_keep.sql (preserves table rows), delete record
    """
    result = await db.execute(select(InstalledApp).where(InstalledApp.app_id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(404, "App not found")

    manifest = app.manifest or {}
    if keep_data:
        sql = manifest.get("_uninstall_keep_sql")
    else:
        sql = manifest.get("_uninstall_sql")

    executed = []
    if sql:
        try:
            executed = await _exec_sql_script(db, sql)
        except Exception as exc:
            raise HTTPException(500, f"Uninstall SQL failed: {exc}")
    elif not keep_data and app.tables_created:
        # Auto-generate DROP TABLE statements if no uninstall.sql provided
        for table in reversed(app.tables_created):
            safe = "".join(c for c in table if c.isalnum() or c in ("_",))
            await db.execute(text(f"DROP TABLE IF EXISTS {safe} CASCADE"))
            executed.append(f"DROP TABLE IF EXISTS {safe} CASCADE")
    elif keep_data and app.tables_created:
        # Auto-generate TRUNCATE statements if no uninstall_keep.sql provided
        for table in reversed(app.tables_created):
            safe = "".join(c for c in table if c.isalnum() or c in ("_",))
            await db.execute(text(f"TRUNCATE TABLE {safe} CASCADE"))
            executed.append(f"TRUNCATE TABLE {safe} CASCADE")

    await db.delete(app)
    await db.flush()

    return {
        "status": "uninstalled",
        "keep_data": keep_data,
        "statements_executed": len(executed),
    }


@router.put("/{app_id}/settings")
async def update_app_settings(
    app_id: str,
    body: AppSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    result = await db.execute(select(InstalledApp).where(InstalledApp.app_id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(404, "App not found")

    app.settings = body.settings
    app.updated_at = datetime.utcnow()
    await db.flush()
    return _serialize_app(app)


@router.put("/{app_id}/status")
async def update_app_status(
    app_id: str,
    body: AppStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if body.status not in ("installed", "disabled"):
        raise HTTPException(400, "status must be 'installed' or 'disabled'")

    result = await db.execute(select(InstalledApp).where(InstalledApp.app_id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(404, "App not found")

    app.status = body.status
    app.updated_at = datetime.utcnow()
    await db.flush()
    return _serialize_app(app)
