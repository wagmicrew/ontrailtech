"""
Kernel REST endpoints:
  GET  /kernel/apps                    — list registered apps
  GET  /kernel/processes               — list running processes
  POST /kernel/process/start           — start a process
  DELETE /kernel/process/{process_id}  — stop a process
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies import require_admin
from kernel.core.app_registry import list_all as list_apps
from kernel.core.process_manager import process_manager
from kernel.core.permissions import check_permission, APP_PERMISSION_MAP

router = APIRouter(prefix="/kernel", tags=["Kernel"])


@router.get("/apps")
async def get_apps(_=Depends(require_admin)):
    return [
        {"id": a.id, "name": a.name, "icon": a.icon, "description": a.description, "permissions": a.permissions}
        for a in list_apps()
    ]


@router.get("/processes")
async def get_processes(_=Depends(require_admin)):
    return [p.to_dict() for p in process_manager.list_all()]


class StartProcessRequest(BaseModel):
    app_id: str


@router.post("/process/start")
async def start_process(body: StartProcessRequest, user=Depends(require_admin)):
    required_perms = APP_PERMISSION_MAP.get(body.app_id, [])
    for perm in required_perms:
        if not check_permission(getattr(user, "roles", []) or [], perm):
            raise HTTPException(403, detail=f"Missing permission: {perm}")

    proc = process_manager.start(
        app_id=body.app_id,
        name=body.app_id,
        owner=str(user.id),
        permissions=required_perms,
    )
    return proc.to_dict()


@router.delete("/process/{process_id}")
async def stop_process(process_id: str, _=Depends(require_admin)):
    stopped = process_manager.stop(process_id)
    if not stopped:
        raise HTTPException(404, detail="Process not found")
    return {"stopped": process_id}
