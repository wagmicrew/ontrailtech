#!/bin/bash
# Certbot DNS-01 auth hook for BIND9
# Used for wildcard cert: *.ontrail.tech

ZONE_FILE="/etc/bind/zones/db.ontrail.tech"
DOMAIN="_acme-challenge.ontrail.tech."

if [ "$CERTBOT_AUTH_OUTPUT" ]; then
    # Cleanup hook
    sed -i "/_acme-challenge/d" "$ZONE_FILE"
    # Increment serial
    SERIAL=$(date +%Y%m%d%H)
    sed -i "s/[0-9]\{10\}  ; Serial/$SERIAL  ; Serial/" "$ZONE_FILE"
    rndc reload ontrail.tech
else
    # Auth hook - add TXT record
    echo "_acme-challenge IN TXT \"$CERTBOT_VALIDATION\"" >> "$ZONE_FILE"
    # Increment serial
    SERIAL=$(date +%Y%m%d%H)
    sed -i "s/[0-9]\{10\}  ; Serial/$SERIAL  ; Serial/" "$ZONE_FILE"
    rndc reload ontrail.tech
    sleep 5
fi
