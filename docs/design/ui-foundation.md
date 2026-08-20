# Canonical Web UI Foundation

**Status:** ACTIVE  
**Canonical implementation:** `apps/web`

## Origin

The first visual exploration was created in `imadjinasi/hcis-ysq-foundation`. Selected, reviewed UI has now been consolidated into this repository. The foundation repository is reference/archive only and must not be treated as a second source of truth.

## Current routes

- `/` — login prototype/foundation UI.
- `/app` — employee workspace and dashboard using synthetic data.

Authentication is still prototype-only in `apps/web`; business authorization will be implemented through the canonical API/domain layers.

## Access-model visualization

- Active employees always retain employee self-service UI.
- Additional roles add management navigation instead of replacing employee access.
- Scope and authorization are backend/domain concerns.
- The synthetic dashboard persona has an additional unit-manager role only to demonstrate additive access.

## MVP dashboard

The dashboard currently visualizes:

- today's attendance;
- leave balance;
- active employee requests;
- imported payslip availability (read-only);
- management approval count when an additional role exists;
- quick actions for leave, attendance permission, payslip, and documents.

Reimbursement is intentionally excluded from the MVP UI direction.

## Hard boundary

The browser must not become authoritative for:

- authentication/session authorization;
- leave balance calculation;
- working-day calculation;
- approval-chain resolution;
- role/scope enforcement;
- payroll calculation;
- payslip import validation;
- production employee data.
