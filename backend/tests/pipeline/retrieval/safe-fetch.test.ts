import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSafeFetcher } from "../../../src/pipeline/retrieval/safe-fetch.js";

let server: Server;
let base = "";
let flakyHits = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    switch (req.url) {
      case "/ok":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<h1>hi</h1>");
        break;
      case "/redirect":
        res.writeHead(302, { location: "/ok" });
        res.end();
        break;
      case "/loop":
        res.writeHead(302, { location: "/loop" });
        res.end();
        break;
      case "/big":
        res.writeHead(200, { "content-type": "text/html" });
        res.end("x".repeat(2_000));
        break;
      case "/json":
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        break;
      case "/flaky":
        if (flakyHits++ === 0) {
          res.writeHead(503);
          res.end();
        } else {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("recovered");
        }
        break;
      default:
        res.writeHead(404);
        res.end("nope");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const fetcher = () =>
  createSafeFetcher({ allowPrivateHosts: true, minHostGapMs: 0, sleep: async () => undefined });

describe("createSafeFetcher", () => {
  it("fetches html", async () => {
    await expect(fetcher()(`${base}/ok`)).resolves.toMatchObject({ ok: true, body: "<h1>hi</h1>" });
  });

  it("follows redirects and reports the final url", async () => {
    await expect(fetcher()(`${base}/redirect`)).resolves.toMatchObject({
      ok: true,
      url: `${base}/ok`,
    });
  });

  it("gives up on redirect loops", async () => {
    await expect(fetcher()(`${base}/loop`)).resolves.toMatchObject({
      ok: false,
      reason: "too_many_redirects",
    });
  });

  it("reports 404 without retrying", async () => {
    await expect(fetcher()(`${base}/missing`)).resolves.toMatchObject({
      ok: false,
      reason: "not_found",
      status: 404,
    });
  });

  it("rejects oversized and unexpected content types", async () => {
    await expect(fetcher()(`${base}/big`, { maxBytes: 1_000 })).resolves.toMatchObject({
      ok: false,
      reason: "too_large",
    });
    await expect(fetcher()(`${base}/json`)).resolves.toMatchObject({
      ok: false,
      reason: "bad_content_type",
    });
  });

  it("retries transient 5xx and recovers", async () => {
    await expect(fetcher()(`${base}/flaky`)).resolves.toMatchObject({
      ok: true,
      body: "recovered",
    });
  });

  it("reports connection failures instead of throwing", async () => {
    await expect(fetcher()("http://127.0.0.1:1/")).resolves.toMatchObject({
      ok: false,
      reason: "network",
    });
  });

  it("blocks loopback addresses unless private hosts are enabled", async () => {
    const strict = createSafeFetcher({ allowPrivateHosts: false, minHostGapMs: 0 });
    await expect(strict(`${base}/ok`)).resolves.toMatchObject({
      ok: false,
      reason: "blocked_host",
    });
  });

  it("truncates instead of failing when asked to", async () => {
    const res = await fetcher()(`${base}/big`, { maxBytes: 1_000, truncate: true });
    expect(res).toMatchObject({ ok: true, truncated: true });
    if (res.ok) expect(res.body).toHaveLength(1_000);
  });
});
