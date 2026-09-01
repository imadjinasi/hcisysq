# ATT-005 Package 2 — Biometric Control Plane

**Status:** IMPLEMENTATION  
**Updated:** 2026-09-01  
**Production baseline before this package:** `968ebe3766c7984f97eb3e22a9f7255b76ca5679`

## Purpose

Package 2 completes the HCIS-side biometric control plane without enabling biometric collection or inventing hardware protocol capabilities.

The production rollout for this package MUST keep:

```text
BIOMETRIC_COLLECTION_ENABLED=0
```

A successful Package 2 deployment proves software readiness, encrypted-vault maintenance, lifecycle review, safe observability, and capability gating. It does **not** prove template query, backup from physical hardware, restore to a physical device, enrollment, distribution, or delete semantics.

## Fixed safety boundary

Package 2 does not add an executable device command for:

- biometric/template query;
- fingerprint/face/palm/photo extraction;
- template restore;
- cross-device distribution;
- remote enrollment;
- biometric deletion on device;
- device-user deletion/recreate;
- PIN mutation or rename;
- USERINFO read.

Active USERINFO reads remain retired. Existing DB retirement guards remain mandatory.

Normal HCIS API/UI/logging MUST NOT expose:

- plaintext biometric/template payload;
- encrypted ciphertext;
- SHA/hash values for credential payload;
- IV;
- authentication tag;
- encryption key ID;
- encryption key material.

`payloadByteLength`, modality, slot, vendor format/version, lifecycle, timestamps, employee identity, origin-device identity, envelope **format version**, and known replica state are metadata, not payload material.

## Control-plane model

### Collection gate

Collection continues to require all of the following before payload ingress can be stored:

1. process-wide `BIOMETRIC_COLLECTION_ENABLED=1`;
2. valid encryption keyring;
3. selected trusted device has `biometric_collection_enabled=true`;
4. selected device lifecycle is `active`.

Package 2 production deployment intentionally satisfies none of the enablement intent. The global gate remains OFF and all per-device gates are expected OFF.

### Maintenance keyring

Vault maintenance is intentionally separate from collection enablement.

A valid maintenance keyring MAY be configured while collection remains OFF so an existing encrypted vault can be inspected for key drift and re-encrypted locally. This does not authorize payload collection from devices.

If either `BIOMETRIC_ACTIVE_KEY_ID` or `BIOMETRIC_ENCRYPTION_KEYS` is configured, both must be present and valid. Partial/invalid configuration is a startup error.

If neither is configured while collection is OFF, HCIS remains valid and fail-closed:

- vault metadata can still be viewed;
- collection remains OFF;
- key rotation action remains blocked;
- no key material is needed merely to deploy Package 2.

## Key ownership and rotation procedure

Key material is an infrastructure secret. It belongs in production secret management/VPS environment only and MUST NOT be stored in:

- repository files;
- PostgreSQL rows;
- audit metadata;
- screenshots;
- support tickets;
- ordinary application logs.

Rotation sequence:

1. preserve the old key in the keyring;
2. add the new 32-byte key under a new key ID;
3. set `BIOMETRIC_ACTIVE_KEY_ID` to the new ID;
4. keep `BIOMETRIC_COLLECTION_ENABLED=0` during Package 2 rollout/maintenance;
5. deploy and verify keyring readiness without printing IDs/material;
6. process bounded transactional re-encryption batches;
7. verify `rotationRequiredCount=0` for the intended scope;
8. preserve both database backup and the separate old/new key escrow during the recovery window;
9. remove the old key only after the recovery window and restoration procedure have been reviewed.

A batch is all-or-nothing. Unsupported envelope version, missing source key, GCM authentication failure, hash mismatch, or length mismatch aborts and rolls back the batch for manual review.

Re-encryption creates an append-only `credential_reencrypted` audit event containing only safe operational metadata. It does not log old/new key IDs.

## Backup and restore readiness

A PostgreSQL backup contains encrypted credential envelopes but intentionally does not contain encryption keys.

Therefore a usable vault recovery requires **two separately protected artifacts**:

1. database backup containing encrypted vault rows;
2. matching external keyring escrow containing the keys needed to decrypt those rows.

Package 2 includes a synthetic restore/re-encryption drill using fake opaque bytes only. The drill proves:

