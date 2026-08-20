# VPS Development Deployment

**Status:** ACTIVE DEVELOPMENT GUIDE  
**Target host:** `hcis.sabilulquran.or.id`

This profile is for development verification and early pilot work. Use synthetic data only until production readiness, migration, access control, and security review are complete.

## Confirmed VPS topology

The shared VPS already uses Dockerized Caddy as the only public ingress on ports 80/443.

Confirmed infrastructure:

- public ingress container: `edge-caddy-1`;
- shared ingress network: `edge_proxy`;
- active host Caddyfile: `/var/www/edge/caddy/Caddyfile`;
- edge compose working directory: `/var/www/edge`;
- HCIS hostname: `hcis.sabilulquran.or.id`;
- DNS is managed in Cloudflare and initially uses DNS-only mode.

```text
https://hcis.sabilulquran.or.id
        |
        v
edge-caddy-1 :80/:443
        |
        | Docker network: edge_proxy
        v
hcis-web :80
  |             |
  | /           | /api/* (prefix stripped)
  v             v
Vite SPA       Fastify API :3001
                    |
                    | private HCIS backend network
                    v
              PostgreSQL :5432
```

Only the HCIS web container joins `edge_proxy`. The API and PostgreSQL remain private. The web container proxies `/api/*` to the API over the HCIS backend network.

For host-only smoke tests, the web container also binds to `127.0.0.1:18080`. This is not a public port.

## 1. DNS

Cloudflare record:

```text
Type: A
Name: hcis
Value: VPS public IPv4
Proxy status: DNS only during initial verification
TTL: Auto
```

Verify:

```bash
nslookup hcis.sabilulquran.or.id
```

Do not continue with TLS routing until the hostname resolves to the VPS.

## 2. Clone the verification branch

Until the backend foundation is merged, deploy the feature branch directly.

```bash
sudo mkdir -p /var/www/hcis
sudo chown "$USER":"$USER" /var/www/hcis
cd /var/www/hcis

git clone https://github.com/imadjinasi/hcisysq.git .
git fetch origin
git checkout feat/backend-employee-import-foundation
```

For an existing checkout:

```bash
cd /var/www/hcis
git fetch origin
git checkout feat/backend-employee-import-foundation
git pull --ff-only origin feat/backend-employee-import-foundation
```

## 3. Create the VPS environment file

For a new deployment:

```bash
cd /var/www/hcis
cp infra/vps.env.example infra/.env.vps
chmod 600 infra/.env.vps
```

Generate separate random values for the PostgreSQL password and auth encryption key:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Put the first value into `POSTGRES_PASSWORD` and the second value into `AUTH_ENCRYPTION_KEY` in `infra/.env.vps`.

`AUTH_ENCRYPTION_KEY` must be exactly 64 hexadecimal characters. It encrypts Super Admin MFA secrets at rest. Do not rotate it casually; controlled re-encryption must exist before key rotation.

Keep these values unless the topology changes:

```text
AUTH_SESSION_TTL_HOURS=8
EDGE_NETWORK=edge_proxy
HCIS_BIND_ADDRESS=127.0.0.1
HCIS_HTTP_PORT=18080
```

Do not commit `infra/.env.vps` or paste its secrets into chat/logs.

Default memory limits are intentionally conservative for the shared VPS:

- PostgreSQL: 320 MB;
- API: 192 MB;
- web/nginx: 96 MB.

## 4. Build sequentially on the small VPS

The VPS has limited free memory and already runs multiple SaaS workloads. Build API and web one at a time instead of asking Compose to build everything concurrently.

```bash
cd /var/www/hcis

COMPOSE="docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml"

$COMPOSE build api
$COMPOSE build web
$COMPOSE up -d
```

The Compose profile expects the external Docker network `edge_proxy` to already exist. The web service joins it with alias `hcis-web`.

The API waits for PostgreSQL, runs pending SQL migrations, then starts Fastify.

Check status:

```bash
$COMPOSE ps
```

If a service is unhealthy or restarting:

```bash
$COMPOSE logs --tail=120 postgres api web
```

## 5. Verify HCIS locally before touching Caddy

```bash
curl -i http://127.0.0.1:18080/
curl -i http://127.0.0.1:18080/api/health
curl -i http://127.0.0.1:18080/api/ready
curl -i http://127.0.0.1:18080/api/auth/me
```

Expected system results for healthy process/database:

```json
{"status":"ok"}
{"status":"ready"}
```

Before login, `/api/auth/me` should return HTTP 401 with `UNAUTHENTICATED`. This confirms that the real session boundary is active.

Also confirm the web container is attached to the existing ingress network:

```bash
docker inspect infra-web-1 --format '{{range $name, $cfg := .NetworkSettings.Networks}}{{println $name}}{{end}}'
```

The output must include `edge_proxy` and the private HCIS backend network.

## 6. Add the HCIS route to the existing Caddy

The repository contains the reviewed site block at:

```text
infra/caddy/hcis.sabilulquran.or.id.caddy
```

Back up the active Caddyfile first:

```bash
sudo cp /var/www/edge/caddy/Caddyfile \
  /var/www/edge/caddy/Caddyfile.backup-before-hcis
```

