/**
 * Semantic integration tests — lancedb engine
 *
 * LanceDB stores vectors in Apache Lance columnar format under .kirograph/lancedb/.
 * Search is ANN via the Lance HNSW-like index with cosine distance metric.
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

const ENGINE = 'lancedb' as const;

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

  it('getStats() reports lancedb engine with embeddings enabled', async () => {
    if (skipIfMissing()) return;
    await assertEngineStats(kg, ENGINE);
  });

  it('embedding count matches embeddable node count', async () => {
    if (skipIfMissing()) return;
    await assertEmbeddingCountCorrect(kg);
  });

  // ── lancedb-specific: Lance columnar data directory ───────────────────────

  it('lancedb/ directory exists with Lance table files', () => {
    if (skipIfMissing()) return;
    const lanceDir = path.join(SEMANTIC_BASE, ENGINE, 'lancedb');
    expect(fs.existsSync(lanceDir), 'lancedb/ dir must exist').toBe(true);
    expect(fs.statSync(lanceDir).isDirectory()).toBe(true);

    // Lance stores tables as subdirectories; kg_nodes table must be present
    const entries = fs.readdirSync(lanceDir);
    expect(entries.length, 'lancedb/ must have table files').toBeGreaterThan(0);
  });

  it('no vec.db, orama.json, qdrant, typesense artefacts present', () => {
    if (skipIfMissing()) return;
    const base = path.join(SEMANTIC_BASE, ENGINE);
    expect(fs.existsSync(path.join(base, 'vec.db'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'orama.json'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'qdrant'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'typesense'))).toBe(false);
  });

  it('lancedb/ directory is non-trivially sized (contains vector data)', () => {
    if (skipIfMissing()) return;
    const lanceDir = path.join(SEMANTIC_BASE, ENGINE, 'lancedb');
    let totalSize = 0;
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else totalSize += fs.statSync(p).size;
      }
    }
    walk(lanceDir);
    expect(totalSize, 'Lance data must be non-trivially sized').toBeGreaterThan(1000);
  });

  // ── ANN search behaviour ──────────────────────────────────────────────────

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

  it('consecutive identical queries return the same results', async () => {
    if (skipIfMissing()) return;
    const a = await kg.buildContext('validate token authentication', { maxNodes: 5 });
    const b = await kg.buildContext('validate token authentication', { maxNodes: 5 });
    const aNamesStr = [...a.entryPoints, ...a.relatedNodes].map(n => n.id).sort().join(',');
    const bNamesStr = [...b.entryPoints, ...b.relatedNodes].map(n => n.id).sort().join(',');
    expect(aNamesStr).toBe(bNamesStr);
  });
});
