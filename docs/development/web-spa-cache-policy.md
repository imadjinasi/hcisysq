# HCIS Web SPA Cache Policy

**Status:** VERIFIED  
**Updated:** 2026-08-31

## Problem

A production verification after a frontend hotfix showed that an already-open Microsoft Edge session could continue rendering an older HCIS SPA bundle even though the production container and external origin were serving the current build. Server-side checks confirmed identical current `index.html` and hashed asset references, while the stale browser session still displayed retired UI.

This is an application-shell cache problem, not authorization for browser-specific workarounds.

## Policy

The production Nginx web container uses two different cache policies:

- `/index.html` is the mutable SPA application shell and must not be reused as a stale release. It is served with `Cache-Control: no-store, no-cache, must-revalidate`, `Pragma: no-cache`, and `Expires: 0`.
- Vite static assets keep their content-hashed filenames and may remain `public, max-age=604800, immutable` because a changed build generates a different URL.

SPA route fallback continues to resolve through `/index.html`, so normal navigation receives the current application shell while hashed assets retain efficient caching.

## Repository verification

Repository tests lock both boundaries:

- the application shell remains explicitly non-cacheable;
- static assets remain immutable;
- the SPA fallback remains `/index.html`.

## Production verification

The policy was deployed on 2026-08-31 together with the current Attendance Admin workspace release. Read-only verification confirmed:

- the deployed `index.html` returned the required no-store/no-cache headers;
- the content-hashed JavaScript asset retained the immutable one-week cache policy;
- API health, API readiness, and web health remained successful;
- the existing database USERINFO retirement guard remained present;
- retired full-roster and single-PIN USERINFO controls were absent from the built web artifact.

A fresh Microsoft Edge InPrivate session then loaded the current hashed JavaScript asset from the network and verified the production Admin UI without issuing any device command. Retired USERINFO controls were absent, Users used passive-observation wording, Diagnostics did not expose raw biometric/request material, and global/device/effective biometric collection remained OFF. The inactive/resigned mapping presentation was not exercised because no such mapping was visible in that production device sample; this is recorded as `NOT OBSERVED`, not as a failure.

The stale-client incident is therefore closed as a cache-regression issue. A browser hard refresh or InPrivate session remains useful diagnostically, but browser-specific behavior is not the primary cache-control mechanism.
