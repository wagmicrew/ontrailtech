#!/usr/bin/env python3
"""Fix Dovecot SSL cert and DNS zone for ontrail.tech mail."""
import re, subprocess, shutil

CERT = "/etc/letsencrypt/live/ontrail.tech-0002/fullchain.pem"
KEY  = "/etc/letsencrypt/live/ontrail.tech-0002/privkey.pem"
DOVECOT_CONF = "/etc/dovecot/dovecot.conf"
ZONE_FILE    = "/etc/bind/zones/db.ontrail.tech"

# ── 1. Fix Dovecot SSL cert ────────────────────────────────────────────────
with open(DOVECOT_CONF, "r") as f:
    c = f.read()

c = re.sub(r"ssl_cert\s*=\s*<[^\n]+", f"ssl_cert = <{CERT}", c)
c = re.sub(r"ssl_key\s*=\s*<[^\n]+",  f"ssl_key  = <{KEY}",  c)

with open(DOVECOT_CONF, "w") as f:
    f.write(c)

print("✓ Dovecot SSL cert updated")
# Verify
for line in c.splitlines():
    if "ssl_cert" in line or "ssl_key" in line:
        if not line.strip().startswith("#"):
            print(" ", line.strip())

# ── 2. Update DNS zone file ────────────────────────────────────────────────
with open(ZONE_FILE, "r") as f:
    z = f.read()

# Bump serial date to today
z = re.sub(r"(\d{8})(\d{2})(\s*; Serial)", r"2026042301\3", z)

# Add imap/pop3 A records if missing
if "imap    IN  A" not in z and "imap\t" not in z:
    z = re.sub(
        r"(smtp\s+IN\s+A\s+85\.208\.51\.194)",
        r"\1\nimap    IN  A   85.208.51.194\npop3    IN  A   85.208.51.194",
        z
    )
    print("✓ Added imap/pop3 A records to zone")
else:
    print("✓ imap/pop3 records already present")

# Add autodiscover/autoconfig SRV records if missing
if "_imaps._tcp" not in z:
    srv = """
; Mail autodiscovery SRV records
_imaps._tcp     IN  SRV 0 1 993 mail.ontrail.tech.
_submission._tcp IN SRV 0 1 587 mail.ontrail.tech.
_imap._tcp      IN  SRV 0 1 143 mail.ontrail.tech.
"""
    z = z.rstrip() + "\n" + srv
    print("✓ Added SRV autodiscovery records")

with open(ZONE_FILE, "w") as f:
    f.write(z)

print("✓ Zone file updated")

# ── 3. Reload bind + dovecot ──────────────────────────────────────────────
r1 = subprocess.run(["named-checkzone", "ontrail.tech", ZONE_FILE],
                    capture_output=True, text=True)
if r1.returncode == 0:
    subprocess.run(["rndc", "reload", "ontrail.tech"])
    print("✓ BIND reloaded")
else:
    print("✗ Zone check failed:", r1.stdout, r1.stderr)

r2 = subprocess.run(["systemctl", "reload", "dovecot"],
                    capture_output=True, text=True)
if r2.returncode == 0:
    print("✓ Dovecot reloaded")
else:
    print("✗ Dovecot reload failed:", r2.stderr)

print("\nDONE")
