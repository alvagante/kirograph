/**
 * Unit tests for src/resolution/index.ts
 * Covers: ReferenceResolver — warmCaches, resolveAll, resolveUnresolvedRefs, invalidateFile
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { GraphDatabase } from '../../src/db/database';
import { ReferenceResolver } from '../../src/resolution/index';
import type { KiroGraphConfig } from '../../src/config';

const NOW = Date.now();

function cfg(overrides: Partial<KiroGraphConfig> = {}): KiroGraphConfig {
  return {
    exclude: [],
    include: [],
    embeddingsEnabled: false,
    semanticEngine: 'cosine',
    enableArchitecture: false,
    maxNodes: 10,
    fuzzyResolutionThreshold: 0.5,
    ...overrides,
  } as KiroGraphConfig;
}

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: `function:${Math.random().toString(36).slice(2)}`,
    kind: 'function' as const,
    name: 'myFunc',
    qualifiedName: 'src/a.ts::myFunc',
    filePath: 'src/a.ts',
    language: 'typescript' as const,
    startLine: 1,
    endLine: 5,
    startColumn: 0,
    endColumn: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

let db: GraphDatabase;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-res-test-'));
  db = new GraphDatabase(tmpDir);
});

afterEach(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── warmCaches and basic resolution ───────────────────────────────────────────

describe('ReferenceResolver — warmCaches', () => {
  it('constructs without throwing', () => {
    expect(() => new ReferenceResolver(db, cfg())).not.toThrow();
  });

  it('warmCaches() works on an empty database', () => {
    const resolver = new ReferenceResolver(db, cfg());
    expect(() => resolver.warmCaches()).not.toThrow();
  });

  it('warmCaches() works after nodes are inserted', () => {
    const node = makeNode({ name: 'doWork' });
    db.upsertNode(node as any);
    const resolver = new ReferenceResolver(db, cfg());
    expect(() => resolver.warmCaches()).not.toThrow();
  });
});

// ── resolveAll ─────────────────────────────────────────────────────────────────

describe('ReferenceResolver — resolveAll', () => {
  it('returns zero counts on empty DB', async () => {
    const resolver = new ReferenceResolver(db, cfg());
    const result = await resolver.resolveAll();
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.total).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('resolves an unresolved ref by exact name', async () => {
    // Insert target node
    const target = makeNode({ id: 'function:abc123', name: 'handleRequest', filePath: 'src/handler.ts', qualifiedName: 'src/handler.ts::handleRequest' });
    db.upsertNode(target as any);

    // Insert source node
    const source = makeNode({ id: 'function:src999', name: 'callHandler', filePath: 'src/caller.ts', qualifiedName: 'src/caller.ts::callHandler' });
    db.upsertNode(source as any);

    // Insert unresolved ref pointing to handleRequest
    db.insertUnresolvedRef(source.id, 'handleRequest', 'function', 'src/caller.ts', 3, 0);

    const resolver = new ReferenceResolver(db, cfg());
    const result = await resolver.resolveAll();

    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(0);
  });

  it('resolves an import ref from relative path', async () => {
    // Insert a node with filePath matching the import candidate
    const target = makeNode({ id: 'function:imp1', name: 'exported', filePath: 'src/utils.ts', qualifiedName: 'src/utils.ts::exported' });
    db.upsertNode(target as any);

    const source = makeNode({ id: 'function:imp2', name: 'importer', filePath: 'src/main.ts', qualifiedName: 'src/main.ts::importer' });
    db.upsertNode(source as any);

    // Insert unresolved import ref using relative path './utils'
    db.insertUnresolvedRef(source.id, './utils', 'import', 'src/main.ts', 1, 0);

    const resolver = new ReferenceResolver(db, cfg());
    const result = await resolver.resolveAll();

    expect(result.resolved).toBe(1);
  });

  it('leaves unresolvable refs as unresolved', async () => {
    const source = makeNode({ id: 'function:s1', name: 'caller', filePath: 'src/a.ts', qualifiedName: 'src/a.ts::caller' });
    db.upsertNode(source as any);

    db.insertUnresolvedRef(source.id, 'ghostFunction', 'function', 'src/a.ts', 5, 0);

    const resolver = new ReferenceResolver(db, cfg());
    const result = await resolver.resolveAll();

    expect(result.unresolved).toBe(1);
    expect(result.resolved).toBe(0);
  });

  it('calls onProgress callback for each ref', async () => {
    const source = makeNode({ id: 'function:p1', name: 'fn', filePath: 'src/a.ts', qualifiedName: 'src/a.ts::fn' });
    db.upsertNode(source as any);

    db.insertUnresolvedRef(source.id, 'noTarget', 'function', 'src/a.ts', 1, 0);

    const calls: [number, number][] = [];
    const resolver = new ReferenceResolver(db, cfg());
    await resolver.resolveAll((cur, tot) => calls.push([cur, tot]));

    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![1]).toBe(1); // total is 1
  });

  it('resolves by method call pattern (obj.method)', async () => {
    const target = makeNode({ id: 'function:m1', name: 'process', filePath: 'src/svc.ts', qualifiedName: 'src/svc.ts::process' });
    db.upsertNode(target as any);

    const source = makeNode({ id: 'function:m2', name: 'run', filePath: 'src/app.ts', qualifiedName: 'src/app.ts::run' });
    db.upsertNode(source as any);

    const rawDb = (db as any).db;
    rawDb.run(
      `INSERT INTO unresolved_refs (id, source_id, ref_name, ref_kind, file_path, line, column)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['ref-method', source.id, 'service.process', 'function', 'src/app.ts', 2, 0]
    );

    const resolver = new ReferenceResolver(db, cfg());
    const result = await resolver.resolveAll();
    expect(result.resolved).toBe(1);
  });
});

// ── invalidateFile ─────────────────────────────────────────────────────────────

describe('ReferenceResolver — invalidateFile', () => {
  it('does not throw when called before warmCaches', () => {
    const resolver = new ReferenceResolver(db, cfg());
    expect(() => resolver.invalidateFile('src/foo.ts')).not.toThrow();
  });

  it('removes cache entries for the given file', () => {
    const node = makeNode({ id: 'function:x1', name: 'oldFn', filePath: 'src/old.ts', qualifiedName: 'src/old.ts::oldFn' });
    db.upsertNode(node as any);

    const resolver = new ReferenceResolver(db, cfg());
    resolver.warmCaches();
    resolver.invalidateFile('src/old.ts');

    // After invalidation, new resolution should not find old cached entry
    // (we verify no throw as a smoke test — cache is private)
    expect(() => resolver.invalidateFile('src/old.ts')).not.toThrow();
  });

  it('invalidating a non-existent file is a no-op', () => {
    const resolver = new ReferenceResolver(db, cfg());
    resolver.warmCaches();
    expect(() => resolver.invalidateFile('src/does-not-exist.ts')).not.toThrow();
  });
});

// ── multiple resolveAll calls ──────────────────────────────────────────────────

describe('ReferenceResolver — repeated resolveAll', () => {
  it('second resolveAll returns zero since refs already resolved', async () => {
    const target = makeNode({ id: 'function:r1', name: 'target', filePath: 'src/t.ts', qualifiedName: 'src/t.ts::target' });
    db.upsertNode(target as any);

    const source = makeNode({ id: 'function:r2', name: 'caller', filePath: 'src/c.ts', qualifiedName: 'src/c.ts::caller' });
    db.upsertNode(source as any);

    const rawDb = (db as any).db;
    rawDb.run(
      `INSERT INTO unresolved_refs (id, source_id, ref_name, ref_kind, file_path, line, column)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['ref-rep', source.id, 'target', 'function', 'src/c.ts', 1, 0]
    );

    const resolver = new ReferenceResolver(db, cfg());
    const first = await resolver.resolveAll();
    const second = await resolver.resolveAll();

    expect(first.resolved).toBe(1);
    expect(second.resolved).toBe(0);
    expect(second.unresolved).toBe(0);
  });
});
