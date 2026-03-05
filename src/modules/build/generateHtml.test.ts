import { describe, it, expect, vi } from "vitest";

vi.mock("../../config/env.js", () => ({
  env: {
    OPENAI_API_KEY: "test",
  },
}));

vi.mock("openai", () => ({
  default: class {
    constructor() {}
  },
}));

import { escapeHtml } from "./generateHtml.js";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("A & B")).toBe("A &amp; B");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
    );
  });

  it("escapes quotes", () => {
    expect(escapeHtml('He said "hello"')).toBe("He said &quot;hello&quot;");
  });

  it("handles normal text unchanged", () => {
    expect(escapeHtml("Joe's Plumbing")).toBe("Joe&#39;s Plumbing");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
