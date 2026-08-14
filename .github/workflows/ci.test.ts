import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

const WORKFLOWS_DIR = join(__dirname);

function loadWorkflow(name: string): any {
  const content = readFileSync(join(WORKFLOWS_DIR, name), 'utf-8');
  return parse(content);
}

describe('CI workflow', () => {
  const ci = loadWorkflow('ci.yml');

  it('triggers on push to main and PRs', () => {
    expect(ci.on.push.branches).toContain('main');
    expect(ci.on.pull_request.branches).toContain('main');
  });

  it('has concurrency group to cancel stale runs', () => {
    expect(ci.concurrency.group).toContain('ci-');
    expect(ci.concurrency['cancel-in-progress']).toBe(true);
  });

  it('has lint job', () => {
    expect(ci.jobs.lint).toBeDefined();
    expect(ci.jobs.lint.steps.some((s: any) => s.run?.includes('tsc'))).toBe(true);
  });

  it('has test job', () => {
    expect(ci.jobs.test).toBeDefined();
    expect(ci.jobs.test.steps.some((s: any) => s.run?.includes('vitest'))).toBe(true);
  });

  it('has build job that depends on lint and test', () => {
    expect(ci.jobs.build).toBeDefined();
    expect(ci.jobs.build.needs).toContain('lint');
    expect(ci.jobs.build.needs).toContain('test');
  });

  it('docker build only runs on main', () => {
    expect(ci.jobs.docker.if).toContain("refs/heads/main");
  });

  it('deploy only runs on main', () => {
    expect(ci.jobs['deploy-dashboard'].if).toContain("refs/heads/main");
    expect(ci.jobs['deploy-dashboard'].environment).toBe('production');
  });

  it('terraform plan only runs on PRs', () => {
    expect(ci.jobs.terraform.if).toContain('pull_request');
  });

  it('uses Node 22', () => {
    const nodeSteps = ci.jobs.test.steps.filter((s: any) => s.uses?.includes('setup-node'));
    expect(nodeSteps[0].with['node-version']).toBe(22);
  });

  it('uses OIDC for AWS auth (no long-lived keys)', () => {
    const dockerSteps = ci.jobs.docker.steps;
    const awsStep = dockerSteps.find((s: any) => s.uses?.includes('configure-aws-credentials'));
    expect(awsStep.with['role-to-arn']).toBeDefined();
    expect(awsStep.with['role-to-arn']).toContain('secrets.');
  });

  it('packer validation job exists', () => {
    expect(ci.jobs.packer).toBeDefined();
    expect(ci.jobs.packer.steps.some((s: any) => s.run?.includes('packer validate'))).toBe(true);
  });
});

describe('Packer build workflow', () => {
  const packer = loadWorkflow('packer-build.yml');

  it('is manual dispatch only', () => {
    expect(packer.on.workflow_dispatch).toBeDefined();
    expect(packer.on.push).toBeUndefined();
  });

  it('has region input with defaults', () => {
    expect(packer.on.workflow_dispatch.inputs.region.default).toBe('us-east-1');
  });

  it('has build job with timeout', () => {
    expect(packer.jobs['build-ami']['timeout-minutes']).toBe(45);
  });

  it('extracts AMI ID from build output', () => {
    const steps = packer.jobs['build-ami'].steps;
    const extractStep = steps.find((s: any) => s.id === 'ami');
    expect(extractStep).toBeDefined();
  });
});
