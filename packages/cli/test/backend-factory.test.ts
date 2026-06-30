import { describe, it, expect } from "vitest";
import { GitHubAdaptor } from "@yarradev/adaptor-github";
import { selectBackend } from "../src/backend-factory.js";

describe("selectBackend", () => {
  it("builds a GitHubAdaptor for YD_BACKEND=github with YD_REPO", () => {
    const b = selectBackend({ YD_BACKEND: "github", YD_REPO: "acme/x" });
    expect(b).toBeInstanceOf(GitHubAdaptor);
  });
  it("defaults to github", () => {
    expect(selectBackend({ YD_REPO: "acme/x" })).toBeInstanceOf(GitHubAdaptor);
  });
  it("throws without YD_REPO", () => {
    expect(() => selectBackend({ YD_BACKEND: "github" })).toThrow(/YD_REPO/);
  });
  it("throws on an unknown backend", () => {
    expect(() => selectBackend({ YD_BACKEND: "sqlite" })).toThrow(/unknown YD_BACKEND/);
  });
});
