import { describe, expect, it } from "vitest";
import { rankLinks, siteKey } from "../../../src/pipeline/retrieval/link-scoring.js";
import type { PageLink } from "../../../src/pipeline/retrieval/page.js";

const L = (url: string, text = ""): PageLink => ({ url, text });
const opts = {
  baseUrl: "https://acme.test/",
  exclude: new Set<string>(),
  limit: 5,
  pathPrefix: "",
};

describe("rankLinks", () => {
  it("puts an interview-process page first and drops login pages", () => {
    const urls = rankLinks(
      [
        L("https://acme.test/about"),
        L("https://acme.test/handbook/hiring/interviewing"),
        L("https://acme.test/login"),
        L("https://acme.test/careers"),
      ],
      opts,
    ).map((r) => r.link.url);
    expect(urls[0]).toBe("https://acme.test/handbook/hiring/interviewing");
    expect(urls).toContain("https://acme.test/careers");
    expect(urls).not.toContain("https://acme.test/login");
  });

  it("uses anchor text when the path says nothing", () => {
    const ranked = rankLinks([L("https://acme.test/p/42", "Careers")], opts);
    expect(ranked).toHaveLength(1);
  });

  it("stays on the same site but allows subdomains", () => {
    const urls = rankLinks(
      [L("https://other.test/careers"), L("https://handbook.acme.test/careers")],
      opts,
    ).map((r) => r.link.url);
    expect(urls).toEqual(["https://handbook.acme.test/careers"]);
  });

  it("skips already-visited links and honours the path prefix on local hosts", () => {
    const urls = rankLinks(
      [
        L("http://localhost:8099/acme/careers"),
        L("http://localhost:8099/other/careers"),
        L("http://localhost:8099/acme/jobs"),
      ],
      {
        baseUrl: "http://localhost:8099/acme/",
        exclude: new Set(["http://localhost:8099/acme/jobs"]),
        limit: 5,
        pathPrefix: "/acme/",
      },
    ).map((r) => r.link.url);
    expect(urls).toEqual(["http://localhost:8099/acme/careers"]);
  });
});

describe("siteKey", () => {
  it("groups subdomains and handles two-level TLDs", () => {
    expect(siteKey("handbook.acme.com")).toBe("acme.com");
    expect(siteKey("www.acme.co.uk")).toBe("acme.co.uk");
    expect(siteKey("localhost")).toBe("localhost");
  });
});
