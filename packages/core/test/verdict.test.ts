import { describe, it, expect } from "vitest";
import { parseVerdict } from "../src/verdict.js";

const fenced = (body: string) => `some preamble\n\`\`\`json\n${body}\n\`\`\`\ntrailing`;

describe("parseVerdict", () => {
  it("parses an advance verdict from a fenced block", () => {
    expect(parseVerdict(fenced(`{"status":"advance","reason":"ci green"}`)))
      .toEqual({ status: "advance", reason: "ci green" });
  });
  it("maps submitted evidence pr_number -> prNumber", () => {
    expect(parseVerdict(fenced(`{"status":"submitted","evidence":{"repo":"a/b","pr_number":34,"head":"deadbeef"}}`)))
      .toEqual({ status: "submitted", evidence: { repo: "a/b", prNumber: 34, head: "deadbeef" } });
  });
  it("parses an advisor veto with role+head", () => {
    expect(parseVerdict(fenced(`{"status":"veto","role":"security","head":"abc","reason":"sqli"}`)))
      .toEqual({ status: "veto", role: "security", head: "abc", reason: "sqli" });
  });
  it("parses a question with category", () => {
    expect(parseVerdict(fenced(`{"status":"question","category":"product"}`)))
      .toEqual({ status: "question", category: "product" });
  });
  it("uses the LAST json block when several are present", () => {
    const text = `${fenced(`{"status":"error"}`)}\n${fenced(`{"status":"clean","role":"security","head":"h"}`)}`;
    expect(parseVerdict(text)).toEqual({ status: "clean", role: "security", head: "h" });
  });
  it("returns an error verdict when no fenced json block exists", () => {
    expect(parseVerdict("no block here").status).toBe("error");
  });
  it("returns an error verdict on malformed JSON", () => {
    expect(parseVerdict(fenced("{not json")).status).toBe("error");
  });
  it("returns an error verdict on an unknown status", () => {
    expect(parseVerdict(fenced(`{"status":"frobnicate"}`)).status).toBe("error");
  });
  it("returns an error verdict when submitted is missing evidence", () => {
    expect(parseVerdict(fenced(`{"status":"submitted"}`)).status).toBe("error");
  });
});
