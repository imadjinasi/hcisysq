# HCIS YSQ Web

Canonical employee-facing frontend for HCIS YSQ.

## Local commands

From the repository root:

```bash
npm install
npm run dev:web
npm run typecheck:web
npm run lint:web
npm run build:web
```

This app is intentionally frontend-only for the current consolidation step. Authentication, authorization, leave balance calculation, approval resolution, payroll calculation, and production data access must remain outside the browser.

The previous `imadjinasi/hcis-ysq-foundation` repository is a design/reference source only. New product code belongs here.
