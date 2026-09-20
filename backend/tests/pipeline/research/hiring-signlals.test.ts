import { describe, expect, it } from "vitest";
import type { JsonLlm } from "../../../src/pipeline/llm/port.js";
import { extractHiringSignals } from "../../../src/pipeline/research/hiring-signals.js";
import type { CrawledPage } from "../../../src/pipeline/retrieval/crawler.js";

const page = (url: string, kind: CrawledPage["kind"], text: string): CrawledPage => ({
  url,
  kind,
  text,
  title: "",
  description: "",
  links: [],
});

function counting(output: unknown) {
  const state = { calls: 0 };
  const llm: JsonLlm = { completeJson: async () => (state.calls++, output as never) };
  return { llm, state };
}

const modelSaysAll = {
  describes_interview_process: true,
  stages: [
    { name: "Take-home task", description: "A small project." },
    { name: "System design", description: "A design discussion." },
  ],
  take_home: true,
  system_design: true,
  live_coding: true,
  culture_notes: ["Async first"],
};

describe("extractHiringSignals", () => {
  it("skips the model entirely when there is no hiring page", async () => {
    const { llm, state } = counting(modelSaysAll);
    const result = await extractHiringSignals(llm, [page("https://a.test/", "home", "Hello")]);
    expect(state.calls).toBe(0);
    expect(result.found).toBe(false);
  });

  it("keeps a flag only if the source text mentions that kind of step", async () => {
    const { llm } = counting(modelSaysAll);
    const result = await extractHiringSignals(llm, [
      page(
        "https://a.test/hiring",
        "hiring",
        "Our process: a take-home task, then a system design round.",
      ),
    ]);
    expect(result.found).toBe(true);
    expect(result.takeHome).toBe(true);
    expect(result.systemDesign).toBe(true);
    expect(result.liveCoding).toBe(false); // model claimed it, page never mentions it
    expect(result.stages).toHaveLength(2);
    expect(result.sources).toEqual(["https://a.test/hiring"]);
  });

  it("reports nothing found when the page is not about interviewing", async () => {
    const { llm } = counting({ ...modelSaysAll, describes_interview_process: false });
    const result = await extractHiringSignals(llm, [
      page("https://a.test/careers", "hiring", "Open roles: engineer."),
    ]);
    expect(result.found).toBe(false);
    expect(result.stages).toEqual([]);
  });
});
