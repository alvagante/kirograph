import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GraphDatabase } from '../../src/db/database';
import { GraphQueryManager } from '../../src/graph/queries';
import type { Node } from '../../src/types';

let tmpDir: string;
let db: GraphDatabase;
let qm: GraphQueryManager;

function makeNode(id: string, name: string, filePath = 'src/a.ts'): Node {
  return {
    id,
    kind: 'function',
    name,
    qualifiedName: name,
    filePath,
    language: 'typescript',
    startLine: 1,
    endLine: 5,
    startColumn: 0,
    endColumn: 0,
    isExported: false,
    isAsync: false,
    isStatic: false,
    isAbstract: false,
    updatedAt: Date.now(),
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-gq-'));
  db = new GraphDatabase(tmpDir);
  qm = new GraphQueryManager(db);
});

afterEach(() => {
  try { db.close(); } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── getContext ─────────────────────────────────────────────────────────────────

describe('getContext()', () => {
  it('throws for completely unknown node', async () => {
    await expect(qm.getContext('function:nonexistent')).rejects.toThrow(/not found/i);
  });

  it('returns node with empty context for isolated node', async () => {
    db.upsertNode(makeNode('function:iso', 'isolatedFn'));
    const ctx = await qm.getContext('function:iso');
    expect(ctx.node.name).toBe('isolatedFn');
    expect(ctx.callers).toHaveLength(0);
    expect(ctx.callees).toHaveLength(0);
  });
});

// ── getCallGraph ───────────────────────────────────────────────────────────────

describe('getCallGraph()', () => {
  beforeEach(() => {
    // A → B → C
    ['function:a', 'function:b', 'function:c'].forEach((id, i) =>
      db.upsertNode(makeNode(id, ['A', 'B', 'C'][i]))
    );
    db.insertEdge({ source: 'function:a', target: 'function:b', kind: 'calls' });
    db.insertEdge({ source: 'function:b', target: 'function:c', kind: 'calls' });
  });

  it('returns nodes and edges in the subgraph', async () => {
    const sub = await qm.getCallGraph('function:a', 3);
    const names = sub.nodes.map(n => n.name);
    expect(names).toContain('A');
    expect(names).toContain('B');
    expect(names).toContain('C');
    expect(sub.edges.length).toBeGreaterThan(0);
    expect(sub.entryPoints).toEqual(['function:a']);
  });

  it('respects depth limit', async () => {
    const sub = await qm.getCallGraph('function:a', 1);
    const names = sub.nodes.map(n => n.name);
    expect(names).toContain('A');
    expect(names).toContain('B');
    expect(names).not.toContain('C');
  });

  it('returns empty for isolated node', async () => {
    db.upsertNode(makeNode('function:iso', 'Iso'));
    const sub = await qm.getCallGraph('function:iso');
    // Only the start node (includeStart=true), no edges
    expect(sub.nodes.some(n => n.name === 'Iso')).toBe(true);
    expect(sub.edges).toHaveLength(0);
  });
});

// ── getTypeHierarchy ───────────────────────────────────────────────────────────

describe('getTypeHierarchy()', () => {
  beforeEach(() => {
    db.upsertNode({ ...makeNode('class:base', 'BaseService'), kind: 'class' });
    db.upsertNode({ ...makeNode('class:child', 'ChildService'), kind: 'class' });
    db.upsertNode({ ...makeNode('interface:iface', 'IService'), kind: 'interface' });
    db.insertEdge({ source: 'class:child', target: 'class:base', kind: 'extends' });
    db.insertEdge({ source: 'class:child', target: 'interface:iface', kind: 'implements' });
  });

  it('direction=up returns base types from child', async () => {
    const nodes = await qm.getTypeHierarchy('class:child', 'up');
    const names = nodes.map(n => n.name);
    expect(names).toContain('BaseService');
    expect(names).toContain('IService');
  });

  it('direction=down returns derived types from base', async () => {
    const nodes = await qm.getTypeHierarchy('class:base', 'down');
    expect(nodes.some(n => n.name === 'ChildService')).toBe(true);
  });

  it('direction=both returns all hierarchy', async () => {
    const nodes = await qm.getTypeHierarchy('class:child', 'both');
    const names = nodes.map(n => n.name);
    expect(names).toContain('BaseService');
    expect(names).toContain('IService');
  });

  it('returns empty for node with no hierarchy edges', async () => {
    db.upsertNode(makeNode('function:fn', 'loneFunc'));
    const nodes = await qm.getTypeHierarchy('function:fn', 'both');
    expect(nodes).toHaveLength(0);
  });
});

// ── getAncestors / getChildren ─────────────────────────────────────────────────

describe('getAncestors() / getChildren()', () => {
  beforeEach(() => {
    db.upsertNode({ ...makeNode('class:parent', 'ParentClass'), kind: 'class' });
    db.upsertNode(makeNode('function:child1', 'childMethod1'));
    db.upsertNode(makeNode('function:child2', 'childMethod2'));
    db.insertEdge({ source: 'class:parent', target: 'function:child1', kind: 'contains' });
    db.insertEdge({ source: 'class:parent', target: 'function:child2', kind: 'contains' });
  });

  it('getChildren() returns direct children', async () => {
    const children = await qm.getChildren('class:parent');
    const names = children.map(n => n.name);
    expect(names).toContain('childMethod1');
    expect(names).toContain('childMethod2');
  });

  it('getAncestors() returns parent containers', async () => {
    const ancestors = await qm.getAncestors('function:child1');
    expect(ancestors.some(n => n.name === 'ParentClass')).toBe(true);
  });

  it('getChildren() returns empty for leaf node', async () => {
    const children = await qm.getChildren('function:child1');
    expect(children).toHaveLength(0);
  });
});

// ── findPath ──────────────────────────────────────────────────────────────────

describe('findPath()', () => {
  beforeEach(() => {
    ['function:a', 'function:b', 'function:c'].forEach((id, i) =>
      db.upsertNode(makeNode(id, ['A', 'B', 'C'][i]))
    );
    db.insertEdge({ source: 'function:a', target: 'function:b', kind: 'calls' });
    db.insertEdge({ source: 'function:b', target: 'function:c', kind: 'calls' });
  });

  it('finds path A→B→C', async () => {
    const nodes = await qm.findPath('function:a', 'function:c');
    const names = nodes.map(n => n.name);
    expect(names[0]).toBe('A');
    expect(names[names.length - 1]).toBe('C');
  });

  it('returns single node for same from/to', async () => {
    const nodes = await qm.findPath('function:a', 'function:a');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('A');
  });

  it('returns empty when no path exists', async () => {
    db.upsertNode(makeNode('function:iso', 'Isolated'));
    const nodes = await qm.findPath('function:a', 'function:iso');
    expect(nodes).toHaveLength(0);
  });
});

// ── getImpactRadius ────────────────────────────────────────────────────────────

describe('getImpactRadius()', () => {
  beforeEach(() => {
    // fanA calls shared; fanB calls shared
    ['function:fanA', 'function:fanB', 'function:shared'].forEach((id, i) =>
      db.upsertNode(makeNode(id, ['FanA', 'FanB', 'Shared'][i]))
    );
    db.insertEdge({ source: 'function:fanA', target: 'function:shared', kind: 'calls' });
    db.insertEdge({ source: 'function:fanB', target: 'function:shared', kind: 'calls' });
  });

  it('returns nodes that depend on the changed node', async () => {
    const impact = await qm.getImpactRadius('function:shared', 1);
    const names = impact.map(n => n.name);
    expect(names).toContain('FanA');
    expect(names).toContain('FanB');
  });

  it('returns empty for a node with no dependents', async () => {
    const impact = await qm.getImpactRadius('function:fanA', 1);
    expect(impact).toHaveLength(0);
  });
});

// ── getFilteredSubgraph ────────────────────────────────────────────────────────

describe('getFilteredSubgraph()', () => {
  beforeEach(() => {
    ['function:a', 'function:b', 'function:c'].forEach((id, i) =>
      db.upsertNode(makeNode(id, ['A', 'B', 'C'][i]))
    );
    db.insertEdge({ source: 'function:a', target: 'function:b', kind: 'calls' });
    db.insertEdge({ source: 'function:b', target: 'function:c', kind: 'calls' });
  });

  it('returns only the specified nodes with no traversal', async () => {
    const sub = await qm.getFilteredSubgraph(['function:a', 'function:b']);
    const names = sub.nodes.map(n => n.name);
    expect(names).toContain('A');
    expect(names).toContain('B');
    expect(names).not.toContain('C');
  });

  it('extends via traversal when opts provided', async () => {
    const sub = await qm.getFilteredSubgraph(['function:a'], {
      direction: 'outgoing',
      edgeKinds: ['calls'],
    });
    const names = sub.nodes.map(n => n.name);
    expect(names).toContain('B');
    expect(names).toContain('C');
  });

  it('returns empty subgraph for empty nodeIds', async () => {
    const sub = await qm.getFilteredSubgraph([]);
    expect(sub.nodes).toHaveLength(0);
    expect(sub.edges).toHaveLength(0);
  });
});

// ── getAffectedTests ───────────────────────────────────────────────────────────

describe('getAffectedTests()', () => {
  beforeEach(() => {
    // src/auth.ts exports a function; tests/auth.test.ts imports it
    db.upsertNode(makeNode('function:auth', 'authenticate', 'src/auth.ts'));
    db.upsertNode(makeNode('constant:testFile', 'authTestEntry', 'tests/auth.test.ts'));
    db.insertEdge({ source: 'constant:testFile', target: 'function:auth', kind: 'imports' });
  });

  it('returns test files that import changed source', () => {
    const affected = qm.getAffectedTests(['src/auth.ts']);
    expect(affected.some(p => p.includes('auth.test.ts'))).toBe(true);
  });

  it('returns empty for unrelated file', () => {
    const affected = qm.getAffectedTests(['src/unrelated.ts']);
    expect(affected).toHaveLength(0);
  });

  it('returns empty for empty input', () => {
    expect(qm.getAffectedTests([])).toHaveLength(0);
  });

  it('recognises a test file as a test file itself', () => {
    const affected = qm.getAffectedTests(['tests/auth.test.ts']);
    // test file input returns itself
    expect(affected.some(p => p.includes('auth.test.ts'))).toBe(true);
  });
});
