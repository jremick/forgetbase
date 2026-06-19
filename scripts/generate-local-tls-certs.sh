#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
CERT_DIR="${FORGETBASE_LOCAL_TLS_DIR:-$REPO_ROOT/infra/docker/tls}"
CERT_PATH="$CERT_DIR/tls.crt"
KEY_PATH="$CERT_DIR/tls.key"
DAYS="${FORGETBASE_LOCAL_TLS_DAYS:-825}"
COMMON_NAME="${FORGETBASE_LOCAL_TLS_CN:-ForgetBase Local TLS}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate local TLS certificates" >&2
  exit 1
fi

case "$DAYS" in
  ''|*[!0-9]*)
    echo "FORGETBASE_LOCAL_TLS_DAYS must be a positive whole number" >&2
    exit 1
    ;;
esac

if [ "$DAYS" -lt 1 ]; then
  echo "FORGETBASE_LOCAL_TLS_DAYS must be at least 1" >&2
  exit 1
fi

mkdir -p "$CERT_DIR"
umask 077

OPENSSL_CONFIG="$(mktemp)"
trap 'rm -f "$OPENSSL_CONFIG"' EXIT

cat >"$OPENSSL_CONFIG" <<EOF
[ req ]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[ dn ]
CN = $COMMON_NAME

[ v3_req ]
subjectAltName = @alt_names
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[ alt_names ]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

openssl req \
  -x509 \
  -nodes \
  -newkey rsa:2048 \
  -days "$DAYS" \
  -keyout "$KEY_PATH" \
  -out "$CERT_PATH" \
  -config "$OPENSSL_CONFIG" \
  -extensions v3_req

chmod 600 "$KEY_PATH"
chmod 644 "$CERT_PATH"

echo "Wrote local self-signed certificate: $CERT_PATH"
echo "Wrote local private key: $KEY_PATH"
