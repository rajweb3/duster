import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const PACKER_DIR = resolve(import.meta.dirname || __dirname);

describe('Packer AMI Configuration', () => {
  it('packer template exists', () => {
    expect(existsSync(resolve(PACKER_DIR, 'duster-tenant.pkr.hcl'))).toBe(true);
  });

  it('packer template references correct instance type', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'duster-tenant.pkr.hcl'), 'utf-8');
    expect(content).toContain('g6.xlarge');
  });

  it('packer template pulls muse-glimmer model', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'duster-tenant.pkr.hcl'), 'utf-8');
    expect(content).toContain('muse-glimmer');
    expect(content).toContain('ollama pull');
  });

  it('packer template installs Node.js 22', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'duster-tenant.pkr.hcl'), 'utf-8');
    expect(content).toContain('setup_22.x');
  });

  it('packer template enables all required services', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'duster-tenant.pkr.hcl'), 'utf-8');
    expect(content).toContain('systemctl enable ollama');
    expect(content).toContain('systemctl enable hermes-agent');
    expect(content).toContain('systemctl enable duster-sidecar');
  });

  it('packer template uses encrypted EBS', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'duster-tenant.pkr.hcl'), 'utf-8');
    expect(content).toContain('encrypted             = true');
  });

  it('packer template creates /etc/duster directory', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'duster-tenant.pkr.hcl'), 'utf-8');
    expect(content).toContain('mkdir -p /etc/duster');
  });

  it('packer template uses ubuntu base', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'duster-tenant.pkr.hcl'), 'utf-8');
    expect(content).toContain('Ubuntu 22.04');
    expect(content).toContain('ssh_username = "ubuntu"');
  });
});

describe('Systemd Service Files', () => {
  it('ollama.service exists and starts ollama', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'systemd/ollama.service'), 'utf-8');
    expect(content).toContain('ollama serve');
    expect(content).toContain('Restart=always');
  });

  it('hermes-agent.service depends on ollama', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'systemd/hermes-agent.service'), 'utf-8');
    expect(content).toContain('After=ollama.service');
    expect(content).toContain('Requires=ollama.service');
    expect(content).toContain('/usr/local/bin/hermes gateway run');
  });

  it('hermes-agent.service sets API_SERVER_PORT', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'systemd/hermes-agent.service'), 'utf-8');
    expect(content).toContain('API_SERVER_PORT=8080');
    expect(content).toContain('API_SERVER_ENABLED=true');
  });

  it('hermes-agent.service waits for ollama health', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'systemd/hermes-agent.service'), 'utf-8');
    expect(content).toContain('ExecStartPre');
    expect(content).toContain('curl');
    expect(content).toContain('11434');
  });

  it('duster-sidecar.service depends on hermes', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'systemd/duster-sidecar.service'), 'utf-8');
    expect(content).toContain('After=hermes-agent.service');
    expect(content).toContain('Requires=hermes-agent.service');
  });

  it('duster-sidecar.service loads config from /etc/duster', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'systemd/duster-sidecar.service'), 'utf-8');
    expect(content).toContain('EnvironmentFile=/etc/duster/config.env');
  });

  it('duster-sidecar.service waits for hermes health', () => {
    const content = readFileSync(resolve(PACKER_DIR, 'systemd/duster-sidecar.service'), 'utf-8');
    expect(content).toContain('ExecStartPre');
    expect(content).toContain('8080/health');
  });

  it('all services run as correct user', () => {
    const ollama = readFileSync(resolve(PACKER_DIR, 'systemd/ollama.service'), 'utf-8');
    const hermes = readFileSync(resolve(PACKER_DIR, 'systemd/hermes-agent.service'), 'utf-8');
    const sidecar = readFileSync(resolve(PACKER_DIR, 'systemd/duster-sidecar.service'), 'utf-8');
    expect(ollama).toContain('User=root');
    expect(hermes).toContain('User=duster');
    expect(sidecar).toContain('User=duster');
  });

  it('all services have restart policies', () => {
    const files = ['ollama.service', 'hermes-agent.service', 'duster-sidecar.service'];
    for (const file of files) {
      const content = readFileSync(resolve(PACKER_DIR, `systemd/${file}`), 'utf-8');
      expect(content).toContain('Restart=always');
    }
  });
});
