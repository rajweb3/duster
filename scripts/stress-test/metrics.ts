export interface MetricsSample {
  timestamp: number;
  latencyMs: number;
  success: boolean;
  tokensUsed: number;
  memoryMB: number;
  errorMessage?: string;
}

export interface MetricsAggregation {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  latencyMax: number;
  latencyAvg: number;
  tokensTotal: number;
  tokensPerMinute: number;
  memoryStartMB: number;
  memoryCurrentMB: number;
  memoryGrowthMB: number;
  uptimePercent: number;
  consecutiveErrors: number;
  maxConsecutiveErrors: number;
  durationMs: number;
}

export class MetricsCollector {
  private samples: MetricsSample[] = [];
  private startTime: number;
  private consecutiveErrors = 0;
  private maxConsecutiveErrors = 0;
  private initialMemory: number | null = null;

  constructor() {
    this.startTime = Date.now();
  }

  record(sample: MetricsSample): void {
    this.samples.push(sample);

    if (this.initialMemory === null) {
      this.initialMemory = sample.memoryMB;
    }

    if (!sample.success) {
      this.consecutiveErrors++;
      this.maxConsecutiveErrors = Math.max(this.maxConsecutiveErrors, this.consecutiveErrors);
    } else {
      this.consecutiveErrors = 0;
    }
  }

  aggregate(): MetricsAggregation {
    const now = Date.now();
    const durationMs = now - this.startTime;
    const total = this.samples.length;

    if (total === 0) {
      return {
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        errorRate: 0,
        latencyP50: 0,
        latencyP95: 0,
        latencyP99: 0,
        latencyMax: 0,
        latencyAvg: 0,
        tokensTotal: 0,
        tokensPerMinute: 0,
        memoryStartMB: 0,
        memoryCurrentMB: 0,
        memoryGrowthMB: 0,
        uptimePercent: 100,
        consecutiveErrors: 0,
        maxConsecutiveErrors: 0,
        durationMs,
      };
    }

    const successes = this.samples.filter(s => s.success);
    const errors = this.samples.filter(s => !s.success);
    const latencies = successes.map(s => s.latencyMs).sort((a, b) => a - b);
    const lastSample = this.samples[this.samples.length - 1];

    return {
      totalRequests: total,
      successCount: successes.length,
      errorCount: errors.length,
      errorRate: errors.length / total,
      latencyP50: percentile(latencies, 50),
      latencyP95: percentile(latencies, 95),
      latencyP99: percentile(latencies, 99),
      latencyMax: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
      latencyAvg: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      tokensTotal: successes.reduce((sum, s) => sum + s.tokensUsed, 0),
      tokensPerMinute: successes.reduce((sum, s) => sum + s.tokensUsed, 0) / (durationMs / 60000),
      memoryStartMB: this.initialMemory || 0,
      memoryCurrentMB: lastSample.memoryMB,
      memoryGrowthMB: lastSample.memoryMB - (this.initialMemory || 0),
      uptimePercent: (successes.length / total) * 100,
      consecutiveErrors: this.consecutiveErrors,
      maxConsecutiveErrors: this.maxConsecutiveErrors,
      durationMs,
    };
  }

  getConsecutiveErrors(): number {
    return this.consecutiveErrors;
  }

  getSampleCount(): number {
    return this.samples.length;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}
