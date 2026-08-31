import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function nginxConfig() {
  return readFile(new URL("../nginx.conf", import.meta.url), "utf8");
}

function locationBlock(config: string, location: string) {
  const marker = `location ${location} {`;
  const start = config.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = config.indexOf("\n  }", start);
  expect(end).toBeGreaterThan(start);
  return config.slice(start, end + 4);
}

describe("production SPA cache policy", () => {
  it("never keeps index.html as a stale application shell", async () => {
    const config = await nginxConfig();
    const index = locationBlock(config, "= /index.html");

    expect(index).toContain('add_header Cache-Control "no-store, no-cache, must-revalidate" always;');
    expect(index).toContain('add_header Pragma "no-cache" always;');
    expect(index).toContain('add_header Expires "0" always;');
  });

  it("keeps content-hashed static assets immutable", async () => {
    const config = await nginxConfig();

    expect(config).toContain('add_header Cache-Control "public, max-age=604800, immutable";');
    expect(config).toContain("try_files $uri $uri/ /index.html;");
  });
});
