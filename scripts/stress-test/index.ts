import { writeFileSync } from 'fs';
import { DEFAULT_CONFIG, type StressTestConfig } from './config.js';
import { StressTestRunner } from './runner.js';

async function main() {
  const config: StressTestConfig = {
    ...DEFAULT_CONFIG,
    hermesUrl: process.env.HERMES_URL || DEFAULT_CONFIG.hermesUrl,
    durationHours: parseInt(process.env.DURATION_HOURS || '48', 10),
    outputPath: process.env.OUTPUT_PATH || DEFAULT_CONFIG.outputPath,
  };

  console.log('=== Duster Hermes Stress Test ===');
  console.log(`Target: ${config.hermesUrl}`);
  console.log(`Duration: ${config.durationHours} hours`);
  console.log(`Concurrent sessions: ${config.concurrentSessions}`);
  console.log(`Request interval: ${config.requestIntervalMs}ms`);
  console.log('');

  const runner = new StressTestRunner(config);

  process.on('SIGINT', () => {
    console.log('\n[SIGINT] Stopping gracefully...');
    runner.stop();
  });

  process.on('SIGTERM', () => {
    console.log('\n[SIGTERM] Stopping gracefully...');
    runner.stop();
  });

  const result = await runner.run();

  console.log('\n=== RESULTS ===');
  console.log(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`Duration: ${((result.endTime - result.startTime) / 3600000).toFixed(1)} hours`);
  console.log(`Total requests: ${result.aggregation.totalRequests}`);
  console.log(`Success rate: ${((1 - result.aggregation.errorRate) * 100).toFixed(1)}%`);
  console.log(`P95 latency: ${result.aggregation.latencyP95}ms`);
  console.log(`Memory growth: ${result.aggregation.memoryGrowthMB.toFixed(0)}MB`);
  console.log(`Tokens/min: ${result.aggregation.tokensPerMinute.toFixed(0)}`);

  if (result.failures.length > 0) {
    console.log('\nFailures:');
    for (const f of result.failures) {
      console.log(`  - ${f}`);
    }
  }

  writeFileSync(config.outputPath, JSON.stringify(result, null, 2));
  console.log(`\nReport written to: ${config.outputPath}`);

  process.exit(result.passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
