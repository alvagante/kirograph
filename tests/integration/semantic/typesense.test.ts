/**
 * Semantic integration tests — typesense engine
 *
 * Typesense runs as an embedded child process whose binary is auto-downloaded
 * to ~/.kirograph/bin/ on first use. Data is persisted in
 * .kirograph/typesense/ (RocksDB backend).
 *
 * Typesense supports both full-text and ANN vector search (HNSW). For large
 * payloads the engine uses a POST multiSearch endpoint to avoid URL-length
 * limits.
 *
 * These tests are the slowest because the binary download and process startup
 * can take up to 60 s on a cold machine.
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

const ENGINE = 'typesense' as const;

let kg: KiroGraph;
let tmpDir: string;

beforeAll(async () => {
  if (!semanticFixtureExists(ENGINE)) return;
  ({ kg, tmpDir } = await openSemanticFixture(ENGINE));
}, 180_000); // binary download + process startup can take up to 60 s

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

  it('getStats() reports typesense engine with embeddings enabled', async () => {
    if (skipIfMissing()) return;
    await assertEngineStats(kg, ENGINE);
  });

  it('embedding count matches embeddable node count', async () => {
    if (skipIfMissing()) return;
    await assertEmbeddingCountCorrect(kg);
  });

  // ── typesense-specific: RocksDB data directory ────────────────────────────

  it('typesense/ data directory exists', () => {
    if (skipIfMissing()) return;
    const tsDir = path.join(SEMANTIC_BASE, ENGINE, 'typesense');
    expect(fs.existsSync(tsDir), 'typesense/ dir must exist').toBe(true);
    expect(fs.statSync(tsDir).isDirectory()).toBe(true);
  });

  it('typesense/ has collection data files', () => {
    if (skipIfMissing()) return;
    const tsDir = path.join(SEMANTIC_BASE, ENGINE, 'typesense');
    let totalSize = 0;
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else totalSize += fs.statSync(p).size;
      }
    }
    walk(tsDir);
    expect(totalSize, 'typesense collection data must be non-trivially sized').toBeGreaterThan(1000);
  });

  it('stale typesense-server.json is not committed', () => {
    if (skipIfMissing()) return;
    const serverFile = path.join(SEMANTIC_BASE, ENGINE, 'typesense-server.json');
    expect(fs.existsSync(serverFile), 'typesense-server.json must NOT be committed').toBe(false);
  });

  it('no vec.db, orama.json, lancedb, qdrant artefacts present', () => {
    if (skipIfMissing()) return;
    const base = path.join(SEMANTIC_BASE, ENGINE);
    expect(fs.existsSync(path.join(base, 'vec.db'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'orama.json'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'lancedb'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'qdrant'))).toBe(false);
  });

  // ── Hybrid ANN + full-text search ─────────────────────────────────────────

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

  it('typesense process is running after open() (embeddingCount > 0 implies healthy process)', async () => {
    if (skipIfMissing()) return;
    const stats = await kg.getStats();
    expect(stats.embeddingCount).toBeGreaterThan(0);
    expect(stats.engineFallback).toBeNull();
  });

  it('multiSearch handles a query longer than 4 KB without error', async () => {
    if (skipIfMissing()) return;
    // Typesense uses POST multiSearch to avoid URL limits. A long query string
    // exercises this code path.
    const longQuery = 'authenticate '.repeat(400).trim(); // ~5 KB
    const ctx = await kg.buildContext(longQuery, { maxNodes: 5 });
    // Should not throw; result may be empty or partial but must be an array
    expect(Array.isArray(ctx.entryPoints)).toBe(true);
  });

  // Must be last — closes the DB, making further kg calls invalid
  it('kg.close() terminates the typesense process without throwing', () => {
    if (skipIfMissing()) return;
    expect(() => kg.close()).not.toThrow();
  });
});
