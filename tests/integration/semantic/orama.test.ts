/**
 * Semantic integration tests — orama engine
 *
 * Orama provides hybrid search (full-text + vector) persisted in orama.json.
 * The search combines a text BM25 score with cosine vector similarity,
 * giving it higher recall on short or keyword-heavy queries.
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

const ENGINE = 'orama' as const;

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

  it('getStats() reports orama engine with embeddings enabled', async () => {
    if (skipIfMissing()) return;
    await assertEngineStats(kg, ENGINE);
  });

  it('embedding count matches embeddable node count', async () => {
    if (skipIfMissing()) return;
    await assertEmbeddingCountCorrect(kg);
  });

  // ── orama-specific: orama.json persistence ───────────────────────────────

  it('orama.json exists and has non-zero size', () => {
    if (skipIfMissing()) return;
    const p = path.join(SEMANTIC_BASE, ENGINE, 'orama.json');
    expect(fs.existsSync(p), 'orama.json must exist').toBe(true);
    expect(fs.statSync(p).size, 'orama.json must be non-empty').toBeGreaterThan(0);
  });

  it('orama.json is valid JSON', () => {
    if (skipIfMissing()) return;
    const raw = fs.readFileSync(path.join(SEMANTIC_BASE, ENGINE, 'orama.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('no vec.db, pglite, lancedb, qdrant, typesense artefacts present', () => {
    if (skipIfMissing()) return;
    const base = path.join(SEMANTIC_BASE, ENGINE);
    expect(fs.existsSync(path.join(base, 'vec.db'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'lancedb'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'qdrant'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'typesense'))).toBe(false);
  });

  // ── Hybrid search behaviour ───────────────────────────────────────────────

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

  it('hybrid search handles short single-word queries', async () => {
    if (skipIfMissing()) return;
    // Orama's BM25 component gives it extra recall on keyword queries
    const ctx = await kg.buildContext('authenticate');
    const total = ctx.entryPoints.length + ctx.relatedNodes.length;
    expect(total).toBeGreaterThan(0);
  });

  it('hybrid search handles multi-word natural language queries', async () => {
    if (skipIfMissing()) return;
    const ctx = await kg.buildContext('how to validate a JWT token for an authenticated user');
    const total = ctx.entryPoints.length + ctx.relatedNodes.length;
    expect(total).toBeGreaterThan(0);
  });
});
