import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { jwtVerify } from 'jose';
import {
  registerTenantConnection,
  removeTenantConnection,
  updateTenantHeartbeat,
  getStaleConnections,
} from './src/lib/ws/bridge.js';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET environment variable is required in production.');
  process.exit(1);
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'duster-dev-secret-change-in-production');

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true);
    await handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET, {
        issuer: 'duster',
        audience: 'duster-ws',
      });

      const tenantId = payload.tenantId as string;
      if (!tenantId) {
        ws.close(4002, 'Invalid token');
        return;
      }

      registerTenantConnection(tenantId, ws);
      console.log(`Tenant connected: ${tenantId}`);

      ws.send(JSON.stringify({
        type: 'config.sync.request',
        tenantId,
        timestamp: Date.now(),
      }));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          handleTenantMessage(tenantId, msg);
        } catch {
          // Invalid JSON, ignore
        }
      });

      ws.on('close', () => {
        removeTenantConnection(tenantId);
        console.log(`Tenant disconnected: ${tenantId}`);
      });

      ws.on('error', (err) => {
        console.error(`WebSocket error for ${tenantId}:`, err.message);
        removeTenantConnection(tenantId);
      });
    } catch {
      ws.close(4002, 'Invalid token');
    }
  });

  // Stale connection cleanup every 60s
  setInterval(() => {
    const stale = getStaleConnections(90000);
    for (const conn of stale) {
      console.log(`Removing stale connection: ${conn.tenantId}`);
      conn.ws.close(4004, 'Stale connection');
      removeTenantConnection(conn.tenantId);
    }
  }, 60000);

  server.listen(port, hostname, () => {
    console.log(`> Duster dashboard running at http://${hostname}:${port}`);
    console.log(`> WebSocket server at ws://${hostname}:${port}/ws`);
  });
});

function handleTenantMessage(tenantId: string, msg: any) {
  switch (msg.type) {
    case 'heartbeat':
      updateTenantHeartbeat(tenantId);
      break;
    case 'metrics':
    case 'session.event':
    case 'connector.status':
    case 'skill.status':
    case 'tool.registry':
    case 'memory.stats':
    case 'command.ack':
    case 'config.sync.response':
      break;
    default:
      break;
  }
}

export { sendCommandToTenant } from './src/lib/ws/bridge.js';
