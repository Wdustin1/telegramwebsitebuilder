import { describe, it, expect } from "vitest";
import { getEmailSequence } from "./emailTemplates.js";

describe("getEmailSequence", () => {
  const ctx = {
    businessName: "Joe's Plumbing",
    niche: "Plumber",
    city: "Austin",
    websiteUrl: "https://joes-plumbing.vercel.app",
    unsubscribeUrl: "https://example.com/unsubscribe?email=joe@test.com",
  };

  it("returns 3 emails", () => {
    const sequence = getEmailSequence(ctx);
    expect(sequence).toHaveLength(3);
  });

  it("has correct sequence numbers", () => {
    const sequence = getEmailSequence(ctx);
    expect(sequence.map((s) => s.sequenceNumber)).toEqual([1, 2, 3]);
  });

  it("includes business name in subjects", () => {
    const sequence = getEmailSequence(ctx);
    for (const email of sequence) {
      expect(email.subject).toContain("Joe's Plumbing");
    }
  });

  it("includes website URL in all bodies", () => {
    const sequence = getEmailSequence(ctx);
    for (const email of sequence) {
      expect(email.body).toContain("https://joes-plumbing.vercel.app");
    }
  });

  it("includes unsubscribe link in all bodies", () => {
    const sequence = getEmailSequence(ctx);
    for (const email of sequence) {
      expect(email.body).toContain("unsubscribe");
      expect(email.body).toContain(ctx.unsubscribeUrl);
    }
  });

  it("first email has no delay", () => {
    const sequence = getEmailSequence(ctx);
    expect(sequence[0].delay).toBe(0);
  });

  it("second email has 3-day delay", () => {
    const sequence = getEmailSequence(ctx);
    expect(sequence[1].delay).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it("third email has 7-day delay", () => {
    const sequence = getEmailSequence(ctx);
    expect(sequence[2].delay).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
