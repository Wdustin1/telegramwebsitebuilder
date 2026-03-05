import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../config/env.js", () => ({
  env: {
    BLAND_API_KEY: "test",
    WEBHOOK_BASE_URL: "http://localhost",
  },
}));

vi.mock("../../db/client.js", () => ({
  prisma: {},
}));

vi.mock("./blandClient.js", () => ({
  makeCall: vi.fn(),
}));

import { isBusinessHours, msUntilNextBusinessHour } from "./callProcessor.js";

describe("isBusinessHours", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true during weekday business hours", () => {
    vi.useFakeTimers();
    // Wednesday Jan 7 10am
    vi.setSystemTime(new Date(2026, 0, 7, 10, 0, 0));
    expect(isBusinessHours()).toBe(true);
  });

  it("returns false on weekends", () => {
    vi.useFakeTimers();
    // Saturday Jan 10 10am
    vi.setSystemTime(new Date(2026, 0, 10, 10, 0, 0));
    expect(isBusinessHours()).toBe(false);
  });

  it("returns false before 9am", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 7, 8, 59, 0));
    expect(isBusinessHours()).toBe(false);
  });

  it("returns false at 5pm", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 7, 17, 0, 0));
    expect(isBusinessHours()).toBe(false);
  });

  it("returns true at exactly 9am", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 7, 9, 0, 0));
    expect(isBusinessHours()).toBe(true);
  });
});

describe("msUntilNextBusinessHour", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns time until 9am next day when after 5pm on weekday", () => {
    vi.useFakeTimers();
    // Wednesday Jan 7 6pm
    vi.setSystemTime(new Date(2026, 0, 7, 18, 0, 0));
    const ms = msUntilNextBusinessHour();
    // Should be 15 hours (6pm to 9am next day)
    expect(ms).toBe(15 * 60 * 60 * 1000);
  });

  it("returns time until Monday 9am on Friday after 5pm", () => {
    vi.useFakeTimers();
    // Friday Jan 9 6pm
    vi.setSystemTime(new Date(2026, 0, 9, 18, 0, 0));
    const ms = msUntilNextBusinessHour();
    // Friday 6pm to Monday 9am = 63 hours
    expect(ms).toBe(63 * 60 * 60 * 1000);
  });

  it("returns time until Monday 9am on Saturday", () => {
    vi.useFakeTimers();
    // Saturday Jan 10 10am
    vi.setSystemTime(new Date(2026, 0, 10, 10, 0, 0));
    const ms = msUntilNextBusinessHour();
    // Saturday 10am to Monday 9am = 47 hours
    expect(ms).toBe(47 * 60 * 60 * 1000);
  });
});
