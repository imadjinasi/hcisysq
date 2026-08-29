import { Fingerprint, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listAdmsDevices, type AdmsDevice } from "@/lib/attendance";

type RosterItem = {
  id: string;
  pin: string;
  displayName: string | null;
  cardNumber: string | null;
  privilege: string | null;
  verifyMode: string | null;
  lastSeenAt: string;
  mappingStatus: "mapped" | "unmapped";
  employeeNumber: string | null;
  employeeName: string | null;
  employeeStatus: string | null;
};

type RosterResponse = {
  inventorySemantics: "observed_only";
  completeSnapshot: false;
  note: string;
  items: RosterItem[];
};

type CredentialItem = {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employeeStatus: string;
  modality: "fingerprint" | "face" | "palm" | "bio_photo";
  slotIndex: number | null;
  vendorFormat: string;
  vendorVersion: string | null;
  originDeviceId: string | null;
  originDeviceSerial: string | null;
  sourcePin: string | null;
  capturedAt: string | null;
  importedAt: string;
  lifecycle: "active" | "retired" | "destroyed";
  payloadByteLength: number | null;
};

type CredentialResponse = {
  collectionEnabled: boolean;
  globalCollectionEnabled: boolean;
  rawPayloadExposed: false;
  items: CredentialItem[];
};

type CollectionPolicy = {
  deviceId: string;
  lifecycle: "active" | "disabled" | "quarantined";
  globalCollectionEnabled: boolean;
  deviceCollectionEnabled: boolean;
  effectiveCollectionEnabled: boolean;
  enabledAt: string | null;
  enabledByAccountId: string | null;
};

type CollectionPolicyResponse = { item: CollectionPolicy };

type ReplicaItem = {
  credentialId: string;
  state: "unknown" | "missing" | "present" | "stale" | "conflict" | "pending" | "succeeded" | "failed";
  employeeNumber: string;
  employeeName: string;
  modality: string;
  slotIndex: number | null;
  vaultVendorFormat: string;
  deviceVendorFormat: string | null;
  credentialLifecycle: string;
  observedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
};

type ReplicaResponse = {
  inventorySemantics: "known_replica_state";
  rawPayloadExposed: false;
  items: ReplicaItem[];
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Data Wave 2 tidak dapat dimuat.");
}

function fmt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function modalityLabel(value: string) {
  if (value === "fingerprint") return "Fingerprint";
  if (value === "face") return "Face";
  if (value === "palm") return "Palm";
  if (value === "bio_photo") return "Bio-photo";
  return value;
}

function gateLabel(enabled: boolean) {
  return enabled ? "ON" : "OFF";
}

