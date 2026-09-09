/** Deterministic, display-oriented glucose statistics. These are descriptive
 * measurements only; callers must not turn them into medical advice. */
export interface GlucoseSummary {
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
  standardDeviation: number | null;
  coefficientOfVariation: number | null;
}

function round(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

/**
 * Population standard deviation is intentional: a day's readings are the
 * complete set being described, rather than a sample used to infer a larger
 * population. Invalid values are ignored at this boundary for resilience to
 * partially populated reporting queries.
 */
export function summarizeGlucose(values: readonly number[]): GlucoseSummary {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) {
    return { count: 0, average: null, min: null, max: null, standardDeviation: null, coefficientOfVariation: null };
  }

  const sum = valid.reduce((total, value) => total + value, 0);
  const average = sum / valid.length;
  const variance = valid.reduce((total, value) => total + (value - average) ** 2, 0) / valid.length;
  const standardDeviation = Math.sqrt(variance);

  return {
    count: valid.length,
    average: round(average),
    min: Math.min(...valid),
    max: Math.max(...valid),
    standardDeviation: round(standardDeviation),
    coefficientOfVariation: average === 0 ? null : round((standardDeviation / average) * 100),
  };
}
