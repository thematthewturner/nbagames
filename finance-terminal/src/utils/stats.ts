/**
 * Statistical utility functions used across analytics panels.
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const squaredDiffs = values.map(v => Math.pow(v - m, 2));
  return Math.sqrt(mean(squaredDiffs));
}

export function zScore(value: number, m: number, sd: number): number {
  if (sd === 0) return 0;
  return (value - m) / sd;
}

/**
 * Simple ordinary least squares linear regression.
 * Returns { slope, intercept, r2 }
 */
export function linearRegression(
  xValues: number[],
  yValues: number[]
): { slope: number; intercept: number; r2: number } {
  const n = xValues.length;
  if (n < 2) return { slope: 0, intercept: yValues[0] ?? 0, r2: 0 };

  const mx = mean(xValues);
  const my = mean(yValues);

  let ssxx = 0;
  let ssxy = 0;
  let ssyy = 0;

  for (let i = 0; i < n; i++) {
    const dx = xValues[i] - mx;
    const dy = yValues[i] - my;
    ssxx += dx * dx;
    ssxy += dx * dy;
    ssyy += dy * dy;
  }

  const slope = ssxx === 0 ? 0 : ssxy / ssxx;
  const intercept = my - slope * mx;
  const r2 = ssyy === 0 ? 0 : (ssxy * ssxy) / (ssxx * ssyy);

  return { slope, intercept, r2 };
}

/**
 * Exponential moving average with given alpha (smoothing factor 0–1).
 * Higher alpha = more weight to recent values.
 */
export function ema(values: number[], alpha: number): number[] {
  if (values.length === 0) return [];
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

/**
 * Rolling window mean over an array.
 */
export function rollingMean(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return mean(slice);
  });
}

/**
 * Rolling window standard deviation.
 */
export function rollingStddev(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return stddev(slice);
  });
}

/**
 * Simple coefficient of variation: stddev / mean.
 * Measures relative variability (income stability).
 */
export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return stddev(values) / Math.abs(m);
}

/**
 * Monte Carlo simulation for projected balance.
 * Samples from historical monthly net cash flows with noise.
 * Returns percentile arrays over numMonths.
 */
export function monteCarlo(
  historicalNets: number[],
  startBalance: number,
  numMonths: number,
  iterations: number = 1000
): { month: number; p10: number; p25: number; p50: number; p75: number; p90: number }[] {
  const m = mean(historicalNets);
  const sd = stddev(historicalNets);

  // Run N simulation paths
  const paths: number[][] = [];
  for (let iter = 0; iter < iterations; iter++) {
    let balance = startBalance;
    const path: number[] = [];
    for (let mo = 0; mo < numMonths; mo++) {
      // Box-Muller transform for normal random sample
      const u1 = Math.random();
      const u2 = Math.random();
      const normal = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
      balance += m + sd * normal;
      path.push(balance);
    }
    paths.push(path);
  }

  // Extract percentiles for each month
  const result = [];
  for (let mo = 0; mo < numMonths; mo++) {
    const vals = paths.map(p => p[mo]).sort((a, b) => a - b);
    result.push({
      month: mo + 1,
      p10: vals[Math.floor(iterations * 0.1)],
      p25: vals[Math.floor(iterations * 0.25)],
      p50: vals[Math.floor(iterations * 0.5)],
      p75: vals[Math.floor(iterations * 0.75)],
      p90: vals[Math.floor(iterations * 0.9)],
    });
  }
  return result;
}

/** Format currency with $ and commas */
export function fmt$(value: number, decimals = 0): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (value < 0 ? '-$' : '$') + formatted;
}

/** Format percentage */
export function fmtPct(value: number, decimals = 1): string {
  return value.toFixed(decimals) + '%';
}

/** Format with + sign for positive */
export function fmtDelta(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return sign + fmt$(value);
}
