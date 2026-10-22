#!/bin/sh
# Certificat auto-signé pour le HTTPS local (régénéré seulement s'il manque).
set -e
DIR="${CERT_DIR:-$(dirname "$0")/../traefik/certs}"
mkdir -p "$DIR"
if [ -f "$DIR/loltr.crt" ] && [ -f "$DIR/loltr.key" ]; then
  echo "Certificat déjà présent."
  exit 0
fi
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout "$DIR/loltr.key" -out "$DIR/loltr.crt" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
chmod 644 "$DIR/loltr.key" "$DIR/loltr.crt"
echo "Certificat généré dans $DIR"
