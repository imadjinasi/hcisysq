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

COMMAND_COUNT_BEFORE=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT count(*) FROM attendance_adms_commands"
')

echo
echo "=== CONTAINERS ==="
"${COMPOSE[@]}" ps
for service in postgres api web; do
  if ! "${COMPOSE[@]}" ps "$service" | grep -q '(healthy)'; then
    echo "FAIL: $service tidak healthy" >&2
    exit 1
  fi
done
API_CONTAINER=$("${COMPOSE[@]}" ps -q api)
WEB_CONTAINER=$("${COMPOSE[@]}" ps -q web)
API_IMAGE=$(docker inspect "$API_CONTAINER" --format '{{.Config.Image}}')
WEB_IMAGE=$(docker inspect "$WEB_CONTAINER" --format '{{.Config.Image}}')
echo "api_image=$API_IMAGE"
echo "web_image=$WEB_IMAGE"
if [[ "${HCIS_VERIFY_ALLOW_LOCAL_IMAGES:-0}" != "1" ]]; then
  if [[ "$API_IMAGE" != *":sha-$EXPECTED_SHA" || "$WEB_IMAGE" != *":sha-$EXPECTED_SHA" ]]; then
    echo "FAIL: runtime bukan exact-SHA CI image" >&2
    exit 1
  fi
fi

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
    SELECT count(*) FROM pg_trigger
    WHERE tgname = '\''attendance_adms_reject_retired_userinfo_reads'\'' AND NOT tgisinternal
  "
')
echo "userinfo_guard_count=$USERINFO_TRIGGER"
if [[ "$USERINFO_TRIGGER" != "1" ]]; then
  echo "FAIL: retired USERINFO database guard tidak tepat satu" >&2
  exit 1
fi

for needle in "Baca roster aman" "Full roster metadata canary" "Single-PIN metadata canary" "Baca 1 PIN" "Baca ulang dari mesin"; do
  if "${COMPOSE[@]}" exec -T web sh -lc "grep -R -F -q -- '$needle' /usr/share/nginx/html"; then
    echo "FAIL: retired USERINFO UI ditemukan: $needle" >&2
    exit 1
  fi
done
echo "retired_userinfo_ui=absent"

echo
echo "=== BIOMETRIC SAFETY ==="
DEVICE_COLLECTION_ON=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT count(*) FROM attendance_adms_devices WHERE biometric_collection_enabled = true"
')
BIO_AUDIT_TRIGGER=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT count(*) FROM pg_trigger
    WHERE tgname = '\''attendance_biometric_audit_immutable'\'' AND NOT tgisinternal
  "
')
BIO_PHOTO_TRIGGER=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT count(*) FROM pg_trigger
    WHERE tgname = '\''attendance_adms_attendance_photos_immutable'\'' AND NOT tgisinternal
  "
')
echo "biometric_global_collection=OFF"
echo "biometric_device_collection_enabled_count=$DEVICE_COLLECTION_ON"
echo "biometric_audit_append_only_guard_count=$BIO_AUDIT_TRIGGER"
echo "attendance_photo_immutable_guard_count=$BIO_PHOTO_TRIGGER"
if [[ "$DEVICE_COLLECTION_ON" != "0" || "$BIO_AUDIT_TRIGGER" != "1" || "$BIO_PHOTO_TRIGGER" != "1" ]]; then
  echo "FAIL: biometric initial-deploy guard tidak utuh" >&2
  exit 1
fi

echo
echo "=== FULL PHYSICAL PARITY SCHEMA ==="
PARITY_TABLE_COUNT=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT count(*) FROM information_schema.tables
    WHERE table_schema = '\''public'\'' AND table_name IN (
      '\''attendance_adms_physical_capabilities'\'', '\''attendance_adms_physical_operations'\'',
      '\''attendance_adms_firmware_packages'\'', '\''attendance_adms_firmware_download_tickets'\'',
      '\''attendance_adms_attendance_photos'\'', '\''attendance_adms_job_codes'\''
    )
  "
