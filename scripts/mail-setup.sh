#!/bin/bash
# mail-setup.sh — Install and configure Postfix + Dovecot + OpenDKIM
# for ontrail.tech on the loppio server (85.208.51.194)
#
# Run once after initial server setup:
#   ssh loppio 'bash /var/www/ontrail/scripts/mail-setup.sh'
#
# What this script does:
#   1. Installs Postfix (SMTP), Dovecot (IMAP), OpenDKIM
#   2. Configures Postfix for ontrail.tech with TLS + submission on port 587
#   3. Creates virtual mailbox for admin@ontrail.tech
#   4. Generates DKIM key pair (selector: mail)
#   5. Prints the DKIM public key to add to the DNS zone file
#
# After running, update infra/dns/ontrail.tech.zone with the printed DKIM key.

set -e

DOMAIN="ontrail.tech"
MAIL_HOST="smtp.${DOMAIN}"
ADMIN_EMAIL="admin@${DOMAIN}"
MAIL_DIR="/var/mail/vhosts"
VMAIL_USER="vmail"
VMAIL_UID=5000

# ── 1. Install packages ────────────────────────────────────────────
echo "[1/8] Installing mail packages..."
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    postfix \
    postfix-pcre \
    dovecot-core \
    dovecot-imapd \
    dovecot-lmtpd \
    opendkim \
    opendkim-tools \
    mailutils \
    doveadm

# ── 2. Create vmail system user ───────────────────────────────────
echo "[2/8] Creating vmail user..."
if ! id -u ${VMAIL_USER} &>/dev/null; then
    groupadd -g ${VMAIL_UID} ${VMAIL_USER}
    useradd -g ${VMAIL_USER} -u ${VMAIL_UID} ${VMAIL_USER} -d /var/mail -M -s /sbin/nologin
fi
mkdir -p ${MAIL_DIR}/${DOMAIN}/admin
chown -R ${VMAIL_USER}:${VMAIL_USER} ${MAIL_DIR}

# ── 3. Configure Postfix ──────────────────────────────────────────
echo "[3/8] Configuring Postfix..."

postconf -e "myhostname = ${MAIL_HOST}"
postconf -e "mydomain = ${DOMAIN}"
postconf -e "myorigin = \$mydomain"
postconf -e "mydestination = localhost"
postconf -e "mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128"
postconf -e "inet_interfaces = all"
postconf -e "inet_protocols = ipv4"

# Virtual mailbox delivery
postconf -e "virtual_mailbox_domains = ${DOMAIN}"
postconf -e "virtual_mailbox_base = ${MAIL_DIR}"
postconf -e "virtual_mailbox_maps = hash:/etc/postfix/vmailbox"
postconf -e "virtual_alias_maps = hash:/etc/postfix/virtual"
postconf -e "virtual_minimum_uid = 100"
postconf -e "virtual_uid_maps = static:${VMAIL_UID}"
postconf -e "virtual_gid_maps = static:${VMAIL_UID}"

# TLS (uses Let's Encrypt cert — certbot must have already run)
postconf -e "smtpd_tls_cert_file = /etc/letsencrypt/live/api.ontrail.tech/fullchain.pem"
postconf -e "smtpd_tls_security_level = may"
postconf -e "smtpd_tls_auth_only = yes"
postconf -e "smtpd_sasl_type = dovecot"
postconf -e "smtpd_sasl_path = private/auth"
postconf -e "smtpd_sasl_auth_enable = yes"
postconf -e "smtpd_recipient_restrictions = permit_mynetworks,permit_sasl_authenticated,reject_unauth_destination"
postconf -e "smtp_tls_security_level = may"

# DKIM milter
postconf -e "milter_protocol = 2"
postconf -e "milter_default_action = accept"
postconf -e "smtpd_milters = inet:localhost:12301"
postconf -e "non_smtpd_milters = inet:localhost:12301"

# Write virtual mailbox map
cat > /etc/postfix/vmailbox << EOF
admin@${DOMAIN}   ${DOMAIN}/admin/
EOF
postmap /etc/postfix/vmailbox

# Aliases: postmaster and abuse -> admin
cat > /etc/postfix/virtual << EOF
postmaster@${DOMAIN}  admin@${DOMAIN}
abuse@${DOMAIN}       admin@${DOMAIN}
noreply@${DOMAIN}     admin@${DOMAIN}
EOF
postmap /etc/postfix/virtual

# Enable submission (port 587) in master.cf
if ! grep -q "^submission" /etc/postfix/master.cf; then
    cat >> /etc/postfix/master.cf << 'EOF'
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_tls_auth_only=yes
  -o smtpd_reject_unlisted_recipient=no
  -o smtpd_relay_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
