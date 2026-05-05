import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import KiroGraph from '../../src/index';
import { openFixture, NODE_IDS } from '../helpers/fixture';

let kg: KiroGraph;

beforeAll(async () => { kg = await openFixture(); });
afterAll(() => kg?.close());

describe('getCallers()', () => {
  it('returns callers of validateToken', async () => {
    const callers = await kg.getCallers(NODE_IDS.validateToken);
    const names = callers.map(n => n.name);
    // DatabasePool and authenticate both call validateToken
    expect(names).toContain('DatabasePool');
    expect(names).toContain('authenticate');
  });

  it('returns exactly 2 callers of validateToken', async () => {
    const callers = await kg.getCallers(NODE_IDS.validateToken);
    expect(callers).toHaveLength(2);
  });

  it('returns empty array for a node with no callers', async () => {
    const callers = await kg.getCallers(NODE_IDS.internalHelper);
    expect(callers).toEqual([]);
  });

  it('returns empty array for unknown nodeId', async () => {
    const callers = await kg.getCallers('function:nonexistent000000000000000');
    expect(callers).toEqual([]);
  });

  it('respects the limit parameter', async () => {
    const callers = await kg.getCallers(NODE_IDS.validateToken, 1);
    expect(callers).toHaveLength(1);
  });
});

describe('getCallees()', () => {
  it('returns callees of createRouter', async () => {
    const callees = await kg.getCallees(NODE_IDS.createRouter);
    const names = callees.map(n => n.name);
    expect(names).toContain('createToken');
    expect(names).toContain('query');
  });

  it('returns exactly 2 callees of createRouter', async () => {
    const callees = await kg.getCallees(NODE_IDS.createRouter);
    expect(callees).toHaveLength(2);
  });

  it('returns empty array for a node with no callees', async () => {
    const callees = await kg.getCallees(NODE_IDS.internalHelper);
    expect(callees).toEqual([]);
  });

  it('returns empty array for unknown nodeId', async () => {
    const callees = await kg.getCallees('function:nonexistent000000000000000');
    expect(callees).toEqual([]);
  });
});

describe('findPath()', () => {
  it('finds a direct 1-hop path from app to createRouter', async () => {
    const path = await kg.findPath(NODE_IDS.app, NODE_IDS.createRouter);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0].name).toBe('app');
    expect(path[path.length - 1].name).toBe('createRouter');
  });

  it('finds a 2-hop path from app to createToken', async () => {
    const path = await kg.findPath(NODE_IDS.app, NODE_IDS.createToken);
    expect(path.length).toBeGreaterThanOrEqual(3);
    expect(path[0].name).toBe('app');
    expect(path[path.length - 1].name).toBe('createToken');
  });

  it('returns empty array for disconnected nodes', async () => {
    // internalHelper has no edges at all
    const path = await kg.findPath(NODE_IDS.app, NODE_IDS.internalHelper);
    expect(path).toEqual([]);
  });

  it('returns single node when start equals end', async () => {
    const path = await kg.findPath(NODE_IDS.AuthService, NODE_IDS.AuthService);
    expect(path).toHaveLength(1);
    expect(path[0].name).toBe('AuthService');
  });

  it('returns empty array for unknown source', async () => {
    const path = await kg.findPath('nonexistent:abc', NODE_IDS.AuthService);
    expect(path).toEqual([]);
  });

  it('returns empty array for unknown target', async () => {
    const path = await kg.findPath(NODE_IDS.AuthService, 'nonexistent:abc');
    expect(path).toEqual([]);
  });
});

describe('getImpactRadius()', () => {
  it('returns nodes impacted by AuthService at depth 1', async () => {
    const impact = await kg.getImpactRadius(NODE_IDS.AuthService, 1);
    expect(impact.length).toBeGreaterThan(0);
  });

  it('returns more nodes at depth 2 than depth 1 for AuthService', async () => {
    const d1 = await kg.getImpactRadius(NODE_IDS.AuthService, 1);
    const d2 = await kg.getImpactRadius(NODE_IDS.AuthService, 2);
    expect(d2.length).toBeGreaterThanOrEqual(d1.length);
  });

  it('returns empty array for an isolated node', async () => {
    const impact = await kg.getImpactRadius(NODE_IDS.internalHelper, 2);
    expect(impact).toEqual([]);
  });
});

describe('findDeadCode()', () => {
  it('returns internalHelper as dead code', () => {
    const dead = kg.findDeadCode();
    expect(dead.map(n => n.name)).toContain('internalHelper');
  });

  it('does not include exported symbols in dead code', () => {
    const dead = kg.findDeadCode();
    const names = dead.map(n => n.name);
    expect(names).not.toContain('AuthService');
    expect(names).not.toContain('formatDate');
    expect(names).not.toContain('createRouter');
  });

  it('respects the limit parameter', () => {
    const dead = kg.findDeadCode(1);
    expect(dead.length).toBeLessThanOrEqual(1);
  });

  it('returns empty array with limit=0', () => {
    expect(kg.findDeadCode(0)).toEqual([]);
  });
});

describe('findHotspots()', () => {
  it('returns nodes sorted by degree descending', () => {
    const hotspots = kg.findHotspots();
    expect(hotspots.length).toBeGreaterThan(0);
    for (let i = 1; i < hotspots.length; i++) {
      expect(hotspots[i - 1].degree).toBeGreaterThanOrEqual(hotspots[i].degree);
    }
  });

  it('top hotspot has degree >= 1', () => {
    const hotspots = kg.findHotspots();
    expect(hotspots[0].degree).toBeGreaterThanOrEqual(1);
  });

  it('respects the limit parameter', () => {
    expect(kg.findHotspots(3)).toHaveLength(3);
  });

  it('includes degree, inDegree, outDegree fields', () => {
    const hotspots = kg.findHotspots(1);
    expect(hotspots[0]).toHaveProperty('degree');
    expect(hotspots[0]).toHaveProperty('inDegree');
    expect(hotspots[0]).toHaveProperty('outDegree');
  });
});

describe('findCircularDependencies()', () => {
  it('returns an array (no throw)', () => {
    const cycles = kg.findCircularDependencies();
    expect(Array.isArray(cycles)).toBe(true);
  });

  it('returns no cycles for the fixture (it has none)', () => {
    const cycles = kg.findCircularDependencies();
    expect(cycles).toHaveLength(0);
  });
});

describe('getTypeHierarchy()', () => {
  it('returns an array for a class node', () => {
    const hierarchy = kg.getTypeHierarchy(NODE_IDS.AuthService);
    expect(Array.isArray(hierarchy)).toBe(true);
  });

  it('returns empty array for unknown node', () => {
    expect(kg.getTypeHierarchy('class:nonexistent')).toEqual([]);
  });
});
