import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GraphDatabase } from '../../src/db/database';
import { GraphTraverser } from '../../src/graph/traversal';
import type { Node } from '../../src/types';

// ── helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;
let db: GraphDatabase;
let traverser: GraphTraverser;

function makeNode(id: string, name: string): Node {
  return {
    id,
    kind: 'function',
    name,
    qualifiedName: name,
    filePath: 'src/test.ts',
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-traversal-'));
  db = new GraphDatabase(tmpDir);
  traverser = new GraphTraverser(db);
});

afterEach(() => {
  try { db.close(); } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Linear chain: A → B → C ───────────────────────────────────────────────────

describe('BFS on linear chain A→B→C', () => {
  beforeEach(() => {
    ['function:a', 'function:b', 'function:c'].forEach((id, i) =>
      db.upsertNode(makeNode(id, ['A', 'B', 'C'][i]))
    );
    db.insertEdge({ source: 'function:a', target: 'function:b', kind: 'calls' });
    db.insertEdge({ source: 'function:b', target: 'function:c', kind: 'calls' });
  });

  it('traverses all reachable nodes from A (outgoing)', async () => {
    const nodes = await traverser.traverseBFS('function:a');
    const names = nodes.map(n => n.name);
    expect(names).toContain('B');
    expect(names).toContain('C');
  });

  it('does not include start node by default', async () => {
    const nodes = await traverser.traverseBFS('function:a');
    expect(nodes.every(n => n.name !== 'A')).toBe(true);
  });

  it('includes start node when includeStart=true', async () => {
    const nodes = await traverser.traverseBFS('function:a', { includeStart: true });
    expect(nodes.some(n => n.name === 'A')).toBe(true);
  });

  it('respects maxDepth=1', async () => {
    const nodes = await traverser.traverseBFS('function:a', { maxDepth: 1 });
    const names = nodes.map(n => n.name);
    expect(names).toContain('B');
    expect(names).not.toContain('C');
  });

  it('respects limit', async () => {
    const nodes = await traverser.traverseBFS('function:a', { limit: 1 });
    expect(nodes).toHaveLength(1);
  });

  it('incoming direction from C reaches A via B', async () => {
    const nodes = await traverser.traverseBFS('function:c', { direction: 'incoming' });
    const names = nodes.map(n => n.name);
    expect(names).toContain('B');
    expect(names).toContain('A');
  });

  it('returns empty for isolated node with no edges', async () => {
    db.upsertNode(makeNode('function:iso', 'Isolated'));
    const nodes = await traverser.traverseBFS('function:iso');
    expect(nodes).toHaveLength(0);
  });

  it('returns empty for unknown startId', async () => {
    const nodes = await traverser.traverseBFS('function:nonexistent');
    expect(nodes).toHaveLength(0);
  });
});

// ── DFS ───────────────────────────────────────────────────────────────────────

describe('DFS on linear chain A→B→C', () => {
  beforeEach(() => {
    ['function:a', 'function:b', 'function:c'].forEach((id, i) =>
      db.upsertNode(makeNode(id, ['A', 'B', 'C'][i]))
    );
    db.insertEdge({ source: 'function:a', target: 'function:b', kind: 'calls' });
    db.insertEdge({ source: 'function:b', target: 'function:c', kind: 'calls' });
  });

  it('visits all reachable nodes', async () => {
    const nodes = await traverser.traverseDFS('function:a');
    const names = nodes.map(n => n.name);
    expect(names).toContain('B');
    expect(names).toContain('C');
  });

  it('does not visit a node twice in a cycle', async () => {
    // Add back-edge C→A to create a cycle
    db.insertEdge({ source: 'function:c', target: 'function:a', kind: 'calls' });
    const nodes = await traverser.traverseDFS('function:a');
    const ids = nodes.map(n => n.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('respects maxDepth', async () => {
    const nodes = await traverser.traverseDFS('function:a', { maxDepth: 1 });
    expect(nodes.map(n => n.name)).not.toContain('C');
  });

  it('respects limit', async () => {
    const nodes = await traverser.traverseDFS('function:a', { limit: 1 });
    expect(nodes).toHaveLength(1);
  });
});

// ── edgeKinds filter ──────────────────────────────────────────────────────────

describe('edgeKinds filter', () => {
  beforeEach(() => {
    db.upsertNode(makeNode('function:src', 'Src'));
    db.upsertNode(makeNode('function:callTarget', 'CallTarget'));
    db.upsertNode(makeNode('function:importTarget', 'ImportTarget'));
    db.insertEdge({ source: 'function:src', target: 'function:callTarget', kind: 'calls' });
    db.insertEdge({ source: 'function:src', target: 'function:importTarget', kind: 'imports' });
  });

  it('only follows calls edges when specified', async () => {
    const nodes = await traverser.traverseBFS('function:src', { edgeKinds: ['calls'] });
    const names = nodes.map(n => n.name);
    expect(names).toContain('CallTarget');
    expect(names).not.toContain('ImportTarget');
  });

  it('only follows imports edges when specified', async () => {
    const nodes = await traverser.traverseBFS('function:src', { edgeKinds: ['imports'] });
    const names = nodes.map(n => n.name);
    expect(names).toContain('ImportTarget');
    expect(names).not.toContain('CallTarget');
  });

  it('follows both when no edgeKinds filter', async () => {
    const nodes = await traverser.traverseBFS('function:src');
    const names = nodes.map(n => n.name);
    expect(names).toContain('CallTarget');
    expect(names).toContain('ImportTarget');
  });
});

// ── nodeKinds filter ──────────────────────────────────────────────────────────

describe('nodeKinds filter', () => {
  beforeEach(() => {
    db.upsertNode(makeNode('function:f', 'Fn'));
    db.upsertNode({ ...makeNode('class:c', 'Cls'), kind: 'class' });
    db.insertEdge({ source: 'function:f', target: 'class:c', kind: 'calls' });
  });

  it('filters results to specified nodeKinds', async () => {
    const nodes = await traverser.traverseBFS('function:f', { nodeKinds: ['class'] });
    expect(nodes.every(n => n.kind === 'class')).toBe(true);
  });

  it('returns empty when nodeKinds excludes all reachable nodes', async () => {
    const nodes = await traverser.traverseBFS('function:f', { nodeKinds: ['interface'] });
    expect(nodes).toHaveLength(0);
  });
});
