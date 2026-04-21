from dataclasses import dataclass, field
from typing import List, Optional

@dataclass
class AppDefinition:
    id: str
    name: str
    icon: str
    permissions: List[str]
    description: str = ""

_registry: dict[str, AppDefinition] = {}

def register(app: AppDefinition) -> None:
    _registry[app.id] = app

def get(app_id: str) -> Optional[AppDefinition]:
    return _registry.get(app_id)

def list_all() -> List[AppDefinition]:
    return list(_registry.values())

# Built-in apps — registered at import time
_BUILTIN_APPS = [
    AppDefinition("users",    "Users",          "👥", ["users.read", "users.write"],       "Manage users and sessions"),
    AppDefinition("database", "Database",       "🗄",  ["database.read", "database.write"], "Table browser and SQL runner"),
    AppDefinition("fitness",  "Fitness",        "⚡", ["fitness.read", "fitness.write"],   "Fitness provider config"),
    AppDefinition("web3",     "Web3",           "⛓",  ["web3.read", "web3.write"],         "Token minting and contracts"),
    AppDefinition("expo",     "Expo Go",        "📱", ["expo.read", "expo.write"],          "Mobile dev server"),
    AppDefinition("trail-lab","Trail Lab",      "🗺",  ["trails.read", "trails.write"],     "OSM map editor"),
    AppDefinition("settings", "Settings",       "⚙",  [],                                  "System preferences"),
    AppDefinition("monitor",  "System Monitor", "📊", ["kernel.read"],                     "Processes and event log"),
]

for _app in _BUILTIN_APPS:
    register(_app)
