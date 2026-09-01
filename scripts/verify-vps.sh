#!/usr/bin/env bash
set -euo pipefail

EXPECTED_SHA=${1:-}
if [[ -z "$EXPECTED_SHA" ]]; then
  echo "usage: $0 <expected-deployed-sha>" >&2
  exit 2
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ -z "$ROOT" ]]; then
  echo "STOP: jalankan dari working tree HCIS" >&2
  exit 1
fi
cd "$ROOT"

ENV_FILE=${HCIS_VPS_ENV_FILE:-infra/.env.vps}
COMPOSE_FILE=${HCIS_VPS_COMPOSE_FILE:-infra/docker-compose.vps.yml}
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "STOP: env file tidak ditemukan: $ENV_FILE" >&2
  exit 1
fi

if [[ "$(git rev-parse HEAD)" != "$EXPECTED_SHA" ]]; then
  echo "FAIL: working tree bukan expected SHA" >&2
  echo "Expected: $EXPECTED_SHA" >&2
  echo "Actual:   $(git rev-parse HEAD)" >&2
  exit 1
fi

if ! grep -Eq '^BIOMETRIC_COLLECTION_ENABLED=0[[:space:]]*$' "$ENV_FILE"; then
  echo "FAIL: BIOMETRIC_COLLECTION_ENABLED bukan 0" >&2
  exit 1
fi

echo "=== HCIS VPS VERIFY ==="
echo "HEAD=$(git rev-parse HEAD)"

echo
echo "=== CONTAINERS ==="
"${COMPOSE[@]}" ps
for service in postgres api web; do
  if ! "${COMPOSE[@]}" ps "$service" | grep -q '(healthy)'; then
    echo "FAIL: $service tidak healthy" >&2
    exit 1
  fi
done

echo
echo "=== HEALTH ==="
curl -fsS http://127.0.0.1:18080/healthz
printf '\n'
curl -fsS http://127.0.0.1:18080/api/health
printf '\n'
curl -fsS http://127.0.0.1:18080/api/ready
printf '\n'

echo
echo "=== MIGRATION CONSISTENCY ==="
LATEST_FILE=$(find apps/api/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort | tail -1)
LATEST_APPLIED=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1"
')
echo "latest_repo=$LATEST_FILE"
echo "latest_db=$LATEST_APPLIED"
if [[ "$LATEST_APPLIED" != "$LATEST_FILE" ]]; then
  echo "FAIL: migration database belum sejajar dengan repository" >&2
  exit 1
fi

echo
echo "=== USERINFO RETIREMENT GUARD ==="
USERINFO_TRIGGER=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT count(*)
    FROM pg_trigger
    WHERE tgname = '\''attendance_adms_reject_retired_userinfo_reads'\''
      AND NOT tgisinternal
  "
')
echo "userinfo_guard_count=$USERINFO_TRIGGER"
if [[ "$USERINFO_TRIGGER" != "1" ]]; then
  echo "FAIL: retired USERINFO database guard tidak tepat satu" >&2
  exit 1
fi

echo
echo "=== RETIRED USERINFO UI ==="
for needle in \
  "Baca roster aman" \
  "Full roster metadata canary" \
  "Single-PIN metadata canary" \
  "Baca 1 PIN" \
  "Baca ulang dari mesin"
do
  if "${COMPOSE[@]}" exec -T web sh -lc "grep -R -F -q -- '$needle' /usr/share/nginx/html"; then
    echo "FAIL: retired UI ditemukan: $needle" >&2
    exit 1
  fi
done
echo "retired_userinfo_ui=absent"

echo
echo "=== BIOMETRIC CONTROL-PLANE SAFETY ==="
DEVICE_COLLECTION_ON=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT count(*)
    FROM attendance_adms_devices
    WHERE biometric_collection_enabled = true
  "
')
BIO_AUDIT_TRIGGER=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT count(*)
    FROM pg_trigger
    WHERE tgname = '\''attendance_biometric_audit_events_append_only'\''
      AND NOT tgisinternal
  "
