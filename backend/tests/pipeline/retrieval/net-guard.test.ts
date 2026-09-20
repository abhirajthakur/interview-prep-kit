import { describe, expect, it } from "vitest";
import {
  checkUrl,
  isPrivateAddress,
  withScheme,
} from "../../../src/pipeline/retrieval/net-guard.js";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("checkUrl", () => {
  it.each([
    "http://127.0.0.1:8080/",
    "http://localhost/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/",
  ])("blocks %s by default", async (url) => {
    await expect(checkUrl(url, false)).resolves.toMatchObject({
      ok: false,
      reason: "blocked_host",
    });
  });

  it("rejects bad schemes, garbage and embedded credentials", async () => {
    await expect(checkUrl("ftp://example.com", false)).resolves.toMatchObject({
      ok: false,
      reason: "invalid_url",
    });
    await expect(checkUrl("not a url", false)).resolves.toMatchObject({
      ok: false,
      reason: "invalid_url",
    });
    await expect(checkUrl("http://user:pw@93.184.216.34/", false)).resolves.toMatchObject({
      ok: false,
      reason: "invalid_url",
    });
  });

  it("allows public IPs, and private hosts only when explicitly enabled", async () => {
    await expect(checkUrl("http://93.184.216.34/", false)).resolves.toMatchObject({ ok: true });
    await expect(checkUrl("http://localhost:8099/acme/", true)).resolves.toMatchObject({
      ok: true,
    });
  });
});

describe("withScheme", () => {
  it("adds https only when there is no scheme", () => {
    expect(withScheme("acme.com")).toBe("https://acme.com");
    expect(withScheme(" http://localhost:8099/acme/ ")).toBe("http://localhost:8099/acme/");
  });
});
