# VPS Development Deployment

**Status:** ACTIVE DEVELOPMENT GUIDE  
**Target host:** `hcis.sabilulquran.or.id`

This profile is for development verification and early pilot work. Use synthetic data only until production readiness, migration, access control, and security review are complete.

## Confirmed VPS topology

The shared VPS already uses Dockerized Caddy as the only public ingress on ports 80/443. Its shared Docker network is `edge_proxy`.

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
                    | private backend network
                    v
              PostgreSQL :5432
```

Only the HCIS web container joins `edge_proxy`. The API and PostgreSQL stay on the private HCIS backend network. The web container reaches the API privately and proxies `/api/*` to it.

For host-only troubleshooting, the web container also binds to `127.0.0.1:18080`. This is not a public port.

## 1. DNS

DNS is managed in Cloudflare. Create:

```text
Type: A
Name: hcis
Value: VPS public IPv4
Proxy status: DNS only during initial verification
TTL: Auto
```

Verify it resolves to the VPS before continuing:

```bash
nslookup hcis.sabilulquran.or.id
# or
dig +short hcis.sabilulquran.or.id
```

After the origin and TLS route are verified, Cloudflare proxying can be evaluated separately.

## 2. Confirm the existing ingress

Before deploying HCIS, inspect the running workloads rather than replacing the existing reverse proxy:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

The expected ingress container is `edge-caddy-1`, owning host ports 80 and 443.

Confirm its Docker network:

```bash
docker inspect edge-caddy-1 --format '{{range $name, $config := .NetworkSettings.Networks}}{{println $name}}{{end}}'
```

Expected network:

```text
edge_proxy
```

Do not expose another container on host ports 80 or 443.

## 3. Clone the verification branch

Until the backend foundation is merged, deploy the verification branch directly:

```bash
sudo mkdir -p /opt/hcis
sudo chown "$USER":"$USER" /opt/hcis
cd /opt/hcis

git clone https://github.com/imadjinasi/hcisysq.git .
git fetch origin
git checkout feat/backend-employee-import-foundation
```

For an existing checkout:

```bash
cd /opt/hcis
git fetch origin
git checkout feat/backend-employee-import-foundation
git pull --ff-only origin feat/backend-employee-import-foundation
```

## 4. Create the VPS environment file

```bash
cd /opt/hcis
cp infra/vps.env.example infra/.env.vps
```

Generate a database password:

```bash
openssl rand -hex 32
```

Put that value into `POSTGRES_PASSWORD` in `infra/.env.vps`.

Keep these values unless the VPS topology changes:

```text
EDGE_NETWORK=edge_proxy
HCIS_BIND_ADDRESS=127.0.0.1
HCIS_HTTP_PORT=18080
```

Do not commit `infra/.env.vps`.

Default resource limits are intentionally conservative for the shared VPS:

- PostgreSQL: 320 MB;
- API: 192 MB;
- web/nginx: 96 MB.

Adjust only after observing actual memory pressure.

## 5. Build and start HCIS

```bash
cd /opt/hcis

docker compose \
  --env-file infra/.env.vps \
  -f infra/docker-compose.vps.yml \
  up -d --build
```

The Compose profile expects the external Docker network `edge_proxy` to already exist. The web service joins that network with the unique alias `hcis-web`; Caddy can route to `hcis-web:80` without exposing the API or database.

The API waits for PostgreSQL, runs pending SQL migrations, then starts Fastify.

Check status and logs:

```bash
docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml ps

docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml logs --tail=200 postgres api web
```

## 6. Verify locally on the VPS before changing Caddy

```bash
curl -i http://127.0.0.1:18080/
curl -i http://127.0.0.1:18080/api/health
curl -i http://127.0.0.1:18080/api/ready
```

Expected API result for a healthy process/database:

```json
{"status":"ok"}
```

`/ready` must not report success if PostgreSQL is unreachable.

## 7. Locate the existing Caddy configuration

Do not guess where Caddy configuration lives. Inspect the existing container mounts first:

```bash
docker inspect edge-caddy-1 --format '{{range .Mounts}}{{println .Source " -> " .Destination}}{{end}}'
```

Identify the host path mounted as the Caddyfile/config directory. Edit the existing ingress configuration only after confirming that path.

The HCIS site route should ultimately be equivalent to:

```caddyfile
hcis.sabilulquran.or.id {
    reverse_proxy hcis-web:80
}
```

Because both containers share `edge_proxy`, Caddy resolves the `hcis-web` network alias directly.

Validate the active Caddy configuration using the same method already used by the `edge-caddy` stack before reloading it. Do not replace the existing Caddy container or its configuration for other SaaS applications.

## 8. External verification

After the Caddy route and TLS are active:

```bash
curl -I https://hcis.sabilulquran.or.id/
curl -i https://hcis.sabilulquran.or.id/api/health
curl -i https://hcis.sabilulquran.or.id/api/ready
```

Then open:

```text
https://hcis.sabilulquran.or.id/
https://hcis.sabilulquran.or.id/app
```

The employee import UI is not public yet. The current deployment first verifies the web shell, API process, database migration, and readiness path.

## 9. Updating the development deployment

```bash
cd /opt/hcis
git fetch origin
git pull --ff-only origin feat/backend-employee-import-foundation

docker compose \
  --env-file infra/.env.vps \
  -f infra/docker-compose.vps.yml \
  up -d --build
```

Do not run `git reset --hard`, force-push, or destructive database commands as part of routine deployment.

## 10. Stop without deleting data

```bash
docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml down
```

Do not add `-v` unless the PostgreSQL data volume is intentionally being destroyed.

## Security notes

- This hostname is a development environment until explicitly promoted.
- Use synthetic data only during foundation verification.
- PostgreSQL has no published host port.
- Fastify is not connected to the shared edge network; only `hcis-web` is reachable from Caddy.
- No spreadsheet containing real employee/payroll data should be copied to the server yet.
- The employee import HTTP/admin surface is intentionally not exposed before authorization exists.
- `exceljs` currently carries moderate transitive dependency advisories. Do not use `npm audit fix --force`; resolve the dependency deliberately before exposing employee workbook upload to production users.
