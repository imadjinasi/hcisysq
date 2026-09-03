# ADMS Firmware Canary Runbook

Firmware upgrade is destructive/high-risk and is never broadcast.

## Preconditions

- Low-risk physical canaries on `SPK7245000707` are stable.
- Exact device model and current firmware are observed.
- Package target model matches the device exactly.
- Package provenance/checksums are reviewed out-of-band before upload.
- No other physical operation is running on the target device.
- Production ingress is healthy and rollback/recovery access is available.

## Procedure

1. Upload/store the approved package in the HCIS firmware package catalog.
2. Select exactly one target device: primary canary `SPK7245000707`.
3. Confirm UI shows target model/version and no broadcast option.
4. Queue only `mode=canary` using the typed confirmation phrase.
5. Device polling receives a command containing a short-lived one-device download URL; reusable plaintext token must not appear in routine logs/UI/API.
6. Capture operation ID and device return code.
7. Wait for device reconnect; verify observed firmware version only through safe INFO/passive metadata mechanisms already allowed by HCIS.
8. Verify ATTLOG ingress resumes and no unexpected side traffic appears.
9. Mark capability verified only when the physical outcome is clear. If firmware rejects a documented vendor operation, record `unsupported` with evidence rather than changing the wire protocol speculatively.

Never use `CLEAR DATA` as a firmware recovery shortcut. Never change ADMS server or SDK port as part of firmware experimentation.
