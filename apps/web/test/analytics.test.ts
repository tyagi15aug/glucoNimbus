import { describe, expect, it } from "vitest";
import { summarizeGlucose } from "@gluconimbus/analytics";

describe("summarizeGlucose", () => {
  it("calculates deterministic descriptive statistics", () => {
    expect(summarizeGlucose([80, 100, 120])).toEqual({
      count: 3,
      average: 100,
      min: 80,
      max: 120,
      standardDeviation: 16.3,
      coefficientOfVariation: 16.3,
    });
  });

  it("returns nullable metrics for an empty or invalid input", () => {
    expect(summarizeGlucose([Number.NaN, Number.POSITIVE_INFINITY])).toEqual({
      count: 0,
      average: null,
      min: null,
      max: null,
      standardDeviation: null,
      coefficientOfVariation: null,
    });
  });
});
