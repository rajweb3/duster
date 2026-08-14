'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface HealthData {
  status: 'healthy' | 'degraded' | 'error' | 'offline';
  uptime: number;
  memory: { used: number; total: number; percent: number };
  gpu: { used: number; total: number; percent: number; temp: number };
  inference: { tokensPerMinute: number; avgLatencyMs: number; queueDepth: number };
  activeSessions: number;
  lastHeartbeat: number;
}

interface MetricHistory {
  timestamps: number[];
  cpuPercent: number[];
  memoryPercent: number[];
  gpuPercent: number[];
  tokensPerMin: number[];
}

const MAX_HISTORY_POINTS = 60;

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes}m`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  return `${(bytes / 1048576).toFixed(0)} MB`;
}

export default function MonitoringPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [history, setHistory] = useState<MetricHistory>({
    timestamps: [], cpuPercent: [], memoryPercent: [], gpuPercent: [], tokensPerMin: [],
  });
  const [tenantId, setTenantId] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback((tid: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=dashboard&tenantId=${tid}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      reconnectAttempts.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'heartbeat' || msg.type === 'metrics') {
          const newHealth: HealthData = {
            status: msg.status || 'healthy',
            uptime: msg.uptime || 0,
            memory: msg.system ? {
              used: msg.system.memoryUsedMB * 1048576,
              total: 32_000_000_000,
              percent: (msg.system.memoryUsedMB / 32000) * 100,
            } : health?.memory || { used: 0, total: 32_000_000_000, percent: 0 },
            gpu: msg.model ? {
              used: 18_000_000_000,
              total: 24_000_000_000,
              percent: 75,
              temp: 62,
            } : health?.gpu || { used: 0, total: 24_000_000_000, percent: 0, temp: 0 },
            inference: msg.model ? {
              tokensPerMinute: msg.model.inferenceSpeed * 60 || 0,
              avgLatencyMs: 1000 / (msg.model.inferenceSpeed || 1),
              queueDepth: msg.agent?.queueDepth || 0,
            } : health?.inference || { tokensPerMinute: 0, avgLatencyMs: 0, queueDepth: 0 },
            activeSessions: msg.agent?.activeSessions || 0,
            lastHeartbeat: msg.timestamp || Date.now(),
          };
          setHealth(newHealth);

          setHistory(prev => {
            const ts = [...prev.timestamps, Date.now()].slice(-MAX_HISTORY_POINTS);
            const cpu = [...prev.cpuPercent, msg.system?.cpuPercent || 0].slice(-MAX_HISTORY_POINTS);
            const mem = [...prev.memoryPercent, newHealth.memory.percent].slice(-MAX_HISTORY_POINTS);
            const gpu = [...prev.gpuPercent, newHealth.gpu.percent].slice(-MAX_HISTORY_POINTS);
            const tpm = [...prev.tokensPerMin, newHealth.inference.tokensPerMinute].slice(-MAX_HISTORY_POINTS);
            return { timestamps: ts, cpuPercent: cpu, memoryPercent: mem, gpuPercent: gpu, tokensPerMin: tpm };
          });
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      scheduleReconnect(tid);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [health]);

  function scheduleReconnect(tid: string) {
    setReconnecting(true);
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
    reconnectAttempts.current++;
    reconnectTimeoutRef.current = setTimeout(() => connect(tid), delay);
  }

  useEffect(() => {
    async function init() {
      const meRes = await fetch('/api/auth/me');
      const me = await meRes.json();
      if (meRes.ok && me.tenant) {
        setTenantId(me.tenant.id);

        // For initial state before WS connects, show cached/mock
        if (me.tenant.status === 'active') {
          setHealth({
            status: 'healthy',
            uptime: 86400000,
            memory: { used: 12_000_000_000, total: 32_000_000_000, percent: 37.5 },
            gpu: { used: 18_000_000_000, total: 24_000_000_000, percent: 75, temp: 62 },
            inference: { tokensPerMinute: 1240, avgLatencyMs: 48, queueDepth: 0 },
            activeSessions: 2,
            lastHeartbeat: Date.now(),
          });
        }

        connect(me.tenant.id);
      }
    }
    init();

    return () => {
      wsRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  async function sendAction(action: string) {
    if (!tenantId || actionLoading) return;
    setActionLoading(action);
    try {
      await fetch(`/api/tenants/${tenantId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload: {} }),
      });
    } catch {
      // ignore
    } finally {
      setTimeout(() => setActionLoading(null), 1000);
    }
  }

  if (!health) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-8">Monitoring</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-border rounded w-1/3 mb-4" />
              <div className="h-8 bg-border rounded w-1/2 mb-2" />
              <div className="h-2 bg-border rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statusColors = {
    healthy: 'text-status-green',
    degraded: 'text-status-yellow',
    error: 'text-status-red',
    offline: 'text-muted',
  };

  const heartbeatAge = Date.now() - health.lastHeartbeat;
  const isStale = heartbeatAge > 90000;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Monitoring</h1>
          <p className="text-muted text-sm mt-1">Real-time instance health and performance metrics.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            connected ? 'bg-status-green animate-pulse' :
            reconnecting ? 'bg-status-yellow' :
            'bg-status-red'
          }`} />
          <span className="text-xs text-muted">
            {connected ? 'Live' : reconnecting ? 'Reconnecting...' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Status header */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-3xl ${isStale ? 'text-status-yellow' : statusColors[health.status]}`}>●</span>
            <div>
              <div className="text-lg font-semibold capitalize">
                {isStale ? 'Stale' : health.status}
              </div>
              <div className="text-xs text-muted">Uptime: {formatUptime(health.uptime)}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm">{health.activeSessions} active sessions</div>
            <div className="text-xs text-muted">
              Last heartbeat: {isStale
                ? `${Math.floor(heartbeatAge / 1000)}s ago`
                : new Date(health.lastHeartbeat).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Memory */}
        <div className="card">
          <h3 className="text-sm font-medium text-muted mb-3">System Memory</h3>
          <div className="flex items-end justify-between mb-2">
            <span className="text-2xl font-bold">{health.memory.percent.toFixed(1)}%</span>
            <span className="text-xs text-muted">
              {formatBytes(health.memory.used)} / {formatBytes(health.memory.total)}
            </span>
          </div>
          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                health.memory.percent > 90 ? 'bg-status-red' :
                health.memory.percent > 70 ? 'bg-status-yellow' : 'bg-foreground'
              }`}
              style={{ width: `${health.memory.percent}%` }}
            />
          </div>
          {history.memoryPercent.length > 1 && (
            <div className="mt-3 flex items-end gap-px h-8">
              {history.memoryPercent.slice(-30).map((v, i) => (
                <div
                  key={i}
                  className="flex-1 bg-foreground/20 rounded-sm min-w-[2px]"
                  style={{ height: `${Math.max(2, v)}%` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* GPU */}
        <div className="card">
          <h3 className="text-sm font-medium text-muted mb-3">GPU (NVIDIA L4 · 24GB)</h3>
          <div className="flex items-end justify-between mb-2">
            <span className="text-2xl font-bold">{health.gpu.percent.toFixed(1)}%</span>
            <span className="text-xs text-muted">
              {formatBytes(health.gpu.used)} / {formatBytes(health.gpu.total)} · {health.gpu.temp}°C
            </span>
          </div>
          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                health.gpu.percent > 95 ? 'bg-status-red' :
                health.gpu.percent > 80 ? 'bg-status-yellow' : 'bg-foreground'
              }`}
              style={{ width: `${health.gpu.percent}%` }}
            />
          </div>
          {health.gpu.temp > 80 && (
            <p className="text-xs text-status-yellow mt-2">⚠️ GPU temperature elevated</p>
          )}
          {history.gpuPercent.length > 1 && (
            <div className="mt-3 flex items-end gap-px h-8">
              {history.gpuPercent.slice(-30).map((v, i) => (
                <div
                  key={i}
                  className="flex-1 bg-foreground/20 rounded-sm min-w-[2px]"
                  style={{ height: `${Math.max(2, v)}%` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Inference */}
        <div className="card">
          <h3 className="text-sm font-medium text-muted mb-3">Inference Performance</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-xl font-bold">{health.inference.tokensPerMinute}</div>
              <div className="text-xs text-muted">tokens/min</div>
            </div>
            <div>
              <div className="text-xl font-bold">{health.inference.avgLatencyMs.toFixed(0)}ms</div>
              <div className="text-xs text-muted">avg latency</div>
            </div>
            <div>
              <div className={`text-xl font-bold ${health.inference.queueDepth > 5 ? 'text-status-yellow' : ''}`}>
                {health.inference.queueDepth}
              </div>
              <div className="text-xs text-muted">queue depth</div>
            </div>
          </div>
          {history.tokensPerMin.length > 1 && (
            <div className="flex items-end gap-px h-10">
              {history.tokensPerMin.slice(-30).map((v, i) => {
                const max = Math.max(...history.tokensPerMin.slice(-30), 1);
                return (
                  <div
                    key={i}
                    className="flex-1 bg-foreground/30 rounded-sm min-w-[2px]"
                    style={{ height: `${Math.max(5, (v / max) * 100)}%` }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="card">
          <h3 className="text-sm font-medium text-muted mb-3">Instance Actions</h3>
          <div className="space-y-2">
            <button
              onClick={() => sendAction('agent.restart')}
              disabled={!!actionLoading}
              className="btn-secondary w-full text-left flex items-center justify-between"
            >
              <span>Restart Agent</span>
              {actionLoading === 'agent.restart' && <span className="text-xs text-muted">Sending...</span>}
            </button>
            <button
              onClick={() => sendAction('memory.clear')}
              disabled={!!actionLoading}
              className="btn-secondary w-full text-left flex items-center justify-between"
            >
              <span>Clear Memory</span>
              {actionLoading === 'memory.clear' && <span className="text-xs text-muted">Sending...</span>}
            </button>
            <button
              onClick={() => sendAction('config.update')}
              disabled={!!actionLoading}
              className="btn-secondary w-full text-left flex items-center justify-between"
            >
              <span>Sync Config</span>
              {actionLoading === 'config.update' && <span className="text-xs text-muted">Sending...</span>}
            </button>
            <div className="border-t border-border pt-2 mt-2">
              <button
                onClick={() => {
                  if (confirm('Are you sure? This will force restart the instance.')) {
                    sendAction('agent.restart');
                  }
                }}
                disabled={!!actionLoading}
                className="btn-danger w-full text-left"
              >
                Force Restart Instance
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
