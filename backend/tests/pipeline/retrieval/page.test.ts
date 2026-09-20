import { describe, expect, it } from "vitest";
import { cleanPage, dedupeKey } from "../../../src/pipeline/retrieval/page.js";

const html = `<html><head><title> Acme  Careers </title><meta name="description" content="Join us"></head>
<body><nav><a href="/login">Login</a></nav>
<main><h1>Careers</h1><p>We build tools.</p><p>Second para</p>
<a href="how-we-hire">Our process</a><a href="../about#team">About</a>
<a href="mailto:x@y.z">mail</a><a href="/files/guide.pdf">pdf</a><a href="how-we-hire">dup</a></main>
<script>alert(1)</script></body></html>`;

describe("cleanPage", () => {
  const page = cleanPage(html, "https://acme.test/careers/");

  it("extracts title, description and readable text without scripts or nav", () => {
    expect(page.title).toBe("Acme Careers");
    expect(page.description).toBe("Join us");
    expect(page.text).toContain("We build tools. Second para");
    expect(page.text).not.toContain("alert");
    expect(page.text).not.toContain("Login");
  });

  it("resolves relative links, drops non-http and file links, and dedupes", () => {
    expect(page.links.map((l) => l.url)).toEqual([
      "https://acme.test/login",
      "https://acme.test/careers/how-we-hire",
      "https://acme.test/about",
    ]);
  });
});

describe("dedupeKey", () => {
  it("ignores hash and trailing slash", () => {
    expect(dedupeKey("https://Acme.test/careers/#x")).toBe(dedupeKey("https://acme.test/careers"));
  });
});
