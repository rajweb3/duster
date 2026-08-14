export interface StressTestConfig {
  hermesUrl: string;
  durationHours: number;
  concurrentSessions: number;
  requestIntervalMs: number;
  toolCallsPerSession: number;
  maxTokensPerRequest: number;
  reportIntervalMs: number;
  outputPath: string;
  thresholds: StressThresholds;
}

export interface StressThresholds {
  maxP95LatencyMs: number;
  maxErrorRate: number;
  maxMemoryGrowthMB: number;
  minUptimePercent: number;
  maxConsecutiveErrors: number;
}

export const DEFAULT_CONFIG: StressTestConfig = {
  hermesUrl: process.env.HERMES_URL || 'http://127.0.0.1:8080',
  durationHours: 48,
  concurrentSessions: 3,
  requestIntervalMs: 5000,
  toolCallsPerSession: 5,
  maxTokensPerRequest: 500,
  reportIntervalMs: 300000,
  outputPath: './stress-test-report.json',
  thresholds: {
    maxP95LatencyMs: 15000,
    maxErrorRate: 0.05,
    maxMemoryGrowthMB: 4000,
    minUptimePercent: 99.5,
    maxConsecutiveErrors: 10,
  },
};
