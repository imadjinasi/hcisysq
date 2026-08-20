# VPS Development Deployment

**Status:** ACTIVE DEVELOPMENT GUIDE  
**Target host:** `hcis.sabilulquran.or.id`

This profile is for development verification and early pilot work. Use synthetic data only until production readiness, migration, access control, and security review are complete.

## Topology

```text
https://hcis.sabilulquran.or.id
        |
        v
host reverse proxy + TLS
        |
        v
127.0.0.1:18080
        |
        v
hcis web (nginx)
  |             |
  | /           | /api/* (prefix stripped)
  v             v
Vite SPA       Fastify API :3001
                    |
                    v
              PostgreSQL :5432
              internal network only
```

The PostgreSQL service has no published host port in the VPS profile.

## 1. DNS

At the DNS manager for `sabilulquran.or.id`, create an `A` record for `hcis` pointing to the VPS public IPv4 address. Keep TTL at the provider default unless there is a reason to change it.

Jagoan Hosting reference:

- https://www.jagoanhosting.com/tutorial/tips/cara-membuat-subdomain-di-member-area-jagoan-hosting

Wait until the record resolves to the VPS before issuing TLS certificates.

Useful checks:

```bash
nslookup hcis.sabilulquran.or.id
# or
dig +short hcis.sabilulquran.or.id
```

## 2. Inspect the VPS first

Before changing port 80/443 configuration, identify the existing reverse proxy and current Docker workloads:

```bash
docker version
docker compose version
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
sudo ss -lntp | grep -E ':(80|443)\\s' || true
```

Do not replace the existing reverse proxy blindly. HCIS intentionally binds only to `127.0.0.1:18080` by default so it does not collide with other services.

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

Do not commit `infra/.env.vps`.

Default resource limits are intentionally conservative for a small shared VPS:

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

The API container waits for PostgreSQL, runs pending SQL migrations, then starts Fastify.

Check status and logs:

```bash
docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml ps

docker compose --env-file infra/.env.vps -f infra/docker-compose.vps.yml logs --tail=200 postgres api web
```

## 6. Verify locally on the VPS before exposing the hostname

```bash
curl -i http://127.0.0.1:18080/
curl -i http://127.0.0.1:18080/api/health
curl -i http://127.0.0.1:18080/api/ready
```

Expected API results:

```json
{"status":"ok"}
```

`/ready` must only report ready when PostgreSQL is reachable.

## 7. Connect the existing host reverse proxy

Use the reverse proxy already responsible for ports 80/443 on the VPS.

### If the host uses native nginx

Example upstream configuration:

```nginx
server {
    listen 80;
    server_name hcis.sabilulquran.or.id;

    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Validate before reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Then issue/attach a TLS certificate using the certificate mechanism already used on the VPS. If the VPS uses Certbot with nginx, the usual command is:

```bash
sudo certbot --nginx -d hcis.sabilulquran.or.id
```

Do not install a second proxy stack only for HCIS.

### If the reverse proxy itself runs in Docker

A container cannot normally reach the host's `127.0.0.1:18080`. Prefer attaching the proxy to an explicit shared Docker network and routing to the HCIS web container, or bind HCIS to a private host interface that is reachable from the proxy and protected by firewall rules.

Inspect the existing proxy first; do not change `HCIS_BIND_ADDRESS` to `0.0.0.0` unless the firewall exposure is understood.

## 8. External verification

After DNS + reverse proxy + TLS are active:

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

The employee import UI is not public yet. The current deployment is intended to verify the web shell, API process, database migration, and readiness path first.

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
- PostgreSQL must remain private to the Docker network.
- No spreadsheet containing real employee/payroll data should be copied to the server yet.
- The employee import HTTP/admin surface is intentionally not exposed before authorization exists.
- `exceljs` currently carries moderate transitive dependency advisories. Do not use `npm audit fix --force`; track and resolve the dependency deliberately before exposing employee workbook upload to production users.
