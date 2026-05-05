/**
 * Semantic integration tests — sqlite-vec engine
 *
 * sqlite-vec stores embeddings in a separate vec.db alongside kirograph.db.
 * Search is ANN (approximate nearest-neighbour) via the sqlite-vec virtual
 * table rather than an in-process linear scan.
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

const ENGINE = 'sqlite-vec' as const;

let kg: KiroGraph;
let tmpDir: string;

beforeAll(async () => {
  if (!semanticFixtureExists(ENGINE)) return;
  ({ kg, tmpDir } = await openSemanticFixture(ENGINE));
}, 60_000);

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

  it('getStats() reports sqlite-vec engine with embeddings enabled', async () => {
    if (skipIfMissing()) return;
    await assertEngineStats(kg, ENGINE);
  });

  it('embedding count matches embeddable node count', async () => {
    if (skipIfMissing()) return;
    await assertEmbeddingCountCorrect(kg);
  });

  // ── sqlite-vec-specific: separate vec.db ──────────────────────────────────

  it('vec.db exists alongside kirograph.db', () => {
    if (skipIfMissing()) return;
    const base = path.join(SEMANTIC_BASE, ENGINE);
    expect(fs.existsSync(path.join(base, 'kirograph.db')), 'kirograph.db').toBe(true);
    expect(fs.existsSync(path.join(base, 'vec.db')), 'vec.db').toBe(true);
  });

  it('vec.db has non-zero size', () => {
    if (skipIfMissing()) return;
    const stat = fs.statSync(path.join(SEMANTIC_BASE, ENGINE, 'vec.db'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('no orama/lancedb/qdrant/typesense artefacts present', () => {
    if (skipIfMissing()) return;
    const base = path.join(SEMANTIC_BASE, ENGINE);
    expect(fs.existsSync(path.join(base, 'orama.json'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'lancedb'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'qdrant'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'typesense'))).toBe(false);
  });

  it('ANN search (vecIndexCount) reflects stored embeddings', async () => {
    if (skipIfMissing()) return;
    const stats = await kg.getStats();
    // For sqlite-vec the vecIndexCount drives embeddingCount
    expect(stats.embeddingCount).toBeGreaterThan(0);
  });

  // ── Semantic search behaviour ─────────────────────────────────────────────

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

  it('two distinct queries return different leading nodes', async () => {
    if (skipIfMissing()) return;
    const auth = await kg.buildContext('user authentication token', { maxNodes: 5 });
    const db   = await kg.buildContext('database pool query', { maxNodes: 5 });
    const authNames = auth.entryPoints.map(n => n.name);
    const dbNames   = db.entryPoints.map(n => n.name);
    // Results should not be identical
    const same = authNames.every(n => dbNames.includes(n)) && authNames.length === dbNames.length;
    expect(same, 'different queries should return different contexts').toBe(false);
  });
});