EOF
fi

# ── 4. Configure Dovecot ──────────────────────────────────────────
echo "[4/8] Configuring Dovecot..."

cat > /etc/dovecot/conf.d/10-mail.conf << EOF
mail_location = maildir:${MAIL_DIR}/%d/%n
namespace inbox {
  inbox = yes
}
mail_uid = ${VMAIL_UID}
mail_gid = ${VMAIL_UID}
first_valid_uid = ${VMAIL_UID}
EOF

cat > /etc/dovecot/conf.d/10-auth.conf << 'EOF'
auth_mechanisms = plain login
!include auth-passwdfile.conf.ext
EOF

# Password file for virtual users
cat > /etc/dovecot/conf.d/auth-passwdfile.conf.ext << EOF
passdb {
  driver = passwd-file
  args = scheme=SHA512-CRYPT username_format=%u /etc/dovecot/users
}
userdb {
  driver = static
  args = uid=${VMAIL_UID} gid=${VMAIL_UID} home=${MAIL_DIR}/%d/%n
}
EOF

# LMTP socket for Postfix delivery
cat > /etc/dovecot/conf.d/10-master.conf << 'EOF'
service imap-login {
  inet_listener imap {
    port = 0
  }
  inet_listener imaps {
    port = 993
    ssl = yes
  }
}
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0666
    user = postfix
    group = postfix
  }
  unix_listener auth-userdb {
    mode = 0600
    user = vmail
  }
}
EOF

# TLS for Dovecot
cat > /etc/dovecot/conf.d/10-ssl.conf << EOF
ssl = required
ssl_cert = </etc/letsencrypt/live/api.ontrail.tech/fullchain.pem
ssl_key = </etc/letsencrypt/live/api.ontrail.tech/privkey.pem
EOF

# Create admin password (random, printed at end)
ADMIN_PASS=$(openssl rand -base64 16)
ADMIN_HASH=$(doveadm pw -s SHA512-CRYPT -p "${ADMIN_PASS}")
echo "${ADMIN_EMAIL}:${ADMIN_HASH}" > /etc/dovecot/users
chmod 600 /etc/dovecot/users

# ── 5. Configure OpenDKIM ─────────────────────────────────────────
echo "[5/8] Configuring OpenDKIM..."

mkdir -p /etc/opendkim/keys/${DOMAIN}

cat > /etc/opendkim.conf << EOF
Syslog          yes
UMask           002
Domain          ${DOMAIN}
KeyFile         /etc/opendkim/keys/${DOMAIN}/mail.private
Selector        mail
Socket          inet:12301@localhost
PidFile         /var/run/opendkim/opendkim.pid
TrustAnchorFile /usr/share/dns/root.key
UserID          opendkim:opendkim
EOF

# Generate DKIM keys if not already present
if [ ! -f /etc/opendkim/keys/${DOMAIN}/mail.private ]; then
    opendkim-genkey -b 2048 -d ${DOMAIN} -D /etc/opendkim/keys/${DOMAIN} -s mail -v
fi
chown -R opendkim:opendkim /etc/opendkim/keys

# ── 6. Open firewall ports ────────────────────────────────────────
echo "[6/8] Opening firewall ports..."
if command -v ufw &>/dev/null; then
    ufw allow 25/tcp   comment "SMTP"
    ufw allow 587/tcp  comment "SMTP Submission"
    ufw allow 993/tcp  comment "IMAPS"
fi

# ── 7. Enable and restart services ───────────────────────────────
echo "[7/8] Starting services..."
systemctl enable postfix dovecot opendkim
systemctl restart opendkim
systemctl restart dovecot
systemctl restart postfix

# ── 8. Print setup summary ────────────────────────────────────────
echo ""
echo "======================================================"
echo " Mail setup complete for ${DOMAIN}"
echo "======================================================"
echo ""
echo " admin@${DOMAIN} password: ${ADMIN_PASS}"
echo " (save this — set SMTP_PASSWORD in .env to this value)"
echo ""
echo " Add the following DKIM TXT record to"
echo " infra/dns/ontrail.tech.zone (replacing the placeholder):"
echo ""
cat /etc/opendkim/keys/${DOMAIN}/mail.txt
echo ""
echo " Then reload BIND on the server:"
echo "   named-checkzone ${DOMAIN} /etc/bind/zones/ontrail.tech.zone && rndc reload"
echo ""
echo " SMTP settings for API .env:"
echo "   SMTP_HOST=smtp.${DOMAIN}"
echo "   SMTP_PORT=587"
echo "   SMTP_USER=${ADMIN_EMAIL}"
echo "   SMTP_PASSWORD=${ADMIN_PASS}"
echo "======================================================"
