# ADMS Biometric Template Transfer Canary Runbook

Biometric canary requires explicit user approval after deployment/verifier PASS. Initial production deployment keeps `BIOMETRIC_COLLECTION_ENABLED=0`.

## Gate opening

1. Configure the biometric maintenance keyring.
2. Obtain explicit approval for one employee/PIN and primary device `SPK7245000707`.
3. Enable global biometric collection only for the canary window.
4. Enable biometric collection on only the primary device.
5. Confirm the Admin UI reports global + device + keyring gates ready.
6. Run exactly one operation, inspect evidence, then proceed to the next.

## Sequence

1. Query one approved legacy fingerprint slot or unified BIODATA slot.
2. Confirm encrypted credential backup exists and routine API/UI/logs expose no raw template, ciphertext, hash, IV, auth tag, or key ID.
3. Remote-enroll only the approved employee/PIN if required.
4. Restore the same encrypted credential to the same device; validate local match.
5. Only after same-device restore succeeds, distribute to the explicitly approved second device.
6. Delete one selected biometric on a target device; prove the HCIS master credential remains intact.
7. Restore the selected credential and validate local match if the protocol/hardware supports it.

## Stop conditions

- Unexpected USERINFO reads or unexplained OPERLOG/BIODATA traffic.
- Mapping ambiguity or PIN mismatch.
- Secret/template material appears in normal UI/API/logs.
- Device return codes are unexplained or ingress becomes unstable.

On a genuine firmware limitation, record `verified_unsupported` evidence rather than inventing a command. After the canary window, return the global and per-device collection gates to OFF unless a separately approved production policy says otherwise.
