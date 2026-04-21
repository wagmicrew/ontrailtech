import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional


class ProcessState(str, Enum):
    running = "running"
    stopped = "stopped"
    error   = "error"


@dataclass
class KernelProcess:
    id: str
    app_id: str
    name: str
    owner: Optional[str]
    permissions: List[str]
    state: ProcessState = ProcessState.running
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "app_id": self.app_id,
            "name": self.name,
            "state": self.state.value,
            "owner": self.owner,
            "permissions": self.permissions,
            "started_at": self.started_at.isoformat(),
        }


class ProcessManager:
    def __init__(self) -> None:
        self._processes: Dict[str, KernelProcess] = {}

    def start(self, app_id: str, name: str, owner: Optional[str], permissions: List[str]) -> KernelProcess:
        proc = KernelProcess(
            id=str(uuid.uuid4()),
            app_id=app_id,
            name=name,
            owner=owner,
            permissions=permissions,
        )
        self._processes[proc.id] = proc
        return proc

    def stop(self, process_id: str) -> bool:
        proc = self._processes.pop(process_id, None)
        return proc is not None

    def get(self, process_id: str) -> Optional[KernelProcess]:
        return self._processes.get(process_id)

    def list_all(self) -> List[KernelProcess]:
        return list(self._processes.values())

    def list_by_owner(self, owner: str) -> List[KernelProcess]:
        return [p for p in self._processes.values() if p.owner == owner]


# Singleton
process_manager = ProcessManager()