')
BIO_ENVELOPE_COLUMNS=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = '\''public'\''
      AND table_name = '\''attendance_biometric_credentials'\''
      AND column_name IN (
        '\''envelope_version'\'',
        '\''last_reencrypted_at'\'',
        '\''last_reencrypted_by_account_id'\''
      )
  "
')
BIO_CREDENTIAL_COUNTS=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT
      count(*)::int || '\''|'\'' ||
      (count(*) FILTER (WHERE lifecycle = '\''active'\''))::int || '\''|'\'' ||
      (count(*) FILTER (WHERE lifecycle = '\''retired'\''))::int || '\''|'\'' ||
      (count(*) FILTER (WHERE lifecycle = '\''destroyed'\''))::int
    FROM attendance_biometric_credentials
  "
')
echo "biometric_global_collection=OFF"
echo "biometric_device_collection_enabled_count=$DEVICE_COLLECTION_ON"
echo "biometric_audit_append_only_guard_count=$BIO_AUDIT_TRIGGER"
echo "biometric_envelope_maintenance_columns=$BIO_ENVELOPE_COLUMNS"
echo "biometric_credential_counts_total_active_retired_destroyed=$BIO_CREDENTIAL_COUNTS"
if [[ "$DEVICE_COLLECTION_ON" != "0" ]]; then
  echo "FAIL: ada device biometric collection gate yang masih ON" >&2
  exit 1
fi
if [[ "$BIO_AUDIT_TRIGGER" != "1" ]]; then
  echo "FAIL: append-only biometric audit guard tidak tepat satu" >&2
  exit 1
fi
if [[ "$BIO_ENVELOPE_COLUMNS" != "3" ]]; then
  echo "FAIL: metadata maintenance envelope biometric belum lengkap" >&2
  exit 1
fi

echo
echo "=== SPA CACHE POLICY ==="
INDEX_HEADERS=$(curl -fsSI http://127.0.0.1:18080/index.html)
printf '%s\n' "$INDEX_HEADERS" | grep -Ei 'HTTP/|cache-control|pragma|expires'
if ! printf '%s\n' "$INDEX_HEADERS" | grep -Eqi 'cache-control:.*no-store'; then
  echo "FAIL: index.html tidak no-store" >&2
  exit 1
fi

ASSET=$(curl -fsS http://127.0.0.1:18080/index.html | grep -oE 'src="/assets/[^"]+\.js"' | head -1 | cut -d'"' -f2)
if [[ -z "$ASSET" ]]; then
  echo "FAIL: hashed JS asset tidak ditemukan" >&2
  exit 1
fi
ASSET_HEADERS=$(curl -fsSI "http://127.0.0.1:18080$ASSET")
printf '%s\n' "$ASSET_HEADERS" | grep -Ei 'HTTP/|cache-control|expires'
if ! printf '%s\n' "$ASSET_HEADERS" | grep -Eqi 'cache-control:.*immutable'; then
  echo "FAIL: hashed asset tidak immutable" >&2
  exit 1
fi

echo
echo "=== ADMS PASSIVE MAPPING SUMMARY SQL SMOKE ==="
"${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c "
    SELECT
      d.serial_number,
      count(m.id)::int AS active_mappings,
      (count(m.id) FILTER (WHERE e.status <> '\''active'\''))::int AS mappings_needing_review
    FROM attendance_adms_devices d
    LEFT JOIN attendance_adms_employee_mappings m
      ON m.device_id = d.id
     AND m.effective_from <= now()
     AND (m.effective_to IS NULL OR m.effective_to > now())
    LEFT JOIN employees e ON e.id = m.employee_id
    GROUP BY d.id, d.serial_number
    ORDER BY d.serial_number;
  "
'

echo
echo "=== VERIFY PASS ==="
echo "verified_sha=$EXPECTED_SHA"
echo "verification_device_commands_requested=0"