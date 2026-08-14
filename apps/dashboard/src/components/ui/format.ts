export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export function formatBytes(mb: number): string {
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function formatTokensPerMinute(tpm: number): string {
  if (tpm < 1) return '0';
  if (tpm < 100) return tpm.toFixed(1);
  return Math.round(tpm).toString();
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatTimestamp(ts: number): string {
  if (!ts) return 'Never';
  const date = new Date(ts);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatRelativeTime(ts: number): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  if (diff < 1000) return 'Just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function formatInferenceSpeed(tokS: number): string {
  if (!tokS) return '—';
  return `${tokS.toFixed(1)} tok/s`;
}
