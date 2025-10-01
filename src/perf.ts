/**
 * Performance measurement utilities for thread-stack MCP
 */

export interface PerfMeasurement {
  operation: string;
  durationMs: number;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export class PerfMonitor {
  private measurements: PerfMeasurement[] = [];
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  /**
   * Time a synchronous operation
   */
  time<T>(operation: string, fn: () => T, metadata?: Record<string, any>): T {
    if (!this.enabled) return fn();

    const start = performance.now();
    const result = fn();
    const durationMs = performance.now() - start;

    this.record(operation, durationMs, metadata);
    return result;
  }

  /**
   * Time an async operation
   */
  async timeAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    if (!this.enabled) return fn();

    const start = performance.now();
    const result = await fn();
    const durationMs = performance.now() - start;

    this.record(operation, durationMs, metadata);
    return result;
  }

  /**
   * Create a timer that can be stopped manually
   */
  startTimer(operation: string): () => void {
    if (!this.enabled) return () => {};

    const start = performance.now();
    return (metadata?: Record<string, any>) => {
      const durationMs = performance.now() - start;
      this.record(operation, durationMs, metadata);
    };
  }

  /**
   * Record a measurement manually
   */
  record(operation: string, durationMs: number, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    this.measurements.push({
      operation,
      durationMs,
      metadata,
      timestamp: new Date()
    });

    // Also log to stderr for real-time monitoring
    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
    console.error(`[perf] ${operation}: ${durationMs.toFixed(2)}ms${metaStr}`);
  }

  /**
   * Get all measurements
   */
  getMeasurements(): PerfMeasurement[] {
    return [...this.measurements];
  }

  /**
   * Get measurements for a specific operation
   */
  getByOperation(operation: string): PerfMeasurement[] {
    return this.measurements.filter(m => m.operation === operation);
  }

  /**
   * Get summary statistics
   */
  getSummary(operation?: string): Record<string, any> {
    const measurements = operation
      ? this.getByOperation(operation)
      : this.measurements;

    if (measurements.length === 0) {
      return { count: 0 };
    }

    const durations = measurements.map(m => m.durationMs);
    const sum = durations.reduce((a, b) => a + b, 0);
    const sorted = [...durations].sort((a, b) => a - b);

    return {
      count: measurements.length,
      total: sum,
      mean: sum / measurements.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * Clear all measurements
   */
  clear(): void {
    this.measurements = [];
  }

  /**
   * Generate a performance report
   */
  report(): string {
    const operations = [...new Set(this.measurements.map(m => m.operation))];
    const lines: string[] = [
      '=== Performance Report ===',
      `Total measurements: ${this.measurements.length}`,
      ''
    ];

    for (const op of operations) {
      const summary = this.getSummary(op);
      lines.push(`${op}:`);
      lines.push(`  Count: ${summary.count}`);
      lines.push(`  Mean: ${summary.mean.toFixed(2)}ms`);
      lines.push(`  Median: ${summary.median.toFixed(2)}ms`);
      lines.push(`  Min/Max: ${summary.min.toFixed(2)}ms / ${summary.max.toFixed(2)}ms`);
      lines.push(`  P95/P99: ${summary.p95.toFixed(2)}ms / ${summary.p99.toFixed(2)}ms`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export measurements as JSON
   */
  toJSON(): string {
    return JSON.stringify({
      measurements: this.measurements,
      summary: this.getSummary()
    }, null, 2);
  }
}

// Global instance (can be disabled via env var)
export const globalPerf = new PerfMonitor(
  process.env.THREAD_STACK_PERF !== 'false'
);
