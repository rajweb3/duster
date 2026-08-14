import type { TenantMessage } from '@duster/shared';

export class EventBuffer {
  private buffer: Array<{ message: TenantMessage; timestamp: number; size: number }> = [];
  private totalSize = 0;
  private readonly maxEvents: number;
  private readonly maxSizeBytes: number;

  constructor(maxEvents: number, maxSizeBytes: number) {
    this.maxEvents = maxEvents;
    this.maxSizeBytes = maxSizeBytes;
  }

  push(message: TenantMessage): boolean {
    const serialized = JSON.stringify(message);
    const size = Buffer.byteLength(serialized, 'utf8');

    if (this.buffer.length >= this.maxEvents) {
      this.evictOldest();
    }

    while (this.totalSize + size > this.maxSizeBytes && this.buffer.length > 0) {
      this.evictOldest();
    }

    if (size > this.maxSizeBytes) {
      return false;
    }

    this.buffer.push({ message, timestamp: Date.now(), size });
    this.totalSize += size;
    return true;
  }

  drain(): TenantMessage[] {
    const messages = this.buffer.map(item => item.message);
    this.buffer = [];
    this.totalSize = 0;
    return messages;
  }

  get length(): number {
    return this.buffer.length;
  }

  get sizeBytes(): number {
    return this.totalSize;
  }

  private evictOldest(): void {
    const evicted = this.buffer.shift();
    if (evicted) {
      this.totalSize -= evicted.size;
    }
  }
}