export function AdminAdmsWave2ControlPlane() {
  const [devices, setDevices] = useState<AdmsDevice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [credentials, setCredentials] = useState<CredentialResponse | null>(null);
  const [policy, setPolicy] = useState<CollectionPolicy | null>(null);
  const [replicas, setReplicas] = useState<ReplicaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);

  const loadDevices = useCallback(async () => {
    const response = await listAdmsDevices();
    setDevices(response.items);
    setSelectedId((current) =>
      current && response.items.some((item) => item.id === current)
        ? current
        : response.items[0]?.id ?? "",
    );
  }, []);

  const loadSelected = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setRoster(null);
      setCredentials(null);
      setPolicy(null);
      setReplicas(null);
      return;
    }
    setLoading(true);
    try {
      const [rosterResult, credentialResult, policyResult, replicaResult] = await Promise.all([
        readJson<RosterResponse>(
          await fetch(`/api/admin/attendance/adms/devices/${deviceId}/roster`, { credentials: "include" }),
        ),
        readJson<CredentialResponse>(
          await fetch(`/api/admin/attendance/adms/biometrics?originDeviceId=${encodeURIComponent(deviceId)}`, { credentials: "include" }),
        ),
        readJson<CollectionPolicyResponse>(
          await fetch(`/api/admin/attendance/adms/devices/${deviceId}/biometric-collection-policy`, { credentials: "include" }),
        ),
        readJson<ReplicaResponse>(
          await fetch(`/api/admin/attendance/adms/devices/${deviceId}/biometric-inventory`, { credentials: "include" }),
        ),
      ]);
      setRoster(rosterResult);
      setCredentials(credentialResult);
      setPolicy(policyResult.item);
      setReplicas(replicaResult);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Data Wave 2 tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePilotGate = useCallback(async (enabled: boolean) => {
    if (!selectedId) return;
    if (
      enabled &&
      !window.confirm(
        "Aktifkan biometric collection untuk mesin pilot ini? Data biometric hanya akan di-vault jika global gate juga ON, mesin active, dan PIN memiliki mapping eksplisit ke pegawai aktif.",
      )
    ) {
      return;
    }
    setPolicySaving(true);
    try {
      const result = await readJson<CollectionPolicyResponse>(
        await fetch(`/api/admin/attendance/adms/devices/${selectedId}/biometric-collection-policy`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled }),
        }),
      );
      setPolicy(result.item);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Policy biometric collection tidak dapat disimpan.");
    } finally {
      setPolicySaving(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadDevices().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Registry mesin tidak dapat dimuat.");
    });
  }, [loadDevices]);

  useEffect(() => {
    void loadSelected(selectedId);
  }, [loadSelected, selectedId]);

  const selected = useMemo(
    () => devices.find((item) => item.id === selectedId) ?? null,
    [devices, selectedId],
  );

  const canEnablePilot = Boolean(
    policy && policy.globalCollectionEnabled && policy.lifecycle === "active" && !policy.deviceCollectionEnabled,
  );

  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-brand-heading">
            <ShieldCheck className="h-4 w-4" /> Device Roster & Biometrics · Wave 2
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
            Query/sync/enrollment/delete ke mesin tetap capability-gated. Satu-satunya kontrol write di surface ini adalah local per-device biometric pilot gate; kontrol tersebut tidak mengirim command ke mesin dan effective hanya bila global gate juga ON. Password, template biometric, hash payload, ciphertext, IV, auth tag, dan key material tidak ditampilkan.
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedId || loading}
          onClick={() => void loadSelected(selectedId)}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> {loading ? "Memuat…" : "Segarkan"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-72 text-xs font-semibold text-muted-foreground">
          Mesin
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-brand-heading"
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.displayName || device.serialNumber} · {device.serialNumber}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <div className="pb-2 text-xs text-muted-foreground">
            lifecycle <span className="font-semibold text-brand-heading">{selected.lifecycle}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-border/70 bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-brand-heading">Biometric collection pilot gate</div>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span>global <strong className="text-brand-heading">{gateLabel(policy?.globalCollectionEnabled ?? credentials?.globalCollectionEnabled ?? false)}</strong></span>
              <span>device <strong className="text-brand-heading">{gateLabel(policy?.deviceCollectionEnabled ?? false)}</strong></span>
              <span>effective <strong className="text-brand-heading">{gateLabel(policy?.effectiveCollectionEnabled ?? false)}</strong></span>
              <span>enabled at <strong className="text-brand-heading">{fmt(policy?.enabledAt ?? null)}</strong></span>
            </div>
            {!policy?.globalCollectionEnabled ? (
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                Global gate masih OFF. Device pilot tidak dapat diaktifkan sampai deployment memiliki biometric keyring yang valid dan global collection diaktifkan secara terkontrol.
              </p>
            ) : null}
          </div>
          {policy?.deviceCollectionEnabled ? (
            <button
              type="button"
              disabled={policySaving}
              onClick={() => void updatePilotGate(false)}
              className="h-9 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 disabled:opacity-50"
            >
              {policySaving ? "Menyimpan…" : "Disable pilot"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canEnablePilot || policySaving}
              onClick={() => void updatePilotGate(true)}
              className="h-9 rounded-xl border border-border bg-white px-3 text-xs font-semibold text-brand-heading disabled:opacity-50"
            >
              {policySaving ? "Menyimpan…" : "Enable pilot"}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-border/70 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-brand-heading">
            <Users className="h-4 w-4" /> Observed device roster
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {roster?.note ?? "Belum ada roster observation."}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/70">
                  <th className="px-2 py-2 font-semibold">PIN</th>
                  <th className="px-2 py-2 font-semibold">Nama di mesin</th>
                  <th className="px-2 py-2 font-semibold">Card</th>
                  <th className="px-2 py-2 font-semibold">Mapping HCIS</th>
                  <th className="px-2 py-2 font-semibold">Teramati</th>
                </tr>
              </thead>
              <tbody>
                {(roster?.items ?? []).slice(0, 100).map((item) => (
                  <tr key={item.id} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-2 font-mono font-semibold text-brand-heading">{item.pin}</td>
                    <td className="px-2 py-2 text-brand-heading">{item.displayName ?? "—"}</td>
                    <td className="px-2 py-2 font-mono text-muted-foreground">{item.cardNumber ?? "—"}</td>
                    <td className="px-2 py-2">
                      {item.mappingStatus === "mapped" ? (
                        <>
                          <div className="font-semibold text-brand-heading">{item.employeeName}</div>
                          <div className="text-[11px] text-muted-foreground">{item.employeeNumber}</div>
                        </>
                      ) : (
                        <span className="text-amber-700">Belum dimapping</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{fmt(item.lastSeenAt)}</td>
                  </tr>
                ))}
                {(roster?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-5 text-center text-muted-foreground">
                      Belum ada safe roster observation dari mesin ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-brand-heading">
            <Fingerprint className="h-4 w-4" /> Biometric vault metadata
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Hanya metadata credential yang boleh tampil. Payload vendor tetap opaque dan encrypted at rest.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/70">
                  <th className="px-2 py-2 font-semibold">Pegawai</th>
                  <th className="px-2 py-2 font-semibold">Modality</th>
                  <th className="px-2 py-2 font-semibold">Slot</th>
                  <th className="px-2 py-2 font-semibold">Format</th>
                  <th className="px-2 py-2 font-semibold">Lifecycle</th>
                </tr>
              </thead>
              <tbody>
                {(credentials?.items ?? []).slice(0, 100).map((item) => (
                  <tr key={item.id} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-2">
                      <div className="font-semibold text-brand-heading">{item.employeeName}</div>
                      <div className="text-[11px] text-muted-foreground">{item.employeeNumber}</div>
                    </td>
                    <td className="px-2 py-2 text-brand-heading">{modalityLabel(item.modality)}</td>
                    <td className="px-2 py-2 font-mono text-muted-foreground">{item.slotIndex ?? "—"}</td>
                    <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">{item.vendorFormat}</td>
                    <td className="px-2 py-2 text-muted-foreground">{item.lifecycle}</td>
                  </tr>
                ))}
                {(credentials?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-5 text-center text-muted-foreground">
                      Belum ada credential vault dari mesin ini. Effective collection tetap OFF sampai global dan device pilot gate sama-sama ON.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg bg-surface p-3 text-xs">
            <div className="font-semibold text-brand-heading">Known replica state: {replicas?.items.length ?? 0}</div>
            <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
              State hanya dibuat dari evidence sync/inventory yang diketahui; HCIS tidak menganggap credential absent hanya karena belum pernah di-query.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
