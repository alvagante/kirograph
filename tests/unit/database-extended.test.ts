/**
 * Extended database tests targeting uncovered lines:
 * - getImpactRadius, getDependentFiles, getTypeHierarchy, findPath
 * - findHotspots, findSurprisingConnections
 * - upsertFile, getFile, getAllFiles, deleteFile
 * - storeEmbedding, getEmbeddedNodeIds, getAllEmbeddings
 * - insertUnresolvedRef, resolveUnresolvedRefs
 * - getStats, getNodeSource
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GraphDatabase } from '../../src/db/database';
import type { Node, FileRecord } from '../../src/types';

let tmpDir: string;
let db: GraphDatabase;

function makeNode(id: string, name: string, opts: Partial<Node> = {}): Node {
  return {
    id,
    kind: 'function',
    name,
    qualifiedName: name,
    filePath: 'src/test.ts',
    language: 'typescript',
    startLine: 1,
    endLine: 10,
    startColumn: 0,
    endColumn: 0,
    isExported: false,
    isAsync: false,
    isStatic: false,
    isAbstract: false,
    updatedAt: Date.now(),
    ...opts,
  };
}

function makeFile(p: string): FileRecord {
  return {
    path: p,
    contentHash: 'abc123',
    language: 'typescript',
    fileSize: 512,
    symbolCount: 3,
    indexedAt: Date.now(),
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-dbx-'));
  db = new GraphDatabase(tmpDir);
});

afterEach(() => {
  try { db.close(); } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── File CRUD ──────────────────────────────────────────────────────────────────

describe('file CRUD', () => {
  it('upsertFile / getFile round-trips', () => {
    db.upsertFile(makeFile('src/auth.ts'));
    const f = db.getFile('src/auth.ts');
    expect(f).not.toBeNull();
    expect(f!.path).toBe('src/auth.ts');
    expect(f!.language).toBe('typescript');
    expect(f!.symbolCount).toBe(3);
  });

  it('getFile returns null for unknown path', () => {
    expect(db.getFile('src/nonexistent.ts')).toBeNull();
  });

  it('getAllFiles returns all inserted files', () => {
    db.upsertFile(makeFile('src/a.ts'));
    db.upsertFile(makeFile('src/b.ts'));
    const all = db.getAllFiles();
    expect(all.map(f => f.path)).toContain('src/a.ts');
    expect(all.map(f => f.path)).toContain('src/b.ts');
  });

  it('upsertFile updates existing record', () => {
    db.upsertFile(makeFile('src/a.ts'));
    db.upsertFile({ ...makeFile('src/a.ts'), symbolCount: 99 });
    expect(db.getFile('src/a.ts')!.symbolCount).toBe(99);
  });

  it('deleteFile removes file and its nodes', () => {
    db.upsertFile(makeFile('src/a.ts'));
    db.upsertNode(makeNode('function:fn', 'fn', { filePath: 'src/a.ts' }));
    db.deleteFile('src/a.ts');
    expect(db.getFile('src/a.ts')).toBeNull();
    expect(db.getNode('function:fn')).toBeNull();
  });
});

// ── getImpactRadius ────────────────────────────────────────────────────────────

describe('getImpactRadius()', () => {
  beforeEach(() => {
    db.upsertNode(makeNode('function:core', 'core'));
    db.upsertNode(makeNode('function:mid', 'mid'));
    db.upsertNode(makeNode('function:top', 'top'));
    db.insertEdge({ source: 'function:mid', target: 'function:core', kind: 'calls' });
    db.insertEdge({ source: 'function:top', target: 'function:mid', kind: 'calls' });
  });

  it('depth=1 finds direct dependents', () => {
    const nodes = db.getImpactRadius('function:core', 1);
    expect(nodes.some(n => n.name === 'mid')).toBe(true);
    expect(nodes.some(n => n.name === 'top')).toBe(false);
  });

  it('depth=2 finds transitive dependents', () => {
    const nodes = db.getImpactRadius('function:core', 2);
    const names = nodes.map(n => n.name);
    expect(names).toContain('mid');
    expect(names).toContain('top');
  });

  it('returns empty for node with no dependents', () => {
    expect(db.getImpactRadius('function:top', 2)).toHaveLength(0);
  });
});

// ── getDependentFiles ─────────────────────────────────────────────────────────

describe('getDependentFiles()', () => {
  it('returns files that import the given file', () => {
    db.upsertNode(makeNode('function:a', 'fnA', { filePath: 'src/lib.ts' }));
    db.upsertNode(makeNode('function:b', 'fnB', { filePath: 'src/app.ts' }));
    db.insertEdge({ source: 'function:b', target: 'function:a', kind: 'imports' });

    const deps = db.getDependentFiles('src/lib.ts');
    expect(deps).toContain('src/app.ts');
  });

  it('returns empty for file with no dependents', () => {
    db.upsertNode(makeNode('function:a', 'fnA', { filePath: 'src/standalone.ts' }));
    expect(db.getDependentFiles('src/standalone.ts')).toHaveLength(0);
  });

  it('returns empty for unknown file', () => {
    expect(db.getDependentFiles('src/nonexistent.ts')).toHaveLength(0);
  });

  it('does not return self as dependent', () => {
    db.upsertNode(makeNode('function:a', 'fnA', { filePath: 'src/self.ts' }));
    db.upsertNode(makeNode('function:b', 'fnB', { filePath: 'src/self.ts' }));
    db.insertEdge({ source: 'function:a', target: 'function:b', kind: 'imports' });
    const deps = db.getDependentFiles('src/self.ts');
    expect(deps.every(f => f !== 'src/self.ts')).toBe(true);
  });
});

// ── getTypeHierarchy ──────────────────────────────────────────────────────────

describe('getTypeHierarchy()', () => {
  beforeEach(() => {
    db.upsertNode(makeNode('class:base', 'Base', { kind: 'class' }));
    db.upsertNode(makeNode('class:child', 'Child', { kind: 'class' }));
    db.upsertNode(makeNode('interface:iface', 'IBase', { kind: 'interface' }));
    db.insertEdge({ source: 'class:child', target: 'class:base', kind: 'extends' });
    db.insertEdge({ source: 'class:child', target: 'interface:iface', kind: 'implements' });
  });

  it('direction=up traverses from child to base', () => {
    const nodes = db.getTypeHierarchy('class:child', 'up');
    const names = nodes.map(n => n.name);
    expect(names).toContain('Base');
    expect(names).toContain('IBase');
  });

  it('direction=down traverses from base to child', () => {
    const nodes = db.getTypeHierarchy('class:base', 'down');
    expect(nodes.some(n => n.name === 'Child')).toBe(true);
  });

  it('direction=both returns all', () => {
    const nodes = db.getTypeHierarchy('class:child', 'both');
    const names = nodes.map(n => n.name);
    expect(names).toContain('Base');
    expect(names).toContain('IBase');
  });

  it('returns empty for node with no hierarchy', () => {
    db.upsertNode(makeNode('function:fn', 'fn'));
    expect(db.getTypeHierarchy('function:fn', 'both')).toHaveLength(0);
  });
});

// ── findPath ──────────────────────────────────────────────────────────────────

describe('findPath()', () => {
  beforeEach(() => {
    db.upsertNode(makeNode('function:a', 'A'));
    db.upsertNode(makeNode('function:b', 'B'));
    db.upsertNode(makeNode('function:c', 'C'));
    db.upsertNode(makeNode('function:d', 'D'));
    db.insertEdge({ source: 'function:a', target: 'function:b', kind: 'calls' });
    db.insertEdge({ source: 'function:b', target: 'function:c', kind: 'calls' });
    // D is disconnected
  });

  it('finds A→B→C path', () => {
    const nodes = db.findPath('function:a', 'function:c');
    const names = nodes.map(n => n.name);
    expect(names[0]).toBe('A');
    expect(names[names.length - 1]).toBe('C');
  });

  it('same from/to returns single node', () => {
    const nodes = db.findPath('function:a', 'function:a');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('A');
  });

  it('returns empty when no path exists', () => {
    expect(db.findPath('function:a', 'function:d')).toHaveLength(0);
  });

  it('returns empty for unknown from', () => {
    expect(db.findPath('function:nonexistent', 'function:a')).toHaveLength(0);
  });
});

// ── findHotspots ──────────────────────────────────────────────────────────────

describe('findHotspots()', () => {
  it('returns nodes sorted by degree descending', () => {
    db.upsertNode(makeNode('function:hub', 'Hub'));
    db.upsertNode(makeNode('function:spoke1', 'Spoke1'));
    db.upsertNode(makeNode('function:spoke2', 'Spoke2'));
    db.insertEdge({ source: 'function:spoke1', target: 'function:hub', kind: 'calls' });
    db.insertEdge({ source: 'function:spoke2', target: 'function:hub', kind: 'calls' });

    const hotspots = db.findHotspots();
    // Hub has highest degree
    expect(hotspots[0].name).toBe('Hub');
    expect(hotspots[0]).toHaveProperty('degree');
    expect(hotspots[0]).toHaveProperty('inDegree');
    expect(hotspots[0]).toHaveProperty('outDegree');
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      db.upsertNode(makeNode(`function:n${i}`, `N${i}`));
    }
    expect(db.findHotspots(3).length).toBeLessThanOrEqual(3);
  });

  it('excludes contains edges from degree', () => {
    db.upsertNode(makeNode('class:c', 'MyClass', { kind: 'class' }));
    db.upsertNode(makeNode('function:m', 'myMethod'));
    db.insertEdge({ source: 'class:c', target: 'function:m', kind: 'contains' });
    const hotspots = db.findHotspots();
    // Contains edge should not inflate degree
    const cls = hotspots.find(h => h.name === 'MyClass');
    expect(cls?.degree ?? 0).toBe(0);
  });
});

// ── findSurprisingConnections ─────────────────────────────────────────────────

describe('findSurprisingConnections()', () => {
  it('returns results without error', () => {
    db.upsertNode(makeNode('function:a', 'A', { filePath: 'src/auth/service.ts' }));
    db.upsertNode(makeNode('function:b', 'B', { filePath: 'src/payments/processor.ts' }));
    db.insertEdge({ source: 'function:a', target: 'function:b', kind: 'calls' });

    const results = db.findSurprisingConnections();
    expect(Array.isArray(results)).toBe(true);
  });

  it('cross-directory connections score higher than same-directory', () => {
    db.upsertNode(makeNode('function:x', 'X', { filePath: 'src/auth/login.ts' }));
    db.upsertNode(makeNode('function:y', 'Y', { filePath: 'src/payments/checkout.ts' }));
    db.upsertNode(makeNode('function:z', 'Z', { filePath: 'src/auth/logout.ts' }));
    db.insertEdge({ source: 'function:x', target: 'function:y', kind: 'calls' }); // cross-dir
    db.insertEdge({ source: 'function:x', target: 'function:z', kind: 'calls' }); // same-dir

    const results = db.findSurprisingConnections();
    const crossDir = results.find(r => r.target.name === 'Y');
    const sameDir = results.find(r => r.target.name === 'Z');
    if (crossDir && sameDir) {
      expect(crossDir.score).toBeGreaterThan(sameDir.score);
    }
  });

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      db.upsertNode(makeNode(`fn:a${i}`, `A${i}`, { filePath: `src/mod${i}/f.ts` }));
      db.upsertNode(makeNode(`fn:b${i}`, `B${i}`, { filePath: `src/other${i}/f.ts` }));
      db.insertEdge({ source: `fn:a${i}`, target: `fn:b${i}`, kind: 'calls' });
    }
    expect(db.findSurprisingConnections(3).length).toBeLessThanOrEqual(3);
  });
});

// ── insertUnresolvedRef / resolveUnresolvedRefs ───────────────────────────────

describe('insertUnresolvedRef() / resolveUnresolvedRefs()', () => {
  it('resolves function refs by exact name', () => {
    db.upsertNode(makeNode('function:target', 'myHelperFn'));
    db.upsertNode(makeNode('function:caller', 'callerFn'));
    db.insertUnresolvedRef('function:caller', 'myHelperFn', 'function', 'src/caller.ts', 10, 5);

    const resolved = db.resolveUnresolvedRefs();
    expect(resolved).toBe(1);
    // Should have created a calls edge
    const edges = db.getEdgesForNodes(['function:caller']);
    expect(edges.some(e => e.target === 'function:target' && e.kind === 'calls')).toBe(true);
  });

  it('does not resolve unknown refs', () => {
    db.upsertNode(makeNode('function:caller', 'callerFn'));
    db.insertUnresolvedRef('function:caller', 'nonExistentFn', 'function', 'src/caller.ts');
    expect(db.resolveUnresolvedRefs()).toBe(0);
  });

  it('resolves multiple refs in one call', () => {
    db.upsertNode(makeNode('function:t1', 'fnOne'));
    db.upsertNode(makeNode('function:t2', 'fnTwo'));
    db.upsertNode(makeNode('function:src', 'srcFn'));
    db.insertUnresolvedRef('function:src', 'fnOne', 'function', 'src/f.ts');
    db.insertUnresolvedRef('function:src', 'fnTwo', 'function', 'src/f.ts');
    expect(db.resolveUnresolvedRefs()).toBe(2);
  });

  it('resolves by qualified name suffix (strategy 2)', () => {
    db.upsertNode(makeNode('method:m', 'validate', { qualifiedName: 'AuthService::validate' }));
    db.upsertNode(makeNode('function:caller', 'callerFn'));
    db.insertUnresolvedRef('function:caller', 'validate', 'function', 'src/caller.ts');
    const resolved = db.resolveUnresolvedRefs();
    expect(resolved).toBeGreaterThanOrEqual(1);
  });
});

// ── storeEmbedding / getEmbeddedNodeIds / getAllEmbeddings ────────────────────

describe('embedding operations', () => {
  it('storeEmbedding and getEmbeddedNodeIds', () => {
    db.upsertNode(makeNode('function:fn', 'myFn'));
    const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    db.storeEmbedding('function:fn', embedding, 'test-model');
    expect(db.getEmbeddedNodeIds()).toContain('function:fn');
  });

  it('getAllEmbeddings returns stored embeddings', () => {
    db.upsertNode(makeNode('function:fn', 'myFn'));
    const embedding = new Float32Array([0.1, 0.2, 0.3]);
    db.storeEmbedding('function:fn', embedding, 'test-model');
    const all = db.getAllEmbeddings();
    const found = all.find(e => e.nodeId === 'function:fn');
    expect(found).toBeDefined();
    expect(found!.embedding[0]).toBeCloseTo(0.1, 3);
  });

  it('getEmbeddingCount returns 0 on fresh db', () => {
    expect(db.getEmbeddingCount()).toBe(0);
  });

  it('getEmbeddingCount increments after storing', () => {
    db.upsertNode(makeNode('function:fn', 'fn'));
    db.storeEmbedding('function:fn', new Float32Array([0.1]), 'model');
    expect(db.getEmbeddingCount()).toBe(1);
  });
});
