import type { Element } from './elements';

export const QUEUE_MAX = 5;

/** When `incoming` meets `existing` in the queue: combine into `result`, or cancel both if null. */
export interface QueueRule {
  a: Element;
  b: Element;
  result: Element | null;
}

/**
 * Combine / cancel rules, order-insensitive. Magicka's exact list is
 * unverified (see docs/reference/magicka.md); this is a plausible start.
 */
export const QUEUE_RULES: readonly QueueRule[] = [
  // combinations
  { a: 'water', b: 'fire', result: 'steam' },
  { a: 'water', b: 'cold', result: 'ice' },
  { a: 'steam', b: 'cold', result: 'water' },
  { a: 'ice', b: 'fire', result: 'water' },
  // opposites
  { a: 'fire', b: 'cold', result: null },
  { a: 'water', b: 'lightning', result: null },
  { a: 'life', b: 'arcane', result: null },
  { a: 'earth', b: 'lightning', result: null },
  { a: 'shield', b: 'shield', result: null },
];

export function findRule(x: Element, y: Element, rules = QUEUE_RULES): QueueRule | undefined {
  return rules.find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x));
}

export type AddOutcome =
  | { kind: 'queued'; element: Element }
  | { kind: 'combined'; element: Element; with: Element; into: Element; then: AddOutcome }
  | { kind: 'cancelled'; element: Element; with: Element }
  | { kind: 'full'; element: Element };

/**
 * The element queue. Every add is processed: there is no timing window and
 * no hidden cooldown. Rules are checked against the most recent matching
 * element first; only if nothing reacts does the element take a slot.
 */
export class ElementQueue {
  private items: Element[] = [];

  constructor(
    readonly max = QUEUE_MAX,
    private readonly rules: readonly QueueRule[] = QUEUE_RULES,
  ) {}

  get elements(): readonly Element[] {
    return this.items;
  }

  get length(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  add(element: Element): AddOutcome {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const other = this.items[i];
      const rule = findRule(element, other, this.rules);
      if (!rule) continue;
      this.items.splice(i, 1);
      if (rule.result === null) return { kind: 'cancelled', element, with: other };
      // The product re-enters the queue and may react again (steam + cold -> water...).
      return { kind: 'combined', element, with: other, into: rule.result, then: this.add(rule.result) };
    }
    if (this.items.length >= this.max) return { kind: 'full', element };
    this.items.push(element);
    return { kind: 'queued', element };
  }

  clear(): void {
    this.items = [];
  }

  /** Snapshot the queue and empty it (what casting does). */
  take(): Element[] {
    const out = this.items;
    this.items = [];
    return out;
  }
}
