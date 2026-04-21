from typing import List

# Maps app_id → required permissions for that app's process to run
APP_PERMISSION_MAP: dict[str, List[str]] = {
    "users":    ["users.read"],
    "database": ["database.read"],
    "fitness":  ["fitness.read"],
    "web3":     ["web3.read"],
    "expo":     ["expo.read"],
    "trail-lab":["trails.read"],
    "settings": [],
    "monitor":  ["kernel.read"],
}

# Admin role has all permissions
ADMIN_PERMISSIONS = {
    "users.read", "users.write",
    "database.read", "database.write",
    "fitness.read", "fitness.write",
    "web3.read", "web3.write",
    "expo.read", "expo.write",
    "trails.read", "trails.write",
    "kernel.read", "kernel.write",
}


def check_permission(user_roles: List[str], required: str) -> bool:
    if "admin" in user_roles:
        return True
    return required in ADMIN_PERMISSIONS
