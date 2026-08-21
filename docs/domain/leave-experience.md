# Leave Experience

**Status:** ACTIVE IMPLEMENTATION BASELINE  
**Specification:** LEAVE-006  
**Related:** LEAVE-003, LEAVE-004, LEAVE-005, APR-001, ORG-002

## Goal

Leave and absence workflows can be policy-heavy, but the employee-facing GUI must remain simple. The frontend should ask users about their real situation, while policy and workflow terminology remain mostly behind the scenes.

## Interaction principles

1. **One leave entry point.** Employee navigation exposes one `Cuti & Izin` destination. Annual leave, sickness, childbirth, bereavement, and other special conditions are chosen inside that experience instead of becoming separate top-level navigation items.
2. **Progressive disclosure.** Do not show dates, documents, policy notes, and workflow details before the employee has chosen the relevant leave type.
3. **No dangerous default.** A special-leave form must not silently default to `Cuti Sakit`; the employee explicitly chooses the situation before the form can continue.
4. **One primary action at a time.** Use a simple sequence such as `Pilih jenis -> Isi data -> Periksa -> Kirim` rather than presenting several competing actions.
5. **Plain language first.** Prefer labels such as `Apa yang terjadi?`, `Boleh dilengkapi nanti`, `Perlu dilengkapi`, and `Siapa yang akan menerima` over internal terms such as resolver, snapshot, discretionary approval, or evidence state.
6. **Policy is explained at the point of need.** Notice period, document requirement, or emergency behavior is shown only for the selected leave type.
7. **Status must answer what the user should do next.** Examples: `Menunggu validasi HC`, `Perlu dokumen tambahan`, `Selesai`, rather than exposing raw workflow states.
8. **Employee rights and administrative validation remain distinct.** The GUI must not imply that HC decides whether an underlying sickness, childbirth, miscarriage, or similar event is allowed to happen.

## Employee flow

```text
Cuti & Izin
  -> Pilih kebutuhan
     -> Cuti Tahunan
        -> Isi tanggal
        -> Periksa kuota dan alur
        -> Kirim

     -> Sakit / kondisi khusus
        -> Pilih kondisi nyata
        -> Isi tanggal
        -> Tambahkan dokumen bila ada/wajib
        -> Periksa ringkasan
        -> Kirim pemberitahuan/pengajuan
```

The annual-right card continues to display `12 hari / tahun` separately from current-period availability.

## Special leave chooser

The first screen should present recognizable situations rather than workflow mechanics. Initial labels include:

- Sakit;
- Hamil & Melahirkan;
- Keguguran;
- Istirahat karena Haid;
- Pendampingan Istri Melahirkan;
- Pendampingan Istri Keguguran;
- Keluarga Meninggal Dunia.

Each item has one short helper sentence. Detailed policy notes appear after selection.

## HC Validator flow

HC should be able to process a normal validation task without opening multiple screens.

Each queue card shows:

- employee and leave type;
- dates and working-day count;
- document availability;
- the employee's note;
- one note field for HC;
- two clear outcomes: `Administrasi sesuai` or `Minta dilengkapi`.

`Minta dilengkapi` requires an actionable note. `Administrasi sesuai` does not require a note unless policy later mandates it.

Future partial validation and attendance-resolution work should preserve the same pattern: HC first marks which dates are administratively covered, then unresolved dates move to a separate resolution experience. Do not overload the normal leave screen with payroll or discipline decisions.

## Navigation

Desktop and mobile employee navigation expose only one leave entry: `Cuti & Izin`.

Human Capital validation remains under the additional management role area, because it is a role capability rather than a different employee persona.

## Acceptance criteria

- LEAVE-006-A: employee navigation has one `Cuti & Izin` entry, not separate annual/special top-level items.
- LEAVE-006-B: the annual leave page offers a clear route to sickness/special-condition reporting.
- LEAVE-006-C: special leave has no preselected policy; the user explicitly chooses a condition.
- LEAVE-006-D: the special-leave form is progressively disclosed after the type is chosen.
- LEAVE-006-E: employee-facing copy avoids internal approval-engine jargon where plain language is sufficient.
- LEAVE-006-F: HC validation can be completed from a single queue card with clear next actions.
- LEAVE-006-G: mobile navigation keeps `Cuti` as the single leave destination.
