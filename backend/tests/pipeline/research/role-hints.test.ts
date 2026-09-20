import { describe, expect, it } from "vitest";
import { roleHints } from "../../../src/pipeline/research/role-hints.js";

describe("roleHints", () => {
  it("returns short stems and drops seniority words", () => {
    expect(roleHints("Senior Backend Engineer")).toEqual(["backen", "engine"]);
    expect(roleHints("Staff Sales Manager")).toEqual(["sales", "manage"]);
  });

  it("returns nothing for an empty title", () => {
    expect(roleHints("")).toEqual([]);
  });
});
