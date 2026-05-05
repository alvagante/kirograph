import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import KiroGraph from '../../src/index';
import { openFixture, NODE_IDS } from '../helpers/fixture';

let kg: KiroGraph;

beforeAll(async () => { kg = await openFixture(); });
afterAll(() => kg?.close());

describe('searchNodes() — exact matches', () => {
  it('finds AuthService by exact name', () => {
    const results = kg.searchNodes('AuthService');
    const names = results.map(r => r.node.name);
    expect(names).toContain('AuthService');
  });

  it('finds exactly one class named AuthService', () => {
    const results = kg.searchNodes('AuthService', 'class');
    expect(results.filter(r => r.node.name === 'AuthService')).toHaveLength(1);
  });

  it('finds DatabasePool by exact name', () => {
    const results = kg.searchNodes('DatabasePool');
    expect(results.map(r => r.node.name)).toContain('DatabasePool');
  });

  it('finds createToken', () => {
    const results = kg.searchNodes('createToken');
    expect(results.map(r => r.node.name)).toContain('createToken');
  });

  it('finds validateToken', () => {
    const results = kg.searchNodes('validateToken');
    expect(results.map(r => r.node.name)).toContain('validateToken');
  });

  it('finds internalHelper', () => {
    const results = kg.searchNodes('internalHelper');
    expect(results.map(r => r.node.name)).toContain('internalHelper');
  });
});

describe('searchNodes() — kind filtering', () => {
  it('finds DatabasePool as class, not as function', () => {
    const asClass    = kg.searchNodes('DatabasePool', 'class');
    const asFunction = kg.searchNodes('DatabasePool', 'function');
    expect(asClass.filter(r => r.node.name === 'DatabasePool')).toHaveLength(1);
    expect(asFunction.filter(r => r.node.name === 'DatabasePool')).toHaveLength(0);
  });

  it('finds only methods when filtering by method kind', () => {
    const results = kg.searchNodes('validate', 'method');
    expect(results.every(r => r.node.kind === 'method')).toBe(true);
  });
});

describe('searchNodes() — limit', () => {
  it('respects limit=1', () => {
    const results = kg.searchNodes('a', undefined, 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('respects limit=3', () => {
    const results = kg.searchNodes('e', undefined, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

describe('searchNodes() — edge cases', () => {
  it('returns empty array for non-existent symbol', () => {
    expect(kg.searchNodes('zzz_nonexistent_xyz_abc')).toEqual([]);
  });

  it('does not throw for empty string', () => {
    expect(() => kg.searchNodes('')).not.toThrow();
    expect(Array.isArray(kg.searchNodes(''))).toBe(true);
  });

  it('does not throw on FTS5 injection — OR keyword', () => {
    expect(() => kg.searchNodes('OR DROP TABLE nodes')).not.toThrow();
  });

  it('does not throw on FTS5 injection — double quotes', () => {
    expect(() => kg.searchNodes('"unclosed')).not.toThrow();
  });

  it('does not throw on FTS5 injection — asterisk', () => {
    expect(() => kg.searchNodes('*')).not.toThrow();
  });

  it('does not throw on FTS5 injection — AND NOT combo', () => {
    expect(() => kg.searchNodes('a AND NOT b')).not.toThrow();
  });

  it('returns a SearchResult shape with node and score', () => {
    const results = kg.searchNodes('AuthService');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('node');
    expect(results[0]).toHaveProperty('score');
    expect(results[0].node).toHaveProperty('id');
    expect(results[0].node).toHaveProperty('kind');
    expect(results[0].node).toHaveProperty('name');
    expect(results[0].node).toHaveProperty('filePath');
  });
});

describe('getNode()', () => {
  it('returns the correct node for a known id', () => {
    const node = kg.getNode(NODE_IDS.AuthService);
    expect(node).not.toBeNull();
    expect(node!.name).toBe('AuthService');
    expect(node!.kind).toBe('class');
    expect(node!.isExported).toBe(true);
    expect(node!.filePath).toContain('auth.ts');
  });

  it('returns null for an unknown id', () => {
    expect(kg.getNode('class:00000000000000000000000000000000')).toBeNull();
  });

  it('returns null for an empty string id', () => {
    expect(kg.getNode('')).toBeNull();
  });
});

describe('getNodeContext()', () => {
  it('returns a context for a known node', () => {
    const ctx = kg.getNodeContext(NODE_IDS.AuthService);
    expect(ctx).not.toBeNull();
    expect(ctx!.node.name).toBe('AuthService');
  });

  it('returns null for an unknown node', () => {
    expect(kg.getNodeContext('nonexistent:abc')).toBeNull();
  });
});

describe('getNodeMetrics()', () => {
  it('returns metrics for a known node', () => {
    const metrics = kg.getNodeMetrics(NODE_IDS.validateToken);
    expect(metrics).toBeDefined();
    expect(typeof metrics.incomingEdgeCount).toBe('number');
    expect(typeof metrics.outgoingEdgeCount).toBe('number');
    expect(metrics.callerCount).toBeGreaterThanOrEqual(0);
  });

  it('validateToken has callers', () => {
    const metrics = kg.getNodeMetrics(NODE_IDS.validateToken);
    // Called by DatabasePool and authenticate
    expect(metrics.callerCount).toBeGreaterThanOrEqual(2);
  });
});

describe('getNodeSource()', () => {
  it('returns source code for a known node', () => {
    const node = kg.getNode(NODE_IDS.createToken);
    expect(node).not.toBeNull();
    const src = kg.getNodeSource(node!);
    expect(src).not.toBeNull();
    expect(src).toContain('createToken');
  });
});
