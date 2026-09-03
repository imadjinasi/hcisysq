import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("full WDMS physical route safety", () => {
  it("keeps device-user disable non-destructive and server canary on the existing ingress", async () => {
    const registryRoutes = await source("../src/modules/attendance/adms/physical-parity-registry-user-routes.ts");
    const userProtocol = await source("../src/modules/attendance/adms/physical-parity-user-config-protocol.ts");

    expect(registryRoutes).toContain('"user_enable_disable"');
    expect(registryRoutes).toContain("deletesIdentity: false");
    expect(registryRoutes).toContain("deletesBiometrics: false");
    expect(registryRoutes).toContain("SERVER_CANARY_MUST_PRESERVE_INGRESS");
    expect(registryRoutes).toContain("ADMS_INGRESS_HOST");
    expect(userProtocol).not.toContain("DATA DELETE user Pin=");
  });

  it("keeps biometric physical operations behind the explicit global/device/keyring gate", async () => {
    const routes = await source("../src/modules/attendance/adms/physical-parity-routes.ts");
    expect(routes).toContain("BIOMETRIC_HARDWARE_GATE_CLOSED");
    expect(routes).toContain('config.BIOMETRIC_COLLECTION_ENABLED !== "1"');
    expect(routes).toContain("device.biometricCollectionEnabled");
    expect(routes).toContain("biometricKeyringReadiness(config)");
    expect(routes).toContain("rawTemplateReturned: false");
    expect(routes).toContain("masterCredentialDestroyed: false");
  });

  it("does not add an arbitrary command escape hatch", async () => {
    const routes = await source("../src/modules/attendance/adms/physical-parity-routes.ts");
    const extended = await source("../src/modules/attendance/adms/physical-parity-extended-routes.ts");
    const registry = await source("../src/modules/attendance/adms/physical-parity-registry-user-routes.ts");
    const combined = `${routes}\n${extended}\n${registry}`;

    expect(combined).not.toMatch(/arbitrary[-_ ]command/i);
    expect(combined).not.toMatch(/raw[-_ ]command/i);
    expect(combined).not.toMatch(/wireCommand\s*:\s*(?:body|request\.body)/);
  });
});
