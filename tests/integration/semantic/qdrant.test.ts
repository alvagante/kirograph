/**
 * Semantic integration tests — qdrant engine
 *
 * Qdrant runs as an embedded child process managed by qdrant-local.
 * Data is persisted in .kirograph/qdrant/ (RocksDB-backed collection).
 * The process is spawned by KiroGraph.open() → VectorManager.initialize()
 * and killed by kg.close().
 *
 * These tests are slower than the pure-JS engines because they spawn a
 * process and wait for it to become healthy (up to 10 s).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import KiroGraph from '../../../src/index';
import {
  openSemanticFixture,
  cleanupSemanticTmp,
  semanticFixtureExists,
  SEMANTIC_BASE,
} from '../../helpers/semantic-fixture';
import {
  assertEngineStats,
  assertAuthContextReturned,
  assertDatabaseContextReturned,
  assertNonEmptyContext,
  assertContextRespectsBound,
  assertEmbeddingCountCorrect,
} from './common';

const ENGINE = 'qdrant' as const;

let kg: KiroGraph;
let tmpDir: string;

beforeAll(async () => {
  if (!semanticFixtureExists(ENGINE)) return;
  ({ kg, tmpDir } = await openSemanticFixture(ENGINE));
}, 120_000); // process startup can take up to 10 s

afterAll(() => {
  try { kg?.close(); } catch { /* ignore */ }
  if (tmpDir) cleanupSemanticTmp(tmpDir);
});

function skipIfMissing() {
  if (!semanticFixtureExists(ENGINE)) {
    console.warn(`SKIP: ${ENGINE} fixture not built — run: npx tsx scripts/rebuild-semantic-fixtures.ts`);
    return true;
  }
  return false;
}

describe(`semantic — ${ENGINE}`, () => {
  it('fixture is built', () => {
    if (skipIfMissing()) return;
    expect(semanticFixtureExists(ENGINE)).toBe(true);
  });

  it('getStats() reports qdrant engine with embeddings enabled', async () => {
    if (skipIfMissing()) return;
    await assertEngineStats(kg, ENGINE);
  });

  it('embedding count matches embeddable node count', async () => {
    if (skipIfMissing()) return;
    await assertEmbeddingCountCorrect(kg);
  });

  // ── qdrant-specific: persistent data directory ────────────────────────────

  it('qdrant/ data directory exists', () => {
    if (skipIfMissing()) return;
    const qdrantDir = path.join(SEMANTIC_BASE, ENGINE, 'qdrant');
    expect(fs.existsSync(qdrantDir), 'qdrant/ dir must exist').toBe(true);
    expect(fs.statSync(qdrantDir).isDirectory()).toBe(true);
  });

  it('qdrant/ has collection data files', () => {
    if (skipIfMissing()) return;
    const qdrantDir = path.join(SEMANTIC_BASE, ENGINE, 'qdrant');
    let totalSize = 0;
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else totalSize += fs.statSync(p).size;
      }
    }
    walk(qdrantDir);
    expect(totalSize, 'qdrant collection data must be non-trivially sized').toBeGreaterThan(1000);
  });

  it('stale qdrant-server.json is not committed', () => {
    if (skipIfMissing()) return;
    // Server state files must be cleaned up by the rebuild script
    const serverFile = path.join(SEMANTIC_BASE, ENGINE, 'qdrant-server.json');
    expect(fs.existsSync(serverFile), 'qdrant-server.json must NOT be committed').toBe(false);
  });

  it('no vec.db, orama.json, lancedb, typesense artefacts present', () => {
    if (skipIfMissing()) return;
    const base = path.join(SEMANTIC_BASE, ENGINE);
    expect(fs.existsSync(path.join(base, 'vec.db'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'orama.json'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'lancedb'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'typesense'))).toBe(false);
  });

  // ── ANN search via HNSW ───────────────────────────────────────────────────

  it('buildContext() returns auth-domain nodes for auth query', async () => {
    if (skipIfMissing()) return;
    await assertAuthContextReturned(kg);
  });

  it('buildContext() returns database nodes for db query', async () => {
    if (skipIfMissing()) return;
    await assertDatabaseContextReturned(kg);
  });

  it('buildContext() returns non-empty context for utility query', async () => {
    if (skipIfMissing()) return;
    await assertNonEmptyContext(kg);
  });

  it('buildContext() respects maxNodes bound', async () => {
    if (skipIfMissing()) return;
    await assertContextRespectsBound(kg);
  });

  it('qdrant process is running after open() (embeddingCount > 0 implies healthy process)', async () => {
    if (skipIfMissing()) return;
    // If the qdrant process failed to start, engineFallback would be set
    // and embeddingCount would be 0. Both are checked by assertEngineStats.
    const stats = await kg.getStats();
    expect(stats.embeddingCount).toBeGreaterThan(0);
    expect(stats.engineFallback).toBeNull();
  });

  // Must be last — closes the DB and the qdrant process
  it('kg.close() terminates the qdrant process without throwing', () => {
    if (skipIfMissing()) return;
    expect(() => kg.close()).not.toThrow();
  });
});
