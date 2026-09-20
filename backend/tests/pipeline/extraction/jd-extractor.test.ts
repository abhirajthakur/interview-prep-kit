import { describe, expect, it } from "vitest";
import { extractJobDescription } from "../../../src/pipeline/extraction/jd-extractor.js";
import type { JsonLlm } from "../../../src/pipeline/llm/port.js";

const JD = `Senior Backend Engineer
Acme Payments - Remote (EU)

We build invoicing software used by thousands of small businesses, and we are growing our platform team this year. You will own the services behind our billing engine and work closely with product and support.

What you'll do:
- Design and run the services behind our billing engine
- Mentor junior engineers and review their code

Requirements:
- 5+ years of experience with Node.js and TypeScript
- Strong understanding of PostgreSQL and data modelling
- Experience mentoring junior engineers

Nice to have:
- Experience with Kubernetes
- Knowledge of payment regulations such as PSD2`;

const req = (text: string, evidence: string, kind = "technical", priority = "must") => ({
  text,
  kind,
  priority,
  evidence,
});

const stub = (requirements: unknown[], extra: Record<string, unknown> = {}): JsonLlm => ({
  completeJson: async () =>
    ({
      title: "Senior Backend Engineer",
      company: "Acme Payments",
      seniority: "Senior",
      location: "Remote (EU)",
      responsibilities: ["Run billing services", "Mentor junior engineers"],
      requirements,
      ...extra,
    }) as never,
});

describe("extractJobDescription", () => {
  it("drops requirements whose quote is not in the posting, and dedupes", async () => {
    const result = await extractJobDescription(
      stub([
        req(
          "5+ years Node.js and TypeScript",
          "5+ years of experience with Node.js and TypeScript",
        ),
        req(
          "PostgreSQL and data modelling",
          "Strong understanding of PostgreSQL and data modelling",
        ),
        req("Mentoring junior engineers", "Experience mentoring junior engineers", "behavioural"),
        req("GraphQL APIs", "Experience with GraphQL APIs"), // invented
        req(
          "5+ years Node.js and TypeScript",
          "5+ years of experience with Node.js and TypeScript",
        ), // duplicate
      ]),
      JD,
    );

    expect(result.requirements.map((r) => r.text)).toEqual([
      "5+ years Node.js and TypeScript",
      "PostgreSQL and data modelling",
      "Mentoring junior engineers",
    ]);
    expect(result.warnings.join(" ")).toMatch(/1 requirement was discarded/);
    expect(result.thin).toBe(false);
  });

  it("assigns stable ids in order, with must-haves before nice-to-haves", async () => {
    const result = await extractJobDescription(
      stub([
        req("Kubernetes", "Experience with Kubernetes"),
        req("Node.js and TypeScript", "5+ years of experience with Node.js and TypeScript"),
      ]),
      JD,
    );
    expect(result.requirements.map((r) => [r.id, r.priority])).toEqual([
      ["r1", "must"],
      ["r2", "nice"],
    ]);
  });

  it("corrects the model's priority from the heading above the line", async () => {
    const result = await extractJobDescription(
      stub([
        req("Kubernetes", "Experience with Kubernetes", "technical", "must"), // under "Nice to have:"
        req(
          "PostgreSQL",
          "Strong understanding of PostgreSQL and data modelling",
          "technical",
          "nice",
        ), // under "Requirements:"
      ]),
      JD,
    );
    const byText = Object.fromEntries(result.requirements.map((r) => [r.text, r.priority]));
    expect(byText["Kubernetes"]).toBe("nice");
    expect(byText["PostgreSQL"]).toBe("must");
  });

  it("treats a bonus wording on the line itself as nice", async () => {
    const jd = `${JD}\n\nBonus points for Rust experience in production systems.`;
    const result = await extractJobDescription(
      stub([
        req("Rust", "Bonus points for Rust experience in production systems", "technical", "must"),
      ]),
      jd,
    );
    expect(result.requirements[0]?.priority).toBe("nice");
  });

  it("marks a two-line stub as thin and does not pad it", async () => {
    const result = await extractJobDescription(
      stub([req("Node", "Must know Node")]),
      "Backend developer wanted.\nMust know Node.",
    );
    expect(result.thin).toBe(true);
    expect(result.requirements).toHaveLength(1);
    expect(result.warnings.join(" ")).toMatch(/very short/);
  });

  it("returns an empty, honest result when every requirement was invented", async () => {
    const result = await extractJobDescription(
      stub([req("Go", "Experience with Go microservices at scale")]),
      JD,
    );
    expect(result.requirements).toEqual([]);
    expect(result.thin).toBe(true);
  });

  it("does not call the model for an empty posting", async () => {
    let calls = 0;
    const llm: JsonLlm = { completeJson: async () => (calls++, {} as never) };
    const result = await extractJobDescription(llm, "   ");
    expect(calls).toBe(0);
    expect(result.thin).toBe(true);
  });
});
