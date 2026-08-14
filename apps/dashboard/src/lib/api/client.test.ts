import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { DashboardApiClient } from './client.js';

let server: Server;
let port: number;
let lastRequest: { method: string; url: string; body: string; headers: Record<string, string> };

function setupServer(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  return new Promise<void>((resolve) => {
    server = createServer(handler);
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
}

describe('DashboardApiClient', () => {
  afterEach(async () => {
    if (server) await new Promise<void>(r => server.close(() => r()));
  });

  it('sends GET with auth header', async () => {
    await setupServer((req, res) => {
      lastRequest = { method: req.method!, url: req.url!, body: '', headers: req.headers as any };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ tenantId: 'test', status: 'healthy' }]));
    });

    const client = new DashboardApiClient({ baseUrl: `http://127.0.0.1:${port}`, token: 'my-token' });
    const result = await client.getTenants();

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(lastRequest.method).toBe('GET');
    expect(lastRequest.url).toBe('/api/tenants');
    expect(lastRequest.headers.authorization).toBe('Bearer my-token');
  });

  it('sends POST with body for commands', async () => {
    await setupServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => body += chunk);
      req.on('end', () => {
        lastRequest = { method: req.method!, url: req.url!, body, headers: req.headers as any };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sent: true, commandId: 'cmd-1' }));
      });
    });

    const client = new DashboardApiClient({ baseUrl: `http://127.0.0.1:${port}`, token: 'tok' });
    const result = await client.sendCommand('tenant-1', 'skill.activate', { skillId: 'slack-triage' });

    expect(result.ok).toBe(true);
    expect(result.data?.sent).toBe(true);
    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.url).toBe('/api/tenants/tenant-1/commands');
    const parsed = JSON.parse(lastRequest.body);
    expect(parsed.action).toBe('skill.activate');
    expect(parsed.payload.skillId).toBe('slack-triage');
  });

  it('handles HTTP errors', async () => {
    await setupServer((_req, res) => {
      res.writeHead(403);
      res.end('Forbidden');
    });

    const client = new DashboardApiClient({ baseUrl: `http://127.0.0.1:${port}`, token: 'bad' });
    const result = await client.getTenants();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toBe('Forbidden');
  });

  it('handles network errors', async () => {
    const client = new DashboardApiClient({ baseUrl: 'http://127.0.0.1:19999', token: 'tok' });
    const result = await client.getTenants();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.error).toBeTruthy();
  });

  it('activateWorkflow sends correct command', async () => {
    await setupServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => body += chunk);
      req.on('end', () => {
        lastRequest = { method: req.method!, url: req.url!, body, headers: req.headers as any };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sent: true, commandId: 'cmd-2' }));
      });
    });

    const client = new DashboardApiClient({ baseUrl: `http://127.0.0.1:${port}`, token: 'tok' });
    await client.activateWorkflow('t1', 'email-assist', { schedule: '0 9 * * *' });

    const parsed = JSON.parse(lastRequest.body);
    expect(parsed.action).toBe('skill.activate');
    expect(parsed.payload.skillId).toBe('email-assist');
    expect(parsed.payload.config.schedule).toBe('0 9 * * *');
  });

  it('restartAgent sends agent.restart command', async () => {
    await setupServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => body += chunk);
      req.on('end', () => {
        lastRequest = { method: req.method!, url: req.url!, body, headers: req.headers as any };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sent: true, commandId: 'cmd-3' }));
      });
    });

    const client = new DashboardApiClient({ baseUrl: `http://127.0.0.1:${port}`, token: 'tok' });
    await client.restartAgent('t1');

    const parsed = JSON.parse(lastRequest.body);
    expect(parsed.action).toBe('agent.restart');
  });

  it('toggleTool sends correct enable/disable', async () => {
    await setupServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => body += chunk);
      req.on('end', () => {
        lastRequest = { method: req.method!, url: req.url!, body, headers: req.headers as any };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sent: true, commandId: 'cmd-4' }));
      });
    });

    const client = new DashboardApiClient({ baseUrl: `http://127.0.0.1:${port}`, token: 'tok' });
    await client.toggleTool('t1', 'web_search', false);

    const parsed = JSON.parse(lastRequest.body);
    expect(parsed.action).toBe('tool.disable');
    expect(parsed.payload.toolName).toBe('web_search');
  });
});
