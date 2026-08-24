# ATT-002 — Geolocation Attendance Capture

**Status:** PLANNED DESIGN BASELINE  
**Depends on:** ATT-001 — Kehadiran Harian

## Goal

Define a provider-decoupled geolocation attendance direction for HCIS YSQ without weakening the ATT-001 invariant that attendance raw records are factual punch/correction data only.

This document records the current implementation direction. It is not yet an implementation contract and does not activate employee self-punch in production.

## Product direction

HCIS is expected to be used primarily from phones, and Attendance is expected to become the highest-frequency operational journey. The intended future employee flow is therefore mobile-first and low-friction while preserving factual provenance and server-side validation.

## 1. Employee GPS capture

Use browser-native geolocation via `navigator.geolocation`.

Capture and preserve raw facts such as:

- `latitude`;
- `longitude`;
- `accuracy`;
- `captured_at`;
- source/provenance.

A map provider is not required to obtain the device coordinates.

The client must not be trusted to decide whether a coordinate is inside the allowed attendance area.

## 2. Employee map UI

Baseline rendering stack:

- MapLibre GL for the interactive map;
- OpenFreeMap as the initial map-rendering provider.

The employee map should show:

- employee position marker;
- office/location marker;
- office geofence/radius circle;
- distance from employee position to the office;
- reported GPS accuracy.

Employee-facing attendance does not need Places search. The primary employee need is to understand their own position relative to the configured attendance location.

## 3. Server-side geofence validation

Geofence validation must be authoritative on the HCIS backend.

The backend calculates the distance between the captured punch coordinate and the configured office coordinate, then evaluates the configured allowed radius.

Example office-location configuration:

- latitude;
- longitude;
- allowed radius, for example 100–150 metres.

The map-rendering or Places provider must never determine whether an attendance punch is valid.

A geofence result is a technical location validation only. It must not infer lateness, absence, overtime, worked hours, payroll consequences, or leave consequences.

## 4. Admin office-location UI

Admin should use the same map-rendering foundation with additional location-configuration capabilities:

- search place/address;
- autocomplete Places results;
- select a search result;
- click or drag the office pin;
- configure radius;
- preview geofence coverage;
- save the office coordinate and radius.

## 5. Places/search provider

OpenFreeMap is used for map rendering and is not treated as a replacement for a Places/search service.

Baseline candidate for admin location search:

- Mapbox Search / Places.

Search usage is expected to be far lower than employee attendance usage because office-location configuration is infrequent.

If Indonesian address/POI quality is not sufficient during implementation validation, Google Places may be evaluated specifically for the admin search surface.

Provider pricing, licensing, quota, and Indonesian search quality must be revalidated before implementation.

## 6. Target architecture

```text
                    HCIS ATTENDANCE

EMPLOYEE
Browser Geolocation
        |
        +---- latitude / longitude / accuracy
        |
        v
MapLibre + OpenFreeMap
        |
        +-- employee marker
        +-- office marker
        +-- office radius
        |
        v
Punch API
        |
        v
HCIS Backend
        |
        +-- preserve raw coordinates
        +-- preserve accuracy/provenance
        +-- calculate distance/geofence
```

```text
ADMIN - OFFICE LOCATION

MapLibre + OpenFreeMap
        |
        +-- Mapbox Search / Places
        +-- search place/address
        +-- select / drag pin
        +-- set radius
        +-- preview coverage
        +-- save office coordinate
```

## 7. Provider separation

The intended responsibilities are deliberately separated:

- **Map rendering:** MapLibre + OpenFreeMap baseline;
- **GPS:** browser-native geolocation;
- **Geofence:** HCIS backend;
- **Places/search:** Mapbox baseline, primarily for admin configuration.

Attendance core must not depend on one map/search vendor. Replacing OpenFreeMap with another renderer source, or replacing Mapbox Search with Google Places, must not require redesigning the attendance raw-record domain.

## 8. Attendance-domain invariant

ATT-001 remains authoritative until ATT-002 is implemented and verified.

Raw attendance continues to represent observed punch/location/correction facts only.

Geolocation must not automatically infer or calculate HR outcomes such as:

- late arrival;
- absence;
- overtime;
- worked hours;
- payroll deduction;
- annual-leave conversion;
- attendance-resolution outcome.

Those remain separate policy/resolution concerns.

## 9. Initial implementation preference

Current preferred baseline for the first geolocation implementation:

- OpenFreeMap + MapLibre for map rendering;
- browser-native geolocation for employee coordinates;
- HCIS backend for distance/geofence validation;
- Mapbox Search for admin office-location search.

This is a planned architecture decision, not yet a production-enabled feature.

## 10. Decisions still required before implementation

Before coding ATT-002, define explicitly:

- whether HCIS employee self-punch, external device/provider ingestion, or a hybrid model is authoritative;
- supported office/location count and assignment rules;
- accuracy acceptance policy and behavior when location permission is denied/unavailable;
- whether an out-of-geofence punch is rejected, recorded-but-flagged, or routed to a separate exception flow;
- privacy/retention requirements for employee coordinates;
- offline/retry and duplicate-punch behavior;
- exact audit/provenance fields and writer identities;
- anti-spoofing expectations and realistic browser limitations.

These decisions must be explicit rather than inferred from the map UI.