')
DEVICE_PROFILE_COLUMNS=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = '\''public'\'' AND table_name = '\''attendance_adms_devices'\''
      AND column_name IN (
        '\''organizational_unit_id'\'', '\''area_context'\'', '\''worksite_label'\'',
        '\''device_role'\'', '\''transfer_mode'\'', '\''heartbeat_interval_seconds'\'',
        '\''desired_push_protocol_version'\''
      )
  "
')
COMMAND_PHYSICAL_COLUMNS=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = '\''public'\'' AND table_name = '\''attendance_adms_commands'\''
      AND column_name IN ('\''physical_operation_id'\'', '\''physical_sequence'\'', '\''physical_capability_key'\'', '\''biometric_credential_id'\'')
  "
')
RATE_LIMIT_TRIGGER=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "
    SELECT count(*) FROM pg_trigger
    WHERE tgname = '\''attendance_adms_physical_operation_rate_limit_guard'\'' AND NOT tgisinternal
  "
')
echo "physical_parity_table_count=$PARITY_TABLE_COUNT"
echo "wdms_device_profile_column_count=$DEVICE_PROFILE_COLUMNS"
echo "physical_command_link_column_count=$COMMAND_PHYSICAL_COLUMNS"
echo "physical_operation_rate_limit_guard_count=$RATE_LIMIT_TRIGGER"
if [[ "$PARITY_TABLE_COUNT" != "6" || "$DEVICE_PROFILE_COLUMNS" != "7" || "$COMMAND_PHYSICAL_COLUMNS" != "4" ]]; then
  echo "FAIL: full physical-parity schema belum lengkap" >&2
  exit 1
fi
if [[ "$RATE_LIMIT_TRIGGER" != "1" ]]; then
  echo "FAIL: physical-operation DB rate-limit guard tidak tepat satu" >&2
  exit 1
fi

if ! "${COMPOSE[@]}" exec -T web sh -lc "grep -R -F -q -- 'Full WDMS Physical Parity' /usr/share/nginx/html"; then
  echo "FAIL: full physical parity Admin UI tidak ditemukan" >&2
  exit 1
fi
if "${COMPOSE[@]}" exec -T web sh -lc "grep -R -E -q -- 'raw command|wireCommand|payload_ciphertext|payload_auth_tag|encryption_key_id' /usr/share/nginx/html"; then
  echo "FAIL: forbidden physical/biometric secret surface ditemukan di web build" >&2
  exit 1
fi
echo "arbitrary_command_ui=absent"
echo "physical_parity_ui=present"

echo
echo "=== SPA CACHE POLICY ==="
INDEX_HEADERS=$(curl -fsSI http://127.0.0.1:18080/index.html)
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
if ! printf '%s\n' "$ASSET_HEADERS" | grep -Eqi 'cache-control:.*immutable'; then
  echo "FAIL: hashed asset tidak immutable" >&2
  exit 1
fi

echo
echo "=== PASSIVE DEVICE SUMMARY SQL SMOKE ==="
"${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c "
    SELECT d.serial_number, d.last_seen_at, d.device_role, d.transfer_mode,
           d.heartbeat_interval_seconds, d.desired_push_protocol_version,
           count(m.id)::int AS active_mappings
    FROM attendance_adms_devices d
    LEFT JOIN attendance_adms_employee_mappings m
      ON m.device_id = d.id
     AND m.effective_from <= now()
     AND (m.effective_to IS NULL OR m.effective_to > now())
    GROUP BY d.id, d.serial_number
    ORDER BY d.serial_number;
  "
'

COMMAND_COUNT_AFTER=$("${COMPOSE[@]}" exec -T postgres sh -lc '
  psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT count(*) FROM attendance_adms_commands"
')
if [[ "$COMMAND_COUNT_AFTER" != "$COMMAND_COUNT_BEFORE" ]]; then
  echo "FAIL: verifier mengubah jumlah device command" >&2
  echo "before=$COMMAND_COUNT_BEFORE after=$COMMAND_COUNT_AFTER" >&2
  exit 1
fi

echo
echo "=== VERIFY PASS ==="
echo "verified_sha=$EXPECTED_SHA"
echo "verification_device_commands_requested=0"
