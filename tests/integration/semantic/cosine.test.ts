/**
 * Semantic integration tests — cosine engine
 *
 * The cosine engine is the default in-process engine. Embeddings are stored
 * directly in the `vectors` SQLite table inside kirograph.db. No external
 * binary or process is required.
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

const ENGINE = 'cosine' as const;

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

// ── Guard ─────────────────────────────────────────────────────────────────────

function skipIfMissing() {
  if (!semanticFixtureExists(ENGINE)) {
    console.warn(`SKIP: ${ENGINE} fixture not built — run: npx tsx scripts/rebuild-semantic-fixtures.ts`);
    return true;
  }
  return false;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

describe(`semantic — ${ENGINE}`, () => {
  it('fixture is built', () => {
    if (skipIfMissing()) return;
    expect(semanticFixtureExists(ENGINE)).toBe(true);
  });

  it('getStats() reports cosine engine with embeddings enabled', async () => {
    if (skipIfMissing()) return;
    await assertEngineStats(kg, ENGINE);
  });

  it('embedding count matches embeddable node count in sample project', async () => {
    if (skipIfMissing()) return;
    await assertEmbeddingCountCorrect(kg);
  });

  // ── cosine-specific: embeddings live in kirograph.db vectors table ─────────

  it('kirograph.db contains the vectors table with rows', () => {
    if (skipIfMissing()) return;
    const dbPath = path.join(SEMANTIC_BASE, ENGINE, 'kirograph.db');
    expect(fs.existsSync(dbPath), 'kirograph.db must exist').toBe(true);
    // No separate vec.db for cosine — vectors live inline
    const vecDb = path.join(SEMANTIC_BASE, ENGINE, 'vec.db');
    expect(fs.existsSync(vecDb), 'cosine must NOT have a vec.db').toBe(false);
  });

  it('no orama.json or engine-specific directories present', () => {
    if (skipIfMissing()) return;
    const base = path.join(SEMANTIC_BASE, ENGINE);
    expect(fs.existsSync(path.join(base, 'orama.json'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'lancedb'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'qdrant'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'typesense'))).toBe(false);
  });

  it('engineFallback is null (no fallback needed for cosine)', async () => {
    if (skipIfMissing()) return;
    const stats = await kg.getStats();
    expect(stats.engineFallback).toBeNull();
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

  it('buildContext() summary is a non-empty string', async () => {
    if (skipIfMissing()) return;
    const ctx = await kg.buildContext('authentication service');
    expect(typeof ctx.summary).toBe('string');
    expect(ctx.summary.length).toBeGreaterThan(0);
  });

  it('buildContext() edges connect returned nodes', async () => {
    if (skipIfMissing()) return;
    const ctx = await kg.buildContext('authenticate user');
    if (ctx.edges.length > 0) {
      const nodeIds = new Set([...ctx.entryPoints, ...ctx.relatedNodes].map(n => n.id));
      for (const edge of ctx.edges) {
        const connected = nodeIds.has(edge.source) || nodeIds.has(edge.target);
        expect(connected, `edge ${edge.source}→${edge.target} should connect known nodes`).toBe(true);
      }
    }
  });
});
