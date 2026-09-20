import { describe, expect, it } from "vitest";
import { pickCompanyName } from "../../../src/pipeline/research/company-name.js";
import { searchPublicDiscussion } from "../../../src/pipeline/research/discussion.js";
import type { FetchResult, Fetcher } from "../../../src/pipeline/retrieval/safe-fetch.js";

function fetcherReturning(result: FetchResult) {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => (calls.push(url), result);
  return { fetcher, calls };
}

const json = (body: unknown): FetchResult => ({
  ok: true,
  url: "https://hn.algolia.com/api/v1/search",
  contentType: "application/json",
  body: JSON.stringify(body),
});

describe("searchPublicDiscussion", () => {
  it("keeps only hits that name the company and talk about interviewing", async () => {
    const { fetcher, calls } = fetcherReturning(
      json({
        hits: [
          {
            objectID: "1",
            comment_text:
              "<p>Interviewing at Acme was a take-home, then a <i>system design</i> round.</p>",
          },
          { objectID: "2", comment_text: "General interview tips for anyone." },
          { objectID: "3", comment_text: "Acme raised a new funding round last week." },
          { objectID: "4", title: "Ask HN: Acme interview process?", story_text: null },
          { not: "a hit" },
        ],
      }),
    );
    const result = await searchPublicDiscussion("Acme", fetcher);

    expect(calls[0]).toContain("hn.algolia.com");
    expect(calls[0]).toContain("Acme");
    expect(result.found).toBe(true);
    expect(result.snippets.map((s) => s.url)).toEqual([
      "https://news.ycombinator.com/item?id=1",
      "https://news.ycombinator.com/item?id=4",
    ]);
    expect(result.snippets[0]?.text).toBe(
      "Interviewing at Acme was a take-home, then a system design round.",
    );
  });

  it("reports nothing found when no hit is relevant", async () => {
    const { fetcher } = fetcherReturning(
      json({ hits: [{ objectID: "9", comment_text: "Unrelated interview chat" }] }),
    );
    const result = await searchPublicDiscussion("Acme", fetcher);
    expect(result).toEqual({ found: false, snippets: [], skipped: null });
  });

  it("records a failed search as a skipped source instead of throwing", async () => {
    const { fetcher } = fetcherReturning({
      ok: false,
      url: "u",
      reason: "timeout",
      message: "Timed out after 10000ms",
      status: null,
    });
    const result = await searchPublicDiscussion("Acme", fetcher);
    expect(result.found).toBe(false);
    expect(result.skipped?.reason).toBe("Timed out after 10000ms");
  });

  it("does not search without a usable company name", async () => {
    const { fetcher, calls } = fetcherReturning(json({ hits: [] }));
    await searchPublicDiscussion("  ", fetcher);
    expect(calls).toHaveLength(0);
  });

  it("ignores mentions that only appear inside a URL", async () => {
    const { fetcher } = fetcherReturning(
      json({
        hits: [
          {
            objectID: "5",
            comment_text: "Great post! https://acme.com/blog/the-yc-interview/ was a good read",
          },
        ],
      }),
    );
    expect((await searchPublicDiscussion("Acme", fetcher)).found).toBe(false);
  });

  it("requires the company name to be near the interview mention", async () => {
    const far = `Acme makes invoices. ${"filler words ".repeat(60)}Anyway, my interview went badly at another place.`;
    const { fetcher } = fetcherReturning(json({ hits: [{ objectID: "6", comment_text: far }] }));
    expect((await searchPublicDiscussion("Acme", fetcher)).found).toBe(false);
  });

  it("skips who-is-hiring threads", async () => {
    const { fetcher } = fetcherReturning(
      json({
        hits: [
          {
            objectID: "7",
            story_title: "Ask HN: Who is hiring? (June)",
            comment_text: "I would love to interview at Acme",
          },
        ],
      }),
    );
    expect((await searchPublicDiscussion("Acme", fetcher)).found).toBe(false);
  });

  it("centres the snippet on the relevant sentence", async () => {
    const text = `${"Unrelated intro. ".repeat(40)}My interview at Acme had a take-home task.`;
    const { fetcher } = fetcherReturning(json({ hits: [{ objectID: "8", comment_text: text }] }));
    const result = await searchPublicDiscussion("Acme", fetcher);
    expect(result.snippets[0]?.text).toContain("interview at Acme had a take-home task");
    expect(result.snippets[0]?.text.length).toBeLessThan(650);
  });

  it("ignores user-research interviews that merely mention the company", async () => {
    const { fetcher } = fetcherReturning(
      json({
        hits: [
          {
            objectID: "10",
            comment_text:
              "If I had an interview with user John, and he mentions feature Z, I want Acme events to answer how often he used it.",
          },
        ],
      }),
    );
    expect((await searchPublicDiscussion("Acme", fetcher)).found).toBe(false);
  });

  it("does not repeat the title and does not cut words in half", async () => {
    const body = `${"Some long lead-in about nothing much. ".repeat(12)}I interviewed for a job at Acme and got a take-home task.`;
    const { fetcher } = fetcherReturning(
      json({ hits: [{ objectID: "11", title: "Things we learned", comment_text: body }] }),
    );
    const result = await searchPublicDiscussion("Acme", fetcher);
    const text = result.snippets[0]?.text ?? "";
    expect(text).not.toContain("Things we learned");
    expect(text.startsWith("…")).toBe(true);
    expect(text).toContain("interviewed for a job at Acme");
    expect(text.replace(/^…/, "")).toMatch(/^\S+\s/); // starts on a whole word
  });
});

describe("pickCompanyName", () => {
  it("prefers the name in the posting, then the domain", () => {
    expect(
      pickCompanyName({ fromJd: "Acme Payments", homeTitle: "", url: "https://gitlab.com" }),
    ).toBe("Acme Payments");
    expect(
      pickCompanyName({ fromJd: "", homeTitle: "", url: "https://about.gitlab.com/handbook" }),
    ).toBe("gitlab");
    expect(pickCompanyName({ fromJd: "", homeTitle: "", url: "posthog.com" })).toBe("posthog");
  });

  it("uses the first path segment or page title for local test hosts", () => {
    expect(
      pickCompanyName({ fromJd: "", homeTitle: "Whatever", url: "http://localhost:8099/acme/" }),
    ).toBe("acme");
    expect(
      pickCompanyName({
        fromJd: "",
        homeTitle: "Quiet Co | Chairs",
        url: "http://localhost:8099/",
      }),
    ).toBe("Quiet Co");
  });

  it("returns an empty name for an unparseable URL", () => {
    expect(pickCompanyName({ fromJd: "", homeTitle: "", url: "http://" })).toBe("");
  });
});
