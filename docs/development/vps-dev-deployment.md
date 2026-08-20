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

```bash
cd /var/www/hcis
cp infra/vps.env.example infra/.env.vps
openssl rand -hex 32
```

Put the generated value into `POSTGRES_PASSWORD` in `infra/.env.vps`.

Keep these topology values:

```text
EDGE_NETWORK=edge_proxy
HCIS_BIND_ADDRESS=127.0.0.1
HCIS_HTTP_PORT=18080
```

Do not commit `infra/.env.vps`.

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
```

Expected API result for healthy process/database:

```json
{"status":"ok"}
```

`/ready` must not report success if PostgreSQL is unreachable.

Also confirm the web container is actually attached to the existing ingress network:

```bash
docker network inspect edge_proxy --format '{{range $id, $c := .Containers}}{{println $c.Name}}{{end}}' | grep hcis
```

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

## 7. External verification

```bash
curl -I https://hcis.sabilulquran.or.id/
curl -i https://hcis.sabilulquran.or.id/api/health
curl -i https://hcis.sabilulquran.or.id/api/ready
```

Then open in a browser:

```text
https://hcis.sabilulquran.or.id/
https://hcis.sabilulquran.or.id/app
```

The employee import HTTP/admin UI is intentionally not exposed yet. This deployment first verifies the web shell, API, PostgreSQL migration, and readiness path.

## 8. Updating the deployment

```bash
cd /var/www/hcis
git fetch origin
git pull --ff-only origin feat/backend-employee-import-foundation

COMPOSE="docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml"
$COMPOSE build api
$COMPOSE build web
$COMPOSE up -d
```

Do not use `git reset --hard`, force-push, or destructive database commands as routine deployment steps.

## 9. Stop HCIS without deleting data

```bash
cd /var/www/hcis
COMPOSE="docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml"
$COMPOSE down
```

Do not add `-v` unless the PostgreSQL data volume is intentionally being destroyed.

## Security notes

- This hostname is a development environment until explicitly promoted.
- Use synthetic data only during foundation verification.
- PostgreSQL has no published host port.
- Fastify is not connected to the shared edge network; only `hcis-web` is reachable from Caddy.
- No spreadsheet containing real employee/payroll data should be copied to the server yet.
- The employee import HTTP/admin surface remains closed before authorization exists.
- `exceljs` currently carries moderate transitive dependency advisories. Do not use `npm audit fix --force`; resolve that dependency deliberately before exposing employee workbook upload to production users.
