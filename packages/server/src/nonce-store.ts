import type { NonceStore, StoredNonce } from "./types.js";

// Single-process, single-replica nonce store. Consumed nonces live only in this
// map, so a restart forgets them; within one process, consume() is atomic
// because Node runs it without interleaving. A durable, shared store is the
// most urgent open task (see ISSUES.md); do not run this behind more than one
// replica.
export class InMemoryNonceStore implements NonceStore {
  private readonly entries = new Map<string, StoredNonce>();
  private readonly timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: { sweepMs?: number; now?: () => number } = {}) {
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const sweepMs = options.sweepMs ?? 60_000;
    if (sweepMs > 0) {
      this.timer = setInterval(() => this.sweep(), sweepMs);
      // Do not keep the process alive for the sweep alone.
      this.timer.unref?.();
    }
  }

  private readonly now: () => number;

  async create(record: StoredNonce): Promise<void> {
    this.entries.set(record.nonce, { ...record });
  }

  async get(nonce: string): Promise<StoredNonce | null> {
    return this.entries.get(nonce) ?? null;
  }

  async consume(nonce: string): Promise<boolean> {
    const entry = this.entries.get(nonce);
    if (!entry || entry.used) return false;
    entry.used = true;
    return true;
  }

  private sweep(): void {
    const cutoff = this.now();
    for (const [nonce, entry] of this.entries) {
      if (entry.expires < cutoff) this.entries.delete(nonce);
    }
  }

  // Stop the background sweep. Useful in tests.
  close(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
