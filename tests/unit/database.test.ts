import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GraphDatabase } from '../../src/db/database';
import type { Node, Edge } from '../../src/types';

// ── helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;
let db: GraphDatabase;

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: `function:${Math.random().toString(36).slice(2)}`,
    kind: 'function',
    name: 'testFn',
    qualifiedName: 'module::testFn',
    filePath: 'src/test.ts',
    language: 'typescript',
    startLine: 1,
    endLine: 10,
    startColumn: 0,
    endColumn: 1,
    isExported: false,
    isAsync: false,
    isStatic: false,
    isAbstract: false,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeEdge(source: string, target: string, kind: Edge['kind'] = 'calls'): Edge {
  return { source, target, kind };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-db-'));
  db = new GraphDatabase(tmpDir);
});

afterEach(() => {
  try { db.close(); } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── upsertNode / getNode ──────────────────────────────────────────────────────

describe('upsertNode() / getNode()', () => {
  it('returns null for unknown id', () => {
    expect(db.getNode('function:nonexistent')).toBeNull();
  });

  it('round-trips a minimal node', () => {
    const node = makeNode({ id: 'function:abc', name: 'myFn' });
    db.upsertNode(node);
    const result = db.getNode('function:abc');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('myFn');
    expect(result!.kind).toBe('function');
  });

  it('round-trips all node fields', () => {
    const node = makeNode({
      id: 'class:xyz',
      kind: 'class',
      name: 'MyClass',
      qualifiedName: 'module::MyClass',
      docstring: 'A test class',
      signature: 'class MyClass extends Base',
      visibility: 'public',
      isExported: true,
      isAsync: false,
      isStatic: true,
      isAbstract: true,
      decorators: ['@Injectable'],
      typeParameters: ['T', 'U'],
    });
    db.upsertNode(node);
    const result = db.getNode('class:xyz')!;
    expect(result.docstring).toBe('A test class');
    expect(result.signature).toBe('class MyClass extends Base');
    expect(result.visibility).toBe('public');
    expect(result.isExported).toBe(true);
    expect(result.isStatic).toBe(true);
    expect(result.isAbstract).toBe(true);
    expect(result.decorators).toEqual(['@Injectable']);
    expect(result.typeParameters).toEqual(['T', 'U']);
  });

  it('upsert replaces existing node', () => {
    const node = makeNode({ id: 'function:abc', name: 'originalName' });
    db.upsertNode(node);
    db.upsertNode({ ...node, name: 'updatedName' });
    expect(db.getNode('function:abc')!.name).toBe('updatedName');
  });

  it('getAllNodes() returns all inserted nodes', () => {
    const a = makeNode({ id: 'function:aaa', name: 'fnA' });
    const b = makeNode({ id: 'function:bbb', name: 'fnB' });
    db.upsertNode(a);
    db.upsertNode(b);
    const all = db.getAllNodes();
    const names = all.map(n => n.name);
    expect(names).toContain('fnA');
    expect(names).toContain('fnB');
  });

  it('getNodesByFile() filters by filePath', () => {
    db.upsertNode(makeNode({ id: 'function:a1', filePath: 'src/auth.ts' }));
    db.upsertNode(makeNode({ id: 'function:b1', filePath: 'src/db.ts' }));
    const results = db.getNodesByFile('src/auth.ts');
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('src/auth.ts');
  });

  it('getNodesByKind() filters by kind', () => {
    db.upsertNode(makeNode({ id: 'function:f1', kind: 'function' }));
    db.upsertNode(makeNode({ id: 'class:c1', kind: 'class' }));
    const fns = db.getNodesByKind('function');
    expect(fns.every(n => n.kind === 'function')).toBe(true);
    const classes = db.getNodesByKind('class');
    expect(classes.every(n => n.kind === 'class')).toBe(true);
  });
});

// ── findNodesByExactName ──────────────────────────────────────────────────────

describe('findNodesByExactName()', () => {
  beforeEach(() => {
    db.upsertNode(makeNode({ id: 'function:f1', name: 'authenticate', kind: 'function' }));
    db.upsertNode(makeNode({ id: 'method:m1', name: 'authenticate', kind: 'method' }));
    db.upsertNode(makeNode({ id: 'class:c1', name: 'AuthService', kind: 'class' }));
  });

  it('finds nodes by exact name', () => {
    const results = db.findNodesByExactName('authenticate');
    expect(results).toHaveLength(2);
  });

  it('returns empty for no match', () => {
    expect(db.findNodesByExactName('nonexistent')).toHaveLength(0);
  });

  it('filters by kind', () => {
    const results = db.findNodesByExactName('authenticate', ['method']);
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('method');
  });

  it('does not match partial names', () => {
    expect(db.findNodesByExactName('auth')).toHaveLength(0);
  });

  it('respects limit', () => {
    const results = db.findNodesByExactName('authenticate', undefined, 1);
    expect(results).toHaveLength(1);
  });
});

// ── searchNodes (FTS5) ────────────────────────────────────────────────────────

describe('searchNodes() FTS5 — injection safety', () => {
  // Note: FTS5 rowid-to-string-id join only works with the pipeline-built fixture.
  // These tests verify the sanitization layer doesn't throw on hostile input.
  it('does not throw for FTS5 injection — OR keyword', () => {
    expect(() => db.searchNodes('OR DROP TABLE nodes', {})).not.toThrow();
  });

  it('does not throw for unclosed quote', () => {
    expect(() => db.searchNodes('"unclosed', {})).not.toThrow();
  });

  it('does not throw for wildcard only', () => {
    expect(() => db.searchNodes('*', {})).not.toThrow();
  });

  it('does not throw for NEAR() operator', () => {
    expect(() => db.searchNodes('NEAR(foo bar)', {})).not.toThrow();
  });

  it('does not throw for AND AND double operator', () => {
    expect(() => db.searchNodes('a AND AND b', {})).not.toThrow();
  });

  it('returns an array for every injected input', () => {
    const injections = ['OR DROP TABLE', '"unclosed', '*', 'NEAR(x y)', 'a AND AND b'];
    for (const input of injections) {
      expect(Array.isArray(db.searchNodes(input, {}))).toBe(true);
    }
  });

  it('returns empty for empty string', () => {
    expect(db.searchNodes('', {})).toHaveLength(0);
  });

  it('returns empty for whitespace only', () => {
    expect(db.searchNodes('   ', {})).toHaveLength(0);
  });
});

// ── searchNodesByName (LIKE) ──────────────────────────────────────────────────

describe('searchNodesByName() LIKE', () => {
  beforeEach(() => {
    db.upsertNode(makeNode({ id: 'function:f1', name: 'validateToken', qualifiedName: 'auth::validateToken' }));
    db.upsertNode(makeNode({ id: 'class:c1', name: 'AuthService', qualifiedName: 'auth::AuthService', kind: 'class' }));
    db.upsertNode(makeNode({ id: 'function:f2', name: 'hashPassword', qualifiedName: 'auth::hashPassword' }));
  });

  it('finds nodes by name substring', () => {
    const results = db.searchNodesByName('validate', {});
    expect(results.some(n => n.name === 'validateToken')).toBe(true);
  });

  it('returns empty for no match', () => {
    expect(db.searchNodesByName('zzz_nonexistent', {})).toHaveLength(0);
  });

  it('filters by kind', () => {
    const results = db.searchNodesByName('Auth', { kinds: ['class'] });
    expect(results.every(n => n.kind === 'class')).toBe(true);
  });

  it('respects limit', () => {
    const results = db.searchNodesByName('auth', { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('is case-insensitive (SQLite LIKE)', () => {
    const results = db.searchNodesByName('AUTHSERVICE', {});
    expect(results.some(n => n.name === 'AuthService')).toBe(true);
  });
});

// ── insertEdge / getAllEdges ───────────────────────────────────────────────────

describe('insertEdge() / getAllEdges()', () => {
  let nodeA: Node;
  let nodeB: Node;

  beforeEach(() => {
    nodeA = makeNode({ id: 'function:aaa', name: 'fnA' });
    nodeB = makeNode({ id: 'function:bbb', name: 'fnB' });
    db.upsertNode(nodeA);
    db.upsertNode(nodeB);
  });

  it('inserts and retrieves a calls edge', () => {
    db.insertEdge(makeEdge('function:aaa', 'function:bbb', 'calls'));
    const edges = db.getAllEdges();
    expect(edges.some(e => e.source === 'function:aaa' && e.target === 'function:bbb')).toBe(true);
  });

  it('stores edge metadata (via getEdgesForNodes)', () => {
    db.insertEdge({ source: 'function:aaa', target: 'function:bbb', kind: 'calls', metadata: { callSite: 'line 5' } });
    const edges = db.getEdgesForNodes(['function:aaa']);
    const found = edges.find(e => e.source === 'function:aaa' && e.metadata != null);
    expect(found?.metadata).toEqual({ callSite: 'line 5' });
  });

  it('stores edge line and column (via getEdgesForNodes)', () => {
    db.insertEdge({ source: 'function:aaa', target: 'function:bbb', kind: 'calls', line: 10, column: 5 });
    const edges = db.getEdgesForNodes(['function:aaa']);
    const found = edges.find(e => e.source === 'function:aaa' && e.line != null);
    expect(found?.line).toBe(10);
    expect(found?.column).toBe(5);
  });
});

// ── getCallers / getCallees ───────────────────────────────────────────────────

describe('getCallers() / getCallees()', () => {
  beforeEach(() => {
    // fnA calls fnB; fnC calls fnB
    ['function:a', 'function:b', 'function:c'].forEach((id, i) =>
      db.upsertNode(makeNode({ id, name: ['fnA', 'fnB', 'fnC'][i] }))
    );
    db.insertEdge(makeEdge('function:a', 'function:b', 'calls'));
    db.insertEdge(makeEdge('function:c', 'function:b', 'calls'));
  });

  it('getCallers() returns nodes that call the target', () => {
    const callers = db.getCallers('function:b');
    const names = callers.map(n => n.name);
    expect(names).toContain('fnA');
    expect(names).toContain('fnC');
  });

  it('getCallees() returns nodes called by the source', () => {
    const callees = db.getCallees('function:a');
    expect(callees.some(n => n.name === 'fnB')).toBe(true);
  });

  it('getCallers() returns empty for a node with no callers', () => {
    expect(db.getCallers('function:a')).toHaveLength(0);
  });

  it('getCallees() returns empty for a node that calls nothing', () => {
    expect(db.getCallees('function:b')).toHaveLength(0);
  });

  it('getCallers() respects limit', () => {
    expect(db.getCallers('function:b', 1)).toHaveLength(1);
  });
});

// ── deleteNodesByFile ─────────────────────────────────────────────────────────

describe('deleteNodesByFile()', () => {
  it('removes all nodes and edges for the file', () => {
    const a = makeNode({ id: 'function:a', filePath: 'src/target.ts' });
    const b = makeNode({ id: 'function:b', filePath: 'src/other.ts' });
    db.upsertNode(a);
    db.upsertNode(b);
    db.insertEdge(makeEdge('function:a', 'function:b'));

    db.deleteNodesByFile('src/target.ts');

    expect(db.getNode('function:a')).toBeNull();
    expect(db.getNode('function:b')).not.toBeNull();
    // Edge with source=function:a should be gone
    expect(db.getAllEdges().some(e => e.source === 'function:a')).toBe(false);
  });

  it('is a no-op for a file with no nodes', () => {
    expect(() => db.deleteNodesByFile('src/nonexistent.ts')).not.toThrow();
  });
});

// ── findDeadCode ──────────────────────────────────────────────────────────────

describe('findDeadCode()', () => {
  it('returns unexported functions with no incoming edges', () => {
    db.upsertNode(makeNode({ id: 'function:dead', name: 'unusedFn', isExported: false }));
    const dead = db.findDeadCode();
    expect(dead.some(n => n.name === 'unusedFn')).toBe(true);
  });

  it('excludes exported nodes', () => {
    db.upsertNode(makeNode({ id: 'function:exported', name: 'exportedFn', isExported: true }));
    const dead = db.findDeadCode();
    expect(dead.some(n => n.name === 'exportedFn')).toBe(false);
  });

  it('excludes nodes that have incoming edges', () => {
    const a = makeNode({ id: 'function:a', name: 'caller' });
    const b = makeNode({ id: 'function:b', name: 'callee', isExported: false });
    db.upsertNode(a);
    db.upsertNode(b);
    db.insertEdge(makeEdge('function:a', 'function:b'));
    const dead = db.findDeadCode();
    expect(dead.some(n => n.name === 'callee')).toBe(false);
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      db.upsertNode(makeNode({ id: `function:dead${i}`, name: `dead${i}`, isExported: false }));
    }
    expect(db.findDeadCode(2)).toHaveLength(2);
  });
});

// ── getNodeMetrics ────────────────────────────────────────────────────────────

describe('getNodeMetrics()', () => {
  it('returns all-zero metrics for isolated node', () => {
    const node = makeNode({ id: 'function:iso' });
    db.upsertNode(node);
    const m = db.getNodeMetrics('function:iso');
    expect(m.incomingEdgeCount).toBe(0);
    expect(m.outgoingEdgeCount).toBe(0);
    expect(m.callCount).toBe(0);
    expect(m.callerCount).toBe(0);
  });

  it('counts incoming and outgoing edges', () => {
    const a = makeNode({ id: 'function:ma' });
    const b = makeNode({ id: 'function:mb' });
    const c = makeNode({ id: 'function:mc' });
    db.upsertNode(a); db.upsertNode(b); db.upsertNode(c);
    db.insertEdge(makeEdge('function:ma', 'function:mb'));
    db.insertEdge(makeEdge('function:mc', 'function:mb'));

    const m = db.getNodeMetrics('function:mb');
    expect(m.incomingEdgeCount).toBe(2);
    expect(m.outgoingEdgeCount).toBe(0);
    expect(m.callerCount).toBe(2);
  });
});

// ── findCircularDependencies ──────────────────────────────────────────────────

describe('findCircularDependencies()', () => {
  it('returns empty for graph with no cycles', () => {
    const a = makeNode({ id: 'function:ca', filePath: 'a.ts' });
    const b = makeNode({ id: 'function:cb', filePath: 'b.ts' });
    db.upsertNode(a); db.upsertNode(b);
    db.insertEdge({ source: 'function:ca', target: 'function:cb', kind: 'imports' });
    expect(db.findCircularDependencies()).toHaveLength(0);
  });

  it('detects a direct A→B→A cycle', () => {
    const a = makeNode({ id: 'function:da', filePath: 'fileA.ts' });
    const b = makeNode({ id: 'function:db', filePath: 'fileB.ts' });
    db.upsertNode(a); db.upsertNode(b);
    db.insertEdge({ source: 'function:da', target: 'function:db', kind: 'imports' });
    db.insertEdge({ source: 'function:db', target: 'function:da', kind: 'imports' });
    const cycles = db.findCircularDependencies();
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('returns empty for an empty database', () => {
    expect(db.findCircularDependencies()).toHaveLength(0);
  });
});
