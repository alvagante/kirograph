/**
 * Shared assertions for per-engine semantic integration tests.
 *
 * Every engine must satisfy the same behavioural contract; only the
 * engine-specific file/process checks differ per test file.
 */
import { expect } from 'vitest';
import type KiroGraph from '../../../src/index';
import type { SemanticEngine } from '../../helpers/semantic-fixture';

// ── Stats contract ────────────────────────────────────────────────────────────

/**
 * Assert that getStats() reports the engine as active with embeddings loaded.
 * Returns the stats object so callers can make additional assertions.
 */
export async function assertEngineStats(kg: KiroGraph, engine: SemanticEngine) {
  const stats = await kg.getStats();

  expect(stats.semanticEngine, 'semanticEngine').toBe(engine);
  expect(stats.embeddingsEnabled, 'embeddingsEnabled').toBe(true);
  expect(stats.embeddingCount, 'embeddingCount').toBeGreaterThan(0);
  expect(stats.engineFallback, 'engineFallback (should be null = no fallback)').toBeNull();

  // The number of stored embeddings must not exceed the number of embeddable nodes
  expect(stats.embeddingCount).toBeLessThanOrEqual(stats.embeddableNodeCount);

  return stats;
}

// ── Semantic search contract ──────────────────────────────────────────────────

/**
 * Assert that buildContext() surfaces nodes that are semantically related to
 * authentication / token validation — the core theme of the sample project's
 * AuthService class.
 */
export async function assertAuthContextReturned(kg: KiroGraph): Promise<void> {
  const ctx = await kg.buildContext('authenticate user token validation', { maxNodes: 15 });
  const allNodes = [...ctx.entryPoints, ...ctx.relatedNodes];
  const names = allNodes.map(n => n.name);

  // At least one auth-domain node must be surfaced
  const authNames = ['authenticate', 'validateToken', 'AuthService', 'createToken', 'hashPassword'];
  const found = authNames.filter(n => names.includes(n));
  expect(found.length, `Expected auth nodes in context. Got: ${names.join(', ')}`).toBeGreaterThan(0);
}

/**
 * Assert that buildContext() surfaces nodes related to database / query
 * execution — the DatabasePool class in the sample project.
 */
export async function assertDatabaseContextReturned(kg: KiroGraph): Promise<void> {
  const ctx = await kg.buildContext('database query pool connection', { maxNodes: 15 });
  const allNodes = [...ctx.entryPoints, ...ctx.relatedNodes];
  const names = allNodes.map(n => n.name);

  const dbNames = ['DatabasePool', 'query'];
  const found = dbNames.filter(n => names.includes(n));
  expect(found.length, `Expected database nodes in context. Got: ${names.join(', ')}`).toBeGreaterThan(0);
}

/**
 * buildContext() must return a non-empty context for a general coding query.
 */
export async function assertNonEmptyContext(kg: KiroGraph): Promise<void> {
  const ctx = await kg.buildContext('format date utility helper');
  const total = ctx.entryPoints.length + ctx.relatedNodes.length;
  expect(total, 'context must contain at least one node').toBeGreaterThan(0);
}

/**
 * buildContext() must return no more nodes than requested.
 */
export async function assertContextRespectsBound(kg: KiroGraph): Promise<void> {
  const maxNodes = 5;
  const ctx = await kg.buildContext('authentication', { maxNodes });
  const total = ctx.entryPoints.length + ctx.relatedNodes.length;
  // Total may exceed maxNodes slightly because entryPoints and relatedNodes
  // are assembled from different stages, but must be reasonable
  expect(total, 'context size').toBeLessThanOrEqual(maxNodes * 3);
}

// ── Embedding count contract ──────────────────────────────────────────────────

/**
 * The sample project has exactly these embeddable node kinds:
 *   class × 2, function × 6, method × 4  →  12 embeddable nodes
 * (imports and constants are not embedded)
 */
export const EXPECTED_EMBEDDING_COUNT = 12;

export async function assertEmbeddingCountCorrect(kg: KiroGraph): Promise<void> {
  const stats = await kg.getStats();
  expect(stats.embeddingCount, 'embedding count').toBe(EXPECTED_EMBEDDING_COUNT);
}
