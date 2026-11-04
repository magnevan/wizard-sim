import { describe, expect, it } from 'vitest';
import { ElementQueue, findRule, QUEUE_MAX, QUEUE_RULES } from './queue';
import { ELEMENTS, TYPEABLE_ELEMENTS } from './elements';

describe('ElementQueue', () => {
  it('queues elements in order', () => {
    const q = new ElementQueue();
    q.add('fire');
    q.add('earth');
    expect(q.elements).toEqual(['fire', 'earth']);
  });

  it('combines water + fire into steam (either order)', () => {
    const a = new ElementQueue();
    a.add('water');
    expect(a.add('fire')).toMatchObject({ kind: 'combined', into: 'steam' });
    expect(a.elements).toEqual(['steam']);

    const b = new ElementQueue();
    b.add('fire');
    b.add('water');
    expect(b.elements).toEqual(['steam']);
  });

  it('combines water + cold into ice', () => {
    const q = new ElementQueue();
    q.add('cold');
    q.add('water');
    expect(q.elements).toEqual(['ice']);
  });

  it('lets combination products react again (steam + cold -> water)', () => {
    const q = new ElementQueue();
    q.add('water');
    q.add('fire'); // steam
    q.add('cold'); // steam + cold -> water
    expect(q.elements).toEqual(['water']);
  });

  it.each([
    ['fire', 'cold'],
    ['water', 'lightning'],
    ['life', 'arcane'],
    ['earth', 'lightning'],
    ['shield', 'shield'],
  ] as const)('%s and %s cancel', (a, b) => {
    const q = new ElementQueue();
    q.add(a);
    expect(q.add(b)).toMatchObject({ kind: 'cancelled' });
    expect(q.elements).toEqual([]);
  });

  it('cancels only one matching element, the most recent', () => {
    const q = new ElementQueue();
    q.add('fire');
    q.add('earth');
    q.add('fire');
    q.add('cold');
    expect(q.elements).toEqual(['fire', 'earth']);
  });

  it('caps at QUEUE_MAX and reports full instead of dropping silently', () => {
    const q = new ElementQueue();
    for (let i = 0; i < QUEUE_MAX; i++) expect(q.add('earth').kind).toBe('queued');
    expect(q.add('earth')).toEqual({ kind: 'full', element: 'earth' });
    expect(q.length).toBe(QUEUE_MAX);
  });

  it('still reacts when full (a reaction frees a slot)', () => {
    const q = new ElementQueue();
    for (let i = 0; i < QUEUE_MAX; i++) q.add('fire');
    expect(q.add('cold').kind).toBe('cancelled');
    expect(q.length).toBe(QUEUE_MAX - 1);
  });

  it('take() snapshots and clears', () => {
    const q = new ElementQueue();
    q.add('arcane');
    q.add('fire');
    expect(q.take()).toEqual(['arcane', 'fire']);
    expect(q.isEmpty()).toBe(true);
  });

  it('accepts a custom rule table (data-driven)', () => {
    const q = new ElementQueue(5, [{ a: 'earth', b: 'fire', result: 'lightning' }]);
    q.add('earth');
    q.add('fire');
    expect(q.elements).toEqual(['lightning']);
  });
});

describe('rule table', () => {
  it('is order-insensitive', () => {
    expect(findRule('fire', 'water')).toBe(findRule('water', 'fire'));
  });

  it('only references registered elements', () => {
    for (const r of QUEUE_RULES) {
      expect(ELEMENTS[r.a]).toBeDefined();
      expect(ELEMENTS[r.b]).toBeDefined();
      if (r.result) expect(ELEMENTS[r.result]).toBeDefined();
    }
  });

  it('has the eight typeable Magicka elements with unique keys', () => {
    expect(TYPEABLE_ELEMENTS).toHaveLength(8);
    const keys = TYPEABLE_ELEMENTS.map((e) => ELEMENTS[e].key);
    expect(new Set(keys).size).toBe(8);
  });
});
