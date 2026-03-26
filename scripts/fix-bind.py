#!/usr/bin/env python3
"""Fix BIND named.conf.local with proper quoting"""

content = '''zone "loppio.se" {
    type master;
    file "/etc/bind/zones/db.loppio.se";
    allow-transfer { none; };
};

zone "ontrail.tech" {
    type master;
    file "/etc/bind/zones/db.ontrail.tech";
    allow-transfer { none; };
};
'''

with open("/etc/bind/named.conf.local", "w") as f:
    f.write(content)

print("named.conf.local written successfully")
