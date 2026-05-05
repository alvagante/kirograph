/**
 * Helpers for semantic / vector-engine integration tests.
 *
 * Each engine has its own pre-built fixture directory at
 *   tests/fixtures/semantic/<engine>/
 * which holds the .kirograph/ contents (config.json + kirograph.db +
 * engine-specific data files).  openSemanticFixture() combines that with the
 * shared TypeScript source tree from tests/fixtures/sample-project/ into a
 * temporary copy so each test run is isolated.
 *
 * Build / refresh fixtures:
 *   npx tsx scripts/rebuild-semantic-fixtures.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import KiroGraph from '../../src/index';

// ── Paths ─────────────────────────────────────────────────────────────────────

export const SOURCE_FIXTURE   = path.resolve(__dirname, '../fixtures/sample-project');
export const SEMANTIC_BASE    = path.resolve(__dirname, '../fixtures/semantic');

// ── Types ─────────────────────────────────────────────────────────────────────

export type SemanticEngine =
  | 'cosine'
  | 'sqlite-vec'
  | 'orama'
  | 'lancedb'
  | 'qdrant'
  | 'typesense';

export const ALL_ENGINES: SemanticEngine[] = [
  'cosine', 'sqlite-vec', 'orama', 'lancedb', 'qdrant', 'typesense',
];

// Nodes of these kinds are embedded; the count should match stats.embeddingCount
// after a full rebuild (matches src/vectors/index.ts EMBEDDABLE_KINDS).
export const EMBEDDABLE_KINDS = new Set([
  'function', 'method', 'class', 'interface', 'type_alias', 'component', 'module',
]);

// ── Guard ─────────────────────────────────────────────────────────────────────

/**
 * Returns true when the pre-built fixture for `engine` exists on disk.
 * Use as a test skip condition:
 *
 *   beforeAll(async () => {
 *     if (!semanticFixtureExists(engine)) return;  // vitest.skip inside test
 *     ...
 *   });
 */
export function semanticFixtureExists(engine: SemanticEngine): boolean {
  return fs.existsSync(path.join(SEMANTIC_BASE, engine, 'kirograph.db'));
}

// ── Fixture opener ────────────────────────────────────────────────────────────

/**
 * Open a pre-built semantic fixture for `engine`.
 *
 * Steps:
 *  1. Copies the sample-project TypeScript source (no .kirograph/) to a fresh
 *     temp directory.
 *  2. Copies the pre-built .kirograph/ snapshot for `engine` into the temp dir.
 *  3. Opens KiroGraph from the temp dir (reads config.json → initialises engine).
 *
 * Throws a clear error when the fixture hasn't been built yet.
 */
export async function openSemanticFixture(
  engine: SemanticEngine,
): Promise<{ kg: KiroGraph; tmpDir: string }> {
  const fixtureDir = path.join(SEMANTIC_BASE, engine);

  if (!fs.existsSync(path.join(fixtureDir, 'kirograph.db'))) {
    throw new Error(
      `Semantic fixture for engine "${engine}" not found at ${fixtureDir}.\n` +
      'Run:  npx tsx scripts/rebuild-semantic-fixtures.ts',
    );
  }

  // 1. Fresh temp dir + TS source
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `kg-sem-${engine}-`));
  for (const entry of fs.readdirSync(SOURCE_FIXTURE)) {
    if (entry === '.kirograph') continue;
    fs.cpSync(path.join(SOURCE_FIXTURE, entry), path.join(tmpDir, entry), { recursive: true });
  }

  // 2. Engine .kirograph/ contents
  const tmpKirograph = path.join(tmpDir, '.kirograph');
  fs.mkdirSync(tmpKirograph, { recursive: true });
  fs.cpSync(fixtureDir, tmpKirograph, { recursive: true });

  // 3. Open (reads config.json, initialises vector engine)
  const kg = await KiroGraph.open(tmpDir);
  return { kg, tmpDir };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export function cleanupSemanticTmp(tmpDir: string): void {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
