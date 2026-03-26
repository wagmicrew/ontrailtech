#!/usr/bin/env python3
"""Seed the AncientOwner account for hansen (johaswe@gmail.com)."""
import psycopg2

conn = psycopg2.connect("dbname=ontrail_tech user=postgres")
conn.autocommit = True
cur = conn.cursor()

# Create AncientOwner user
cur.execute("""
    INSERT INTO users (username, email, wallet_address, reputation_score)
    VALUES ('hansen', 'johaswe@gmail.com', '0x0000000000000000000000000000000000000001', 0.0)
    ON CONFLICT (username) DO UPDATE SET email = 'johaswe@gmail.com'
    RETURNING id;
""")
user_id = cur.fetchone()[0]
print(f"User 'hansen' id: {user_id}")

# Ensure ancient_owner role exists
cur.execute("""
    INSERT INTO acl_roles (role_name, permissions)
    VALUES ('ancient_owner', '{"all": true, "super_admin": true, "manage_roles": true}')
    ON CONFLICT (role_name) DO NOTHING
    RETURNING id;
""")
row = cur.fetchone()
if row:
    role_id = row[0]
else:
    cur.execute("SELECT id FROM acl_roles WHERE role_name = 'ancient_owner';")
    role_id = cur.fetchone()[0]
print(f"Role 'ancient_owner' id: {role_id}")

# Ensure admin role exists too
cur.execute("""
    INSERT INTO acl_roles (role_name, permissions)
    VALUES ('admin', '{"all": true}')
    ON CONFLICT (role_name) DO NOTHING
    RETURNING id;
""")
row = cur.fetchone()
if row:
    admin_role_id = row[0]
else:
    cur.execute("SELECT id FROM acl_roles WHERE role_name = 'admin';")
    admin_role_id = cur.fetchone()[0]

# Assign both roles to hansen
cur.execute("""
    INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)
    ON CONFLICT DO NOTHING;
""", (str(user_id), str(role_id)))

cur.execute("""
    INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)
    ON CONFLICT DO NOTHING;
""", (str(user_id), str(admin_role_id)))

print(f"AncientOwner 'hansen' seeded with ancient_owner + admin roles.")
print(f"Profile URL: hansen.ontrail.tech")
print(f"Email: johaswe@gmail.com")

cur.close()
conn.close()
