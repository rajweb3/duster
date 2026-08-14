import type { StressTestConfig, StressThresholds } from './config.js';
import { MetricsCollector, type MetricsAggregation } from './metrics.js';

export interface StressTestResult {
  passed: boolean;
  aggregation: MetricsAggregation;
  failures: string[];
  startTime: number;
  endTime: number;
}

export class StressTestRunner {
  private readonly config: StressTestConfig;
  private readonly metrics: MetricsCollector;
  private running = false;
  private abortController: AbortController | null = null;

  constructor(config: StressTestConfig) {
    this.config = config;
    this.metrics = new MetricsCollector();
  }

  async run(): Promise<StressTestResult> {
    this.running = true;
    this.abortController = new AbortController();
    const startTime = Date.now();
    const endTime = startTime + this.config.durationHours * 3600 * 1000;

    const reportInterval = setInterval(() => {
      this.printProgress();
    }, this.config.reportIntervalMs);

    try {
      while (Date.now() < endTime && this.running) {
        if (this.metrics.getConsecutiveErrors() >= this.config.thresholds.maxConsecutiveErrors) {
          console.error(`[ABORT] ${this.config.thresholds.maxConsecutiveErrors} consecutive errors. Stopping.`);
          break;
        }

        const sessions = Array.from({ length: this.config.concurrentSessions }, () =>
          this.runSession(),
        );
        await Promise.allSettled(sessions);
        await sleep(this.config.requestIntervalMs);
      }
    } finally {
      clearInterval(reportInterval);
      this.running = false;
    }

    const aggregation = this.metrics.aggregate();
    const failures = this.evaluateThresholds(aggregation, this.config.thresholds);

    return {
      passed: failures.length === 0,
      aggregation,
      failures,
      startTime,
      endTime: Date.now(),
    };
  }

  stop(): void {
    this.running = false;
    this.abortController?.abort();
  }

  private async runSession(): Promise<void> {
    const start = Date.now();
    let memoryMB = 0;

    try {
      const healthRes = await fetch(`${this.config.hermesUrl}/system/metrics`);
      if (healthRes.ok) {
        const metrics = await healthRes.json();
        memoryMB = metrics.memoryUsedMB || 0;
      }

      const res = await fetch(`${this.config.hermesUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: generateSyntheticPrompt(),
          maxTokens: this.config.maxTokensPerRequest,
          tools: this.config.toolCallsPerSession > 0,
        }),
        signal: this.abortController?.signal,
      });

      const latencyMs = Date.now() - start;
      const body = await res.json();

      this.metrics.record({
        timestamp: Date.now(),
        latencyMs,
        success: res.ok,
        tokensUsed: body.tokensUsed || 0,
        memoryMB,
        errorMessage: res.ok ? undefined : body.error,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.metrics.record({
        timestamp: Date.now(),
        latencyMs: Date.now() - start,
        success: false,
        tokensUsed: 0,
        memoryMB,
        errorMessage: err.message,
      });
    }
  }

  private evaluateThresholds(agg: MetricsAggregation, thresholds: StressThresholds): string[] {
    const failures: string[] = [];

    if (agg.latencyP95 > thresholds.maxP95LatencyMs) {
      failures.push(`P95 latency ${agg.latencyP95}ms > ${thresholds.maxP95LatencyMs}ms threshold`);
    }
    if (agg.errorRate > thresholds.maxErrorRate) {
      failures.push(`Error rate ${(agg.errorRate * 100).toFixed(1)}% > ${(thresholds.maxErrorRate * 100)}% threshold`);
    }
    if (agg.memoryGrowthMB > thresholds.maxMemoryGrowthMB) {
      failures.push(`Memory growth ${agg.memoryGrowthMB}MB > ${thresholds.maxMemoryGrowthMB}MB threshold`);
    }
    if (agg.uptimePercent < thresholds.minUptimePercent) {
      failures.push(`Uptime ${agg.uptimePercent.toFixed(1)}% < ${thresholds.minUptimePercent}% threshold`);
    }
    if (agg.maxConsecutiveErrors > thresholds.maxConsecutiveErrors) {
      failures.push(`Max consecutive errors ${agg.maxConsecutiveErrors} > ${thresholds.maxConsecutiveErrors} threshold`);
    }

    return failures;
  }

  private printProgress(): void {
    const agg = this.metrics.aggregate();
    const hoursElapsed = (agg.durationMs / 3600000).toFixed(1);
    console.log(`[${hoursElapsed}h] requests=${agg.totalRequests} errors=${agg.errorCount} p95=${agg.latencyP95}ms mem_growth=${agg.memoryGrowthMB.toFixed(0)}MB`);
  }
}

function generateSyntheticPrompt(): string {
  const prompts = [
    'Summarize the latest messages in the #general channel and identify any action items.',
    'Check if there are any urgent support tickets that need immediate attention.',
    'Draft a response to the customer inquiry about pricing for the enterprise plan.',
    'Analyze the team productivity metrics from this week and highlight any trends.',
    'Review the deployment checklist and confirm all items are completed.',
    'Categorize the incoming emails by priority and suggest responses for urgent ones.',
    'Generate a daily digest of all team activities and upcoming deadlines.',
    'Triage the bug reports from the last 24 hours by severity.',
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
