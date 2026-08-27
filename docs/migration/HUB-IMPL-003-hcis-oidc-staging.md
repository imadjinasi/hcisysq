# HUB-IMPL-003 — HCIS OIDC staging consumer

**Status:** IMPLEMENTATION  
**Scope:** staging rehearsal only  
**Authoritative cross-repo specification:** `imadjinasi/SQ-Hub/docs/specs/HUB-IMPL-003-hcis-oidc-client.md`

This document records the HCIS-local implementation and recovery procedure. It does not redefine the SQ Hub specification and does not authorize production cutover.

## Actor and preconditions

Actor: Staff member with a synthetic staging SQ Identity and an explicitly mapped HCIS account.

Preconditions for OIDC mode:
- `AUTH_MODE=oidc` is configured on the HCIS API;
- the SQ Identity client is configured for the accepted HCIS callback URI;
- the HCIS account has exactly one persisted `identity_issuer + identity_subject` mapping;
- the HCIS-local account is `active`;
- SQ Hub Application Access contains an active grant for `applicationKey=hcis`;
- required OIDC and machine-client secrets are supplied through runtime secret configuration, never the repository.

## Workflow and state transition

1. The browser requests `/api/auth/oidc/start`.
2. HCIS creates one-time server-side state containing only a SHA-256 hash of OAuth `state`, the PKCE verifier, nonce, and a 10-minute expiry.
3. The browser is redirected to SQ Identity using Authorization Code + PKCE + state + nonce.
4. Keycloak redirects to the exact public `/auth/callback` route. Nginx sends this route directly to the API; it is not handled by the SPA.
5. HCIS atomically consumes the one-time transaction and validates the callback through `openid-client`.
6. HCIS resolves the local principal only by exact OIDC `issuer + sub`. Email and NIP are not callback join keys.
7. HCIS checks local account state, then obtains a service token as `hcis-api-staging` and calls SQ Hub Application Access for `hcis`.
8. Only an allowed decision creates the existing HCIS app-scoped `hcis_session`; downstream HCIS roles/permissions continue to use the original `accounts.id`.

No OIDC access token, refresh token, ID token, code verifier, or machine token is stored in browser storage.

## Authentication modes

`AUTH_MODE=local` remains the default. Merging this implementation therefore does not change production authentication behavior.

When `AUTH_MODE=oidc`:
- the public password endpoint `/auth/login` returns `404 LOCAL_AUTH_DISABLED`;
- the login page fetches `/auth/mode` and renders only SQ Identity entry;
- failure to load the mode does not fall back to the local password form;
- existing valid HCIS sessions are checked locally through `/auth/me` and do not call SQ Hub on every request.

## Audit and failure behavior

The callback route suppresses request logging because the callback URL contains an authorization code. HCIS audit events record the outcome without persisting OIDC tokens or codes.

New session creation fails closed for invalid or expired callback state, invalid OIDC validation, missing mapping, inactive local account, denied Application Access, or unavailable Application Access verification.

## Database migration

`0020_hub_oidc_identity_mapping.sql` adds:
- nullable `accounts.identity_issuer`;
- nullable `accounts.identity_subject`;
- a pair-nullability check (both null or both populated);
- a partial unique index on populated `(identity_issuer, identity_subject)`;
- short-lived `auth_oidc_transactions` server-side callback state.

`accounts.id` and all existing foreign keys remain unchanged.

## Recovery / rollback rehearsal

Application rollback is configuration-first:
1. set HCIS staging `AUTH_MODE=local`;
2. restart or redeploy HCIS staging;
3. verify local login and existing authorization behavior;
4. keep identity mapping columns in place during the rehearsal so rollback does not require destructive data changes.

If schema removal is explicitly required later, first verify no environment is in OIDC mode and no OIDC transaction is active. Then drop `auth_oidc_transactions`, the partial identity index, the pair-nullability constraint, and the two identity columns. Do not modify `accounts.id` or role-assignment foreign keys.

## Staging configuration names

Required only for `AUTH_MODE=oidc`:
- `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_REDIRECT_URI`
- `OIDC_POST_LOGOUT_REDIRECT_URI`
- `SQ_HUB_APPLICATION_ACCESS_URL`
- `SQ_HUB_MACHINE_CLIENT_ID`
- `SQ_HUB_MACHINE_CLIENT_SECRET`

HCIS session TTL in OIDC mode is configuration-validated to a maximum of 12 hours.

## Verification commands

The PR quality gate must actually run:

```bash
npm ci
npm run migrate:api
npm run typecheck
npm run lint
npm run test
npm run build
```

Browser UAT on the real staging stack remains required for Keycloak redirect and TLS, synthetic login, privileged TOTP and recovery behavior, logout semantics, token-storage inspection, Application Access denial, outage behavior, and rollback rehearsal.
