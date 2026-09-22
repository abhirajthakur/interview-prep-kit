import { describe, expect, it } from "vitest";
import { crawlCompany } from "../../../src/pipeline/retrieval/crawler.js";
import type { Fetcher } from "../../../src/pipeline/retrieval/safe-fetch.js";

const html = (title: string, body: string) =>
  `<html><head><title>${title}</title></head><body>${body}</body></html>`;

function fakeFetcher(files: Record<string, string>): Fetcher {
  return async (url) => {
    const body = files[url];
    if (body === undefined)
      return { ok: false, url, reason: "not_found", message: "HTTP 404", status: 404 };
    return { ok: true, url, contentType: "text/html", body };
  };
}

describe("crawlCompany", () => {
  it("finds a hiring process page two levels deep, and records what it skipped", async () => {
    const result = await crawlCompany(
      "https://acme.test",
      fakeFetcher({
        "https://acme.test/robots.txt": "User-agent: *\nDisallow: /careers/private\n",
        "https://acme.test/": html(
          "Acme",
          '<p>Acme builds invoicing software.</p><a href="about">About</a><a href="/careers">Careers</a><a href="/login">Log in</a>',
        ),
        "https://acme.test/careers": html(
          "Careers",
          '<a href="/careers/how-we-hire">Process</a><a href="/careers/private/roles">Roles</a>',
        ),
        "https://acme.test/careers/how-we-hire": html(
          "How we hire",
          "<p>Take-home, then system design.</p>",
        ),
      }),
    );

    expect(result.reachable).toBe(true);
    expect(result.hiringPageFound).toBe(true);
    expect(result.pages.map((p) => p.url)).toContain("https://acme.test/careers/how-we-hire");
    expect(result.pages.map((p) => p.url)).not.toContain("https://acme.test/login");
    expect(result.skipped).toContainEqual({ url: "https://acme.test/about", reason: "HTTP 404" });
    expect(result.skipped.find((s) => s.url.endsWith("/careers/private/roles"))?.reason).toMatch(
      /robots/i,
    );
  });

  it("discovers pages nobody links to through the sitemap", async () => {
    const result = await crawlCompany(
      "https://acme.test/",
      fakeFetcher({
        "https://acme.test/robots.txt":
          "User-agent: *\nDisallow:\nSitemap: https://acme.test/sitemap.xml\n",
        "https://acme.test/sitemap.xml":
          '<?xml version="1.0"?><urlset><url><loc>https://acme.test/handbook/hiring/interviewing</loc></url><url><loc>https://acme.test/blog/2019/party</loc></url></urlset>',
        "https://acme.test/": html("Acme", "<p>Hello.</p>"),
        "https://acme.test/handbook/hiring/interviewing": html(
          "Interviewing",
          "<p>Four rounds.</p>",
        ),
      }),
    );
    expect(result.hiringPageFound).toBe(true);
    expect(result.pages.map((p) => p.url)).toContain(
      "https://acme.test/handbook/hiring/interviewing",
    );
  });

  it("reports honestly when there is no hiring page", async () => {
    const result = await crawlCompany(
      "https://quiet.test",
      fakeFetcher({
        "https://quiet.test/": html("Quiet", '<a href="/about">About us</a>'),
        "https://quiet.test/about": html("About", "<p>We make chairs.</p>"),
      }),
    );
    expect(result.reachable).toBe(true);
    expect(result.hiringPageFound).toBe(false);
    expect(result.pages).toHaveLength(2);
  });

  it("returns unreachable instead of throwing when the homepage fails or the URL is invalid", async () => {
    const down = await crawlCompany("https://down.test", fakeFetcher({}));
    expect(down.reachable).toBe(false);
    expect(down.skipped[0]?.reason).toBe("HTTP 404");

    const invalid = await crawlCompany("http://", fakeFetcher({}));
    expect(invalid.reachable).toBe(false);
    expect(invalid.skipped[0]?.reason).toBe("Not a valid URL");
  });

  it("still finds a hiring page buried deep in a large sitemap", async () => {
    const filler = Array.from(
      { length: 1_200 },
      (_, i) => `<url><loc>https://acme.test/blog/post-${i}</loc></url>`,
    ).join("");
    const result = await crawlCompany(
      "https://acme.test/",
      fakeFetcher({
        "https://acme.test/robots.txt":
          "User-agent: *\nDisallow:\nSitemap: https://acme.test/sitemap.xml\n",
        "https://acme.test/sitemap.xml": `<?xml version="1.0"?><urlset>${filler}<url><loc>https://acme.test/handbook/hiring/interviewing</loc></url></urlset>`,
        "https://acme.test/": html("Acme", "<p>Hello.</p>"),
        "https://acme.test/handbook/hiring/interviewing": html(
          "Interviewing",
          "<p>Four rounds.</p>",
        ),
      }),
    );
    expect(result.pages.map((p) => p.url)).toContain(
      "https://acme.test/handbook/hiring/interviewing",
    );
  });

  it("only follows role-relevant links deeper in once a hiring page is found", async () => {
    const result = await crawlCompany(
      "https://acme.test/",
      fakeFetcher({
        "https://acme.test/": html("Acme", '<a href="/careers">Careers</a>'),
        "https://acme.test/careers": html(
          "Careers",
          '<a href="/careers/engineering-hiring">Eng</a><a href="/careers/sales-hiring">Sales</a>',
        ),
        "https://acme.test/careers/engineering-hiring": html(
          "Engineering hiring",
          "<p>Take-home.</p>",
        ),
        "https://acme.test/careers/sales-hiring": html("Sales hiring", "<p>Quota.</p>"),
      }),
      { roleHints: ["engine"] },
    );
    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain("https://acme.test/careers/engineering-hiring");
    expect(urls).not.toContain("https://acme.test/careers/sales-hiring");
  });

  it("stays inside the company's own path on a local host, even without a trailing slash", async () => {
    const result = await crawlCompany(
      "http://localhost:8099/acme",
      fakeFetcher({
        "http://localhost:8099/acme": html(
          "Acme",
          '<p>Hello.</p><a href="/acme/careers">Careers</a><a href="/other/careers">Other</a>',
        ),
        "http://localhost:8099/acme/careers": html("Careers", "<p>Roles.</p>"),
        "http://localhost:8099/other/careers": html("Other careers", "<p>The wrong company.</p>"),
      }),
    );
    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain("http://localhost:8099/acme/careers");
    expect(urls).not.toContain("http://localhost:8099/other/careers");
  });
});
