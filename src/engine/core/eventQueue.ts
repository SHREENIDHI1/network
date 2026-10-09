/**
 * Min-heap priority queue for discrete events, ordered by time then by
 * insertion sequence so simultaneous events run in FIFO order
 * (deterministic runs, reproducible tests).
 */

export interface QueuedEvent<T> {
  time: number;
  seq: number;
  data: T;
}

export class EventQueue<T> {
  private heap: QueuedEvent<T>[] = [];
  private seq = 0;

  get size(): number {
    return this.heap.length;
  }

  push(time: number, data: T): void {
    const e = { time, seq: this.seq++, data };
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(h[p], h[i])) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }

  peek(): QueuedEvent<T> | undefined {
    return this.heap[0];
  }

  pop(): QueuedEvent<T> | undefined {
    const h = this.heap;
    if (!h.length) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && this.less(h[l], h[m])) m = l;
        if (r < h.length && this.less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }

  /** Read-only view, sorted, for the event list UI. */
  list(): QueuedEvent<T>[] {
    return [...this.heap].sort((a, b) => (a.time - b.time) || (a.seq - b.seq));
  }

  clear(): void {
    this.heap = [];
  }

  private less(a: QueuedEvent<T>, b: QueuedEvent<T>): boolean {
    return a.time < b.time || (a.time === b.time && a.seq < b.seq);
  }
}
