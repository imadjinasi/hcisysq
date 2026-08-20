# HCIS API

TypeScript/Fastify API foundation for the canonical HCIS repository.

## Local database

Copy the local environment examples without committing the copied files:

```bash
cp infra/.env.example infra/.env.local
cp apps/api/.env.example apps/api/.env.local
```

Use matching PostgreSQL credentials in both files, then:

```bash
npm run db:up
npm run migrate:api
npm run dev:api
```

Health endpoints:

- `GET /health` — process liveness.
- `GET /ready` — verifies the PostgreSQL connection.

## Employee master import bootstrap

The first implementation intentionally uses a local CLI adapter. It exercises the same application/import store that the later authenticated admin UI/API will call.

Preview a workbook:

```bash
npm run employees:import -- --file /path/to/master-data.xlsx
```

The command prints counts and issue codes only; it does not log employee values. Copy the returned `importId`, review the counts, then commit:

```bash
npm run employees:import -- --commit <import-id>
```

The CLI refuses to run when `NODE_ENV=production`. Tests and repository fixtures must use synthetic data only.
