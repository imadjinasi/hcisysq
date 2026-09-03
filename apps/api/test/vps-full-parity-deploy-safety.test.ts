import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const deployUrl = new URL("../../../scripts/deploy-vps.sh", import.meta.url);
const verifyUrl = new URL("../../../scripts/verify-vps.sh", import.meta.url);
const composeUrl = new URL("../../../infra/docker-compose.vps.yml", import.meta.url);

describe("VPS full parity deployment safety", () => {
  it("prefers exact-SHA GHCR application images and never recreates postgres volume", async () => {
    const source = await readFile(deployUrl, "utf8");
    expect(source).toContain("ghcr.io/imadjinasi/hcisysq-api");
    expect(source).toContain("ghcr.io/imadjinasi/hcisysq-web");
    expect(source).toContain(":sha-$sha");
    expect(source).toContain('"${COMPOSE[@]}" pull api web');
    expect(source).toContain("COMPOSE_PARALLEL_LIMIT=1");
    expect(source).not.toContain("docker compose down -v");
    expect(source).not.toMatch(/\bdown\s+-v\b/);
  });

  it("compose accepts immutable runtime images while retaining explicit local build fallback", async () => {
    const source = await readFile(composeUrl, "utf8");
    expect(source).toContain("HCIS_API_IMAGE");
    expect(source).toContain("HCIS_WEB_IMAGE");
    expect(source).toContain("apps/api/Dockerfile");
    expect(source).toContain("apps/web/Dockerfile");
  });

  it("verifier checks full parity without requesting device commands", async () => {
    const source = await readFile(verifyUrl, "utf8");
    expect(source).toContain("physical_parity_table_count");
    expect(source).toContain("userinfo_guard_count");
    expect(source).toContain("biometric_global_collection=OFF");
    expect(source).toContain("verification_device_commands_requested=0");
    expect(source).toContain("COMMAND_COUNT_BEFORE");
    expect(source).toContain("COMMAND_COUNT_AFTER");
    expect(source).not.toMatch(/curl[^\n]+\/physical\//i);
    expect(source).not.toContain("docker compose down -v");
  });
});
