import { describe, it, expect } from 'vitest';
import { MetricsCollector } from './metrics.js';
import { DEFAULT_CONFIG } from './config.js';
import { StressTestRunner } from './runner.js';

describe('MetricsCollector', () => {
  it('starts with zero samples', () => {
    const collector = new MetricsCollector();
    expect(collector.getSampleCount()).toBe(0);
    expect(collector.getConsecutiveErrors()).toBe(0);
  });

  it('records samples', () => {
    const collector = new MetricsCollector();
    collector.record({
      timestamp: Date.now(),
      latencyMs: 1000,
      success: true,
      tokensUsed: 100,
      memoryMB: 18000,
    });
    expect(collector.getSampleCount()).toBe(1);
  });

  it('tracks consecutive errors', () => {
    const collector = new MetricsCollector();
    collector.record({ timestamp: Date.now(), latencyMs: 100, success: false, tokensUsed: 0, memoryMB: 18000, errorMessage: 'fail' });
    collector.record({ timestamp: Date.now(), latencyMs: 100, success: false, tokensUsed: 0, memoryMB: 18000, errorMessage: 'fail' });
    expect(collector.getConsecutiveErrors()).toBe(2);
  });

  it('resets consecutive errors on success', () => {
    const collector = new MetricsCollector();
    collector.record({ timestamp: Date.now(), latencyMs: 100, success: false, tokensUsed: 0, memoryMB: 18000 });
    collector.record({ timestamp: Date.now(), latencyMs: 100, success: false, tokensUsed: 0, memoryMB: 18000 });
    collector.record({ timestamp: Date.now(), latencyMs: 100, success: true, tokensUsed: 50, memoryMB: 18000 });
    expect(collector.getConsecutiveErrors()).toBe(0);
  });

  it('calculates aggregation correctly', () => {
    const collector = new MetricsCollector();
    for (let i = 0; i < 100; i++) {
      collector.record({
        timestamp: Date.now() + i * 100,
        latencyMs: 500 + i * 10,
        success: i < 95,
        tokensUsed: i < 95 ? 100 : 0,
        memoryMB: 18000 + i,
      });
    }

    const agg = collector.aggregate();
    expect(agg.totalRequests).toBe(100);
    expect(agg.successCount).toBe(95);
    expect(agg.errorCount).toBe(5);
    expect(agg.errorRate).toBe(0.05);
    expect(agg.latencyP50).toBeGreaterThan(0);
    expect(agg.latencyP95).toBeGreaterThan(agg.latencyP50);
    expect(agg.memoryGrowthMB).toBeGreaterThan(0);
    expect(agg.tokensTotal).toBe(9500);
  });

  it('handles empty samples in aggregation', () => {
    const collector = new MetricsCollector();
    const agg = collector.aggregate();
    expect(agg.totalRequests).toBe(0);
    expect(agg.errorRate).toBe(0);
    expect(agg.uptimePercent).toBe(100);
  });

  it('tracks max consecutive errors', () => {
    const collector = new MetricsCollector();
    collector.record({ timestamp: 1, latencyMs: 100, success: false, tokensUsed: 0, memoryMB: 18000 });
    collector.record({ timestamp: 2, latencyMs: 100, success: false, tokensUsed: 0, memoryMB: 18000 });
    collector.record({ timestamp: 3, latencyMs: 100, success: false, tokensUsed: 0, memoryMB: 18000 });
    collector.record({ timestamp: 4, latencyMs: 100, success: true, tokensUsed: 50, memoryMB: 18000 });
    collector.record({ timestamp: 5, latencyMs: 100, success: false, tokensUsed: 0, memoryMB: 18000 });

    const agg = collector.aggregate();
    expect(agg.maxConsecutiveErrors).toBe(3);
    expect(agg.consecutiveErrors).toBe(1);
  });
});

describe('StressTestRunner', () => {
  it('stops immediately when abort is called', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      hermesUrl: 'http://127.0.0.1:19999',
      durationHours: 1,
      requestIntervalMs: 50,
      concurrentSessions: 1,
      reportIntervalMs: 999999,
      thresholds: { ...DEFAULT_CONFIG.thresholds, maxConsecutiveErrors: 3 },
    };

    const runner = new StressTestRunner(config);
    setTimeout(() => runner.stop(), 200);
    const result = await runner.run();

    expect(result.aggregation.totalRequests).toBeGreaterThan(0);
    expect(result.aggregation.durationMs).toBeLessThan(5000);
  });

  it('aborts on max consecutive errors', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      hermesUrl: 'http://127.0.0.1:19999',
      durationHours: 1,
      requestIntervalMs: 10,
      concurrentSessions: 1,
      reportIntervalMs: 999999,
      thresholds: { ...DEFAULT_CONFIG.thresholds, maxConsecutiveErrors: 3 },
    };

    const runner = new StressTestRunner(config);
    const result = await runner.run();

    expect(result.passed).toBe(false);
    expect(result.aggregation.maxConsecutiveErrors).toBeGreaterThanOrEqual(3);
  });

  it('evaluates thresholds correctly', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      hermesUrl: 'http://127.0.0.1:19999',
      durationHours: 0.0001,
      requestIntervalMs: 10,
      concurrentSessions: 1,
      reportIntervalMs: 999999,
      thresholds: {
        maxP95LatencyMs: 1,
        maxErrorRate: 0,
        maxMemoryGrowthMB: 0,
        minUptimePercent: 100,
        maxConsecutiveErrors: 2,
      },
    };

    const runner = new StressTestRunner(config);
    const result = await runner.run();

    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_CONFIG.durationHours).toBe(48);
    expect(DEFAULT_CONFIG.concurrentSessions).toBe(3);
    expect(DEFAULT_CONFIG.thresholds.maxP95LatencyMs).toBe(15000);
    expect(DEFAULT_CONFIG.thresholds.maxErrorRate).toBe(0.05);
    expect(DEFAULT_CONFIG.thresholds.minUptimePercent).toBe(99.5);
  });
});