Append the HCIS block once:

```bash
if ! sudo grep -q '^hcis\.sabilulquran\.or\.id' /var/www/edge/caddy/Caddyfile; then
  cat /var/www/hcis/infra/caddy/hcis.sabilulquran.or.id.caddy | \
    sudo tee -a /var/www/edge/caddy/Caddyfile >/dev/null
fi
```

Validate before reload:

```bash
docker exec edge-caddy-1 caddy validate --config /etc/caddy/Caddyfile
```

Only if validation reports `Valid configuration`, reload Caddy gracefully:

```bash
docker exec edge-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Do not recreate or restart the Caddy container just to add HCIS.

Caddy can route directly to `hcis-web:80` because both containers share `edge_proxy`. Caddy automatic HTTPS can issue the certificate while the Cloudflare record remains DNS-only.

## 7. Bootstrap the first Super Admin once

The first real account is `admin@hcis.sabilulquran.or.id`. The complete security contract is documented in `docs/security/super-admin-bootstrap.md`.

Run the bootstrap only after migration `0002_auth_bootstrap.sql` is applied and the new API image is healthy:

```bash
cd /var/www/hcis
COMPOSE="docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml"

read -s -p "Super Admin password (minimum 14 characters): " HCIS_BOOTSTRAP_PASSWORD
echo
export HCIS_BOOTSTRAP_PASSWORD

$COMPOSE run --rm \
  -e HCIS_ALLOW_SUPER_ADMIN_BOOTSTRAP=1 \
  -e HCIS_BOOTSTRAP_PASSWORD \
  api \
  node apps/api/dist/modules/auth/cli/bootstrap-super-admin.js \
  --email admin@hcis.sabilulquran.or.id

unset HCIS_BOOTSTRAP_PASSWORD
```

The command prints the TOTP secret/URI and one-time recovery codes exactly once. Put the TOTP secret into an authenticator and store recovery codes offline. Never paste these values into chat, screenshots, repository files, shell history, or issue trackers.

The bootstrap refuses to create a second Super Admin. Future privileged account changes must use the audited account-management domain rather than this bootstrap path.

## 8. External verification

```bash
curl -I https://hcis.sabilulquran.or.id/
curl -i https://hcis.sabilulquran.or.id/api/health
curl -i https://hcis.sabilulquran.or.id/api/ready
curl -i https://hcis.sabilulquran.or.id/api/auth/me
```

Without a browser session, `/api/auth/me` should remain 401.

Browser verification after Super Admin bootstrap:

```text
https://hcis.sabilulquran.or.id/
```

Expected behavior:

1. password is checked by the API;
2. Super Admin is asked for authenticator/recovery code;
3. successful MFA creates an HttpOnly Secure session cookie;
4. Super Admin lands at `/admin`;
5. entering `/app` as Super Admin redirects back to `/admin`;
6. an unauthenticated browser entering `/app` redirects to `/`.

The employee import HTTP/admin UI remains closed until it is explicitly protected by backend Super Admin authorization.

## 9. Updating an existing deployment

If the deployment predates real auth, add the encryption key before starting the new API image. Do not replace the existing PostgreSQL password.

```bash
cd /var/www/hcis

if ! grep -q '^AUTH_ENCRYPTION_KEY=' infra/.env.vps; then
  AUTHKEY="$(openssl rand -hex 32)"
  printf '\nAUTH_ENCRYPTION_KEY=%s\nAUTH_SESSION_TTL_HOURS=8\n' "$AUTHKEY" >> infra/.env.vps
  unset AUTHKEY
fi
chmod 600 infra/.env.vps

git fetch origin
git pull --ff-only origin feat/backend-employee-import-foundation

COMPOSE="docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml"
$COMPOSE build api
$COMPOSE build web
$COMPOSE up -d
```

Validate without exposing the encryption key:

```bash
grep '^AUTH_ENCRYPTION_KEY=' infra/.env.vps | sed 's/=.*/=<configured>/'
grep '^AUTH_SESSION_TTL_HOURS=' infra/.env.vps
$COMPOSE ps
curl -i http://127.0.0.1:18080/api/auth/me
```

Do not use `git reset --hard`, force-push, or destructive database commands as routine deployment steps.

## 10. Stop HCIS without deleting data

```bash
cd /var/www/hcis
COMPOSE="docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml"
$COMPOSE down
```

Do not add `-v` unless the PostgreSQL data volume is intentionally being destroyed.

## Security notes

- This hostname remains a development/verification environment until explicitly promoted.
- Use synthetic employee/payroll data until authorization and import review are ready.
- PostgreSQL has no published host port.
- Fastify is not connected to the shared edge network; only `hcis-web` is reachable from Caddy.
- Super Admin is a standalone technical account, not a fake employee record.
- Super Admin requires MFA; passwords and MFA/recovery secrets must never enter the repository.
- Real employee spreadsheets must not be copied to the server until the protected import flow is ready.
- `exceljs` currently carries moderate transitive dependency advisories. Do not use `npm audit fix --force`; resolve that dependency deliberately before exposing employee workbook upload to production users.