- an older encrypted envelope remains decryptable when its old key is retained;
- local re-encryption can move the envelope to the configured active key while collection is OFF;
- plaintext identity is preserved by SHA/length checks;
- normal metadata responses and audit rows do not reveal payload/key identifiers.

This synthetic drill is not a physical device template-transfer test.

## Credential lifecycle

Credential lifecycle remains:

```text
active -> retired -> destroyed
```

Package 2 does not introduce automatic retirement or destruction.

If the authoritative employee lifecycle is `inactive` or `resigned` while a biometric credential is not destroyed:

- surface `lifecycleReviewRequired=true`;
- include it in review counts;
- do not mutate the credential automatically;
- do not issue device delete;
- do not destroy the HCIS master.

Master destruction remains blocked until an explicit approved retention/destruction policy exists.

## Replica semantics

`attendance_biometric_device_states` is evidence-driven only.

Supported state vocabulary remains:

```text
unknown | missing | present | stale | conflict | pending | succeeded | failed
```

No replica row means **unknown**, not `missing`.

Package 2 does not generate new physical replica evidence. Existing evidence may be displayed safely in the Biometrik workspace.

## Capability matrix in Package 2

| Capability | Package 2 state | Device command |
| --- | --- | --- |
| Encrypted vault metadata | available | no |
| Local bounded envelope re-encryption | available only when keyring ready | no |
| Passive biometric collection | blocked in production | no command; global/device gates OFF |
| Template query from device | not_verified | would require hardware protocol proof |
| Restore to device | not_verified | would require hardware protocol proof |
| Cross-device distribution | not_verified | would require hardware protocol proof |
| Remote enrollment | not_verified | would require hardware protocol proof |
| Device-side biometric delete | not_verified | would require hardware protocol proof |
| HCIS master destroy | blocked | no; retention policy pending |

Unsupported/not-verified hardware capability MUST remain disabled rather than guessed from third-party WDMS or Push SDK documentation.

## Admin workspace

Each device gains a `Biometrik` tab with:

- global/device/effective collection status;
- maintenance keyring readiness without identifiers/material;
- vault metadata counts;
- lifecycle review count;
- rotation-required count when determinable;
- capability matrix;
- paginated credential metadata for the selected origin device;
- paginated known replica evidence;
- explicit retention fail-closed warning.

The workspace intentionally does not expose buttons for template query, enrollment, restore, distribution, device delete, or master destruction.

Local re-encryption is guarded by:

- SUPER_ADMIN authorization;
- valid maintenance keyring;
- bounded batch size;
- explicit `REENCRYPT_VAULT` confirmation;
- transaction rollback on integrity/version failure;
- append-only audit.

## Pagination follow-up from Package 1 UAT

Package 2 also closes the non-blocking Package 1 pagination finding:

- mapping review backlog is paginated instead of truncating to the first eight items;
- device transaction history is paginated within the existing bounded server result;
- device command history is paginated within the existing bounded server result;
- biometric credential and replica metadata use pagination.

Pagination does not change the source-data completeness contract. In particular, client pagination over the bounded transaction/command API does not imply complete history.

## Deployment contract

Normal Package 2 production flow remains:

```text
CODE -> PR/MERGE -> CI GREEN -> 1x DEPLOY VPS -> 1x VERIFY -> security/UI UAT -> DONE
```

Deployment MUST NOT require adding biometric keys solely to make the release start. Production may legitimately report maintenance keyring `not configured` while collection remains OFF.

The VPS verifier must confirm:

- exact deployed SHA;
- API/Web/PostgreSQL health;
- latest migration consistency;
- USERINFO retirement trigger still present;
- global biometric collection OFF;
- all per-device biometric collection gates OFF;
- biometric audit append-only trigger present;
- Package 2 envelope-maintenance columns present;
- safe credential lifecycle counts only;
- verifier requested zero device commands.

## UAT

Package 2 UAT is software/security UAT only:

- open `Biometrik` in a fresh browser session;
- verify global/device/effective collection show OFF;
- verify no raw envelope or biometric payload appears;
- verify hardware capability actions are absent/disabled and reported `Belum terverifikasi`;
- verify empty vault/replica states render safely when production contains no collected credential;
- verify pagination controls render normally;
- do not enable collection;
- do not configure keys merely for UI proof;
- do not send any fingerprint-device command.

A later physical biometric canary requires its own reviewed safety design and explicit approval. It is outside normal Package 2 deploy/UAT.
