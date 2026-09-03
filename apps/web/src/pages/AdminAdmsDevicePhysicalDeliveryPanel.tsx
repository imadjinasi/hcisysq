import { useState } from "react";

import { useDeviceAdmin } from "@/components/attendance/device-admin/DeviceAdminContext";
import {
  enableAttendancePhotoCanary,
  syncPhysicalMessage,
  syncPhysicalWorkCode,
  uploadFirmwarePackage,
} from "@/lib/admsPhysicalParity";

export function AdminAdmsDevicePhysicalDeliveryPanel() {
  const { deviceId, detail } = useDeviceAdmin();
  const serial = detail?.item.serialNumber ?? "";
  const model = detail?.item.model ?? "";
  const [workCodeId, setWorkCodeId] = useState("");
  const [messageId, setMessageId] = useState("");
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [firmwareFile, setFirmwareFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await work();
      setNotice(message);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operasi physical delivery gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]" id="physical-delivery-controls">
      <h3 className="text-sm font-bold text-brand-heading">Physical delivery controls</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Gunakan ID catalog HCIS yang sudah dibuat pada workspace di atas. Semua action tetap typed, target-device explicit, dan default canary.
      </p>
      {notice ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div> : null}
      {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs font-bold">Work Code delivery</div>
          <input value={workCodeId} onChange={(event) => setWorkCodeId(event.target.value.trim())} placeholder="Work Code UUID" className="mt-2 h-9 w-full rounded-xl border border-border px-3 text-sm" />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy || !workCodeId} onClick={() => void run(() => syncPhysicalWorkCode(deviceId, workCodeId, "present"), "Work Code upsert canary di-queue.")} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Canary upsert</button>
            <button type="button" disabled={busy || !workCodeId} onClick={() => void run(() => syncPhysicalWorkCode(deviceId, workCodeId, "absent"), "Work Code delete canary di-queue.")} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Canary delete</button>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="text-xs font-bold">Public/private message delivery</div>
          <input value={messageId} onChange={(event) => setMessageId(event.target.value.trim())} placeholder="Message UUID" className="mt-2 h-9 w-full rounded-xl border border-border px-3 text-sm" />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy || !messageId} onClick={() => void run(() => syncPhysicalMessage(deviceId, messageId, "present"), "Message delivery canary di-queue.")} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Canary deliver</button>
            <button type="button" disabled={busy || !messageId} onClick={() => void run(() => syncPhysicalMessage(deviceId, messageId, "absent"), "Message delete canary di-queue.")} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Canary delete</button>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="text-xs font-bold">Attendance photo ingress</div>
          <div className="mt-2 font-mono text-[10px] text-muted-foreground">ENABLE ATTPHOTO CANARY {serial}</div>
          <button type="button" disabled={busy || !serial} onClick={() => void run(() => enableAttendancePhotoCanary(deviceId, `ENABLE ATTPHOTO CANARY ${serial}`), "Attendance-photo canary dibuka untuk target device." )} className="mt-3 h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Enable one-device canary</button>
          <p className="mt-2 text-[11px] text-muted-foreground">Backend menolak canary bila restricted-media keyring belum siap. Upload disimpan terenkripsi.</p>
        </div>

        <div className="rounded-xl border border-amber-300 bg-amber-50/40 p-4">
          <div className="text-xs font-bold text-amber-950">Firmware package upload</div>
          <div className="mt-1 text-[11px] text-amber-900">Target model dikunci ke model device saat ini: <span className="font-mono">{model || "belum terobservasi"}</span>.</div>
          <input value={firmwareVersion} onChange={(event) => setFirmwareVersion(event.target.value.trim())} placeholder="Target firmware version" className="mt-2 h-9 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm" />
          <input type="file" onChange={(event) => setFirmwareFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-xs" />
          <button type="button" disabled={busy || !model || !firmwareVersion || !firmwareFile} onClick={() => void run(() => uploadFirmwarePackage({ file: firmwareFile!, targetModel: model, targetVersion: firmwareVersion }), "Firmware package tersimpan. Muat ulang panel parity untuk memilih package pada canary upgrade." )} className="mt-3 h-9 rounded-xl bg-amber-900 px-3 text-xs font-semibold text-white disabled:opacity-50">Upload model-bound package</button>
          <p className="mt-2 text-[11px] text-amber-900">Upload package tidak mengirim command device. Upgrade tetap explicit-target dan canary-first pada panel firmware.</p>
        </div>
      </div>
    </section>
  );
}
