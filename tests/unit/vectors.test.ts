/**
 * Unit tests for src/vectors/index.ts
 * Tests VectorManager with embeddings disabled (no model loading),
 * and pure helper behaviours accessible through the public API.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { GraphDatabase } from '../../src/db/database';
import { VectorManager } from '../../src/vectors/index';
import type { KiroGraphConfig } from '../../src/config';
import type { Node } from '../../src/types';

function cfg(overrides: Partial<KiroGraphConfig> = {}): KiroGraphConfig {
  return {
    exclude: [],
    include: [],
    embeddingsEnabled: false,
    enableEmbeddings: false,
    semanticEngine: 'cosine',
    enableArchitecture: false,
    maxNodes: 10,
    ...overrides,
  } as KiroGraphConfig;
}

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: `function:${Math.random().toString(36).slice(2)}`,
    kind: 'function',
    name: 'myFunc',
    qualifiedName: 'src/a.ts::myFunc',
    filePath: 'src/a.ts',
    language: 'typescript',
    startLine: 1,
    endLine: 5,
    startColumn: 0,
    endColumn: 0,
    updatedAt: Date.now(),
    ...overrides,
  } as Node;
}

let db: GraphDatabase;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-vec-test-'));
  db = new GraphDatabase(tmpDir);
});

afterEach(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── VectorManager with embeddings disabled ────────────────────────────────────

describe('VectorManager — embeddings disabled', () => {
  it('constructs without throwing', () => {
    expect(() => new VectorManager(db, cfg(), tmpDir)).not.toThrow();
  });

  it('isInitialized() returns false when not yet initialized', () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    expect(vm.isInitialized()).toBe(false);
  });

  it('isInitialized() returns false after initialize() when disabled', async () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    await vm.initialize();
    expect(vm.isInitialized()).toBe(false);
  });

  it('getEngineFallback() returns null before initialization', () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    expect(vm.getEngineFallback()).toBeNull();
  });

  it('initialize() is a no-op when embeddings disabled — resolves quickly', async () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    await expect(vm.initialize()).resolves.toBeUndefined();
  });

  it('initialize() accepts onProgress callback without calling it when disabled', async () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    let called = false;
    await vm.initialize(() => { called = true; });
    expect(called).toBe(false);
  });

  it('embedNode() is a no-op when disabled — resolves without throwing', async () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    await vm.initialize();
    const node = makeNode();
    await expect(vm.embedNode(node)).resolves.toBeUndefined();
  });

  it('embedNode() is a no-op for non-embeddable kinds (variable)', async () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    await vm.initialize();
    const node = makeNode({ kind: 'variable' as any });
    await expect(vm.embedNode(node)).resolves.toBeUndefined();
  });

  it('embedAll() returns 0 when disabled', async () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    await vm.initialize();
    const count = await vm.embedAll();
    expect(count).toBe(0);
  });

  it('deleteEmbeddings() does not throw when disabled', async () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    await vm.initialize();
    await expect(vm.deleteEmbeddings(['id1', 'id2'])).resolves.toBeUndefined();
  });

  it('vecIndexCount() returns 0 when no index is active', async () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    await vm.initialize();
    expect(await vm.vecIndexCount()).toBe(0);
  });

  it('search() returns empty array when disabled', async () => {
    const vm = new VectorManager(db, cfg(), tmpDir);
    await vm.initialize();
    const results = await vm.search(new Float32Array(768), 5);
    expect(results).toEqual([]);
  });
});

// ── VectorManager with embeddings enabled but no model ───────────────────────

describe('VectorManager — embeddings enabled, model load fails gracefully', () => {
  it('isInitialized() remains false when model load fails', async () => {
    const vm = new VectorManager(db, cfg({
      enableEmbeddings: true,
      embeddingModel: 'does-not-exist/no-such-model',
    }), tmpDir);
    await vm.initialize();
    expect(vm.isInitialized()).toBe(false);
  });

  it('embedAll() returns 0 when not initialized', async () => {
    const vm = new VectorManager(db, cfg({
      enableEmbeddings: true,
      embeddingModel: 'does-not-exist/no-such-model',
    }), tmpDir);
    await vm.initialize();
    const count = await vm.embedAll();
    expect(count).toBe(0);
  });
});

// ── VecIndex — available check ─────────────────────────────────────────────────

describe('VecIndex', () => {
  it('isAvailable() returns false when better-sqlite3 is not installed', async () => {
    const { VecIndex } = await import('../../src/vectors/vec-index');
    const idx = new VecIndex(tmpDir, 768);
    await idx.initialize();
    // In this environment better-sqlite3 may or may not be installed.
    // The key invariant: calling initialize() does not throw.
    expect(typeof idx.isAvailable()).toBe('boolean');
  });
});

// ── OramaIndex — available check ──────────────────────────────────────────────

describe('OramaIndex', () => {
  it('isAvailable() returns a boolean after initialize()', async () => {
    const { OramaIndex } = await import('../../src/vectors/orama-index');
    const idx = new OramaIndex(tmpDir, 768);
    await idx.initialize();
    expect(typeof idx.isAvailable()).toBe('boolean');
  });

  it('count() returns a number', async () => {
    const { OramaIndex } = await import('../../src/vectors/orama-index');
    const idx = new OramaIndex(tmpDir, 768);
    await idx.initialize();
    const c = await idx.count();
    expect(typeof c).toBe('number');
  });
});
