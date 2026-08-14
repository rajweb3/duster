import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { jwtVerify } from 'jose';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'duster-dev-secret-change-in-production');

interface TenantConnection {
  ws: WebSocket;
  tenantId: string;
  connectedAt: number;
  lastHeartbeat: number;
}

const tenantConnections = new Map<string, TenantConnection>();

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

      // Close existing connection for this tenant
      const existing = tenantConnections.get(tenantId);
      if (existing) {
        existing.ws.close(4003, 'Replaced by new connection');
      }

      tenantConnections.set(tenantId, {
        ws,
        tenantId,
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
      });

      console.log(`Tenant connected: ${tenantId}`);

      // Send initial config
      ws.send(JSON.stringify({
        type: 'config.sync.request',
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
        tenantConnections.delete(tenantId);
        console.log(`Tenant disconnected: ${tenantId}`);
      });

      ws.on('error', (err) => {
        console.error(`WebSocket error for ${tenantId}:`, err.message);
        tenantConnections.delete(tenantId);
      });
    } catch {
      ws.close(4002, 'Invalid token');
    }
  });

  // Stale connection cleanup every 60s
  setInterval(() => {
    const now = Date.now();
    const staleThreshold = 90000; // 90 seconds
    for (const [tenantId, conn] of tenantConnections.entries()) {
      if (now - conn.lastHeartbeat > staleThreshold) {
        console.log(`Removing stale connection: ${tenantId}`);
        conn.ws.close(4004, 'Stale connection');
        tenantConnections.delete(tenantId);
      }
    }
  }, 60000);

  server.listen(port, hostname, () => {
    console.log(`> Duster dashboard running at http://${hostname}:${port}`);
    console.log(`> WebSocket server at ws://${hostname}:${port}/ws`);
  });
});

function handleTenantMessage(tenantId: string, msg: any) {
  const conn = tenantConnections.get(tenantId);
  if (!conn) return;

  switch (msg.type) {
    case 'heartbeat':
      conn.lastHeartbeat = Date.now();
      break;
    case 'metrics':
    case 'session.event':
    case 'connector.status':
    case 'skill.status':
    case 'tool.registry':
    case 'memory.stats':
    case 'command.ack':
      // Forward to any dashboard WebSocket clients watching this tenant
      // In production, this would broadcast to connected dashboard users
      break;
    default:
      console.log(`Unknown message type from ${tenantId}: ${msg.type}`);
  }
}

export function sendCommandToTenant(tenantId: string, command: any): boolean {
  const conn = tenantConnections.get(tenantId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  conn.ws.send(JSON.stringify(command));
  return true;
}
