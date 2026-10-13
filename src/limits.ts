import { IncomingMessage } from "http";

// Protection against abuse / denial of service. All limits are per server process.
export const LIMITS = {
  // Largest accepted websocket message in bytes (commands are tiny)
  maxPayloadBytes: 1024,
  maxRoomNameLength: 64,
  maxPinLength: 64,
  maxConnectionsPerIp: 20,
  // New connections per IP and minute
  connectionsPerMinutePerIp: 60,
  // Rooms an IP may create per hour
  roomCreationsPerHourPerIp: 50,
  // Wrong PINs per IP before it is blocked for the window
  failedPinsPerWindow: 5,
  failedPinWindowMs: 15 * 60 * 1000,
  // PIN hashes that may be computed at the same time (each needs ~19 MiB)
  maxConcurrentPinChecks: 8,
  // Commands per second and connection
  messagesPerSecond: 20,
  // Empty rooms are unloaded from memory after this time (they stay in the database)
  emptyRoomTtlMs: 60 * 60 * 1000,
  // Rooms that were not used for this long are deleted from the database
  roomRetentionMs: 24 * 60 * 60 * 1000,
  heartbeatIntervalMs: 30 * 1000,
};

// Fixed-window counter per key
export class RateLimiter {
  private entries: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {
    const cleanup = setInterval(() => {
      const now: number = Date.now();
      for (const [key, entry] of this.entries) {
        if (entry.resetAt <= now) {
          this.entries.delete(key);
        }
      }
    }, Math.max(windowMs, 60 * 1000));
    cleanup.unref();
  }

  // Counts an event, returns false if the limit is exceeded
  hit(key: string): boolean {
    const now: number = Date.now();
    let entry = this.entries.get(key);
    if (entry === undefined || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.entries.set(key, entry);
    }
    entry.count++;
    return entry.count <= this.max;
  }

  // Takes back one counted event
  refund(key: string): void {
    const entry = this.entries.get(key);
    if (entry !== undefined && entry.count > 0) {
      entry.count--;
    }
  }

  // True if the limit is already used up (does not count)
  isLimited(key: string): boolean {
    const entry = this.entries.get(key);
    return (
      entry !== undefined && entry.resetAt > Date.now() && entry.count >= this.max
    );
  }
}

// Counts open connections per key
export class ConnectionCounter {
  private counts: Map<string, number> = new Map();

  constructor(private readonly max: number) {}

  tryAcquire(key: string): boolean {
    const count: number = this.counts.get(key) ?? 0;
    if (count >= this.max) {
      return false;
    }
    this.counts.set(key, count + 1);
    return true;
  }

  release(key: string): void {
    const count: number = (this.counts.get(key) ?? 1) - 1;
    if (count <= 0) {
      this.counts.delete(key);
    } else {
      this.counts.set(key, count);
    }
  }
}

// Set TRUST_PROXY=true when running behind a reverse proxy that sets X-Forwarded-For
const trustProxy: boolean = process.env.TRUST_PROXY === "true";

export function getClientIp(req: IncomingMessage): string {
  if (trustProxy) {
    const forwarded: string | string[] | undefined =
      req.headers["x-forwarded-for"];
    const value: string | undefined = Array.isArray(forwarded)
      ? forwarded[forwarded.length - 1]
      : forwarded;
    if (value) {
      // The last entry is the one added by our own proxy
      const parts: string[] = value.split(",");
      return parts[parts.length - 1].trim();
    }
  }
  return req.socket.remoteAddress ?? "unknown";
}
