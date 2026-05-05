#!/usr/bin/env tsx
/**
 * Build per-engine semantic test fixtures.
 *
 * For each supported semantic engine this script:
 *   1. Copies the sample-project TypeScript source to a temp directory.
 *   2. Initialises KiroGraph with embeddings enabled for that engine.
 *   3. Runs a full index (source parsing + embedding phase).
 *   4. Copies the resulting .kirograph/ directory to
 *      tests/fixtures/semantic/<engine>/.
 *   5. Removes ephemeral process-state files (qdrant-server.json,
 *      typesense-server.json) so the fixtures are portable.
 *
 * Prerequisites
 * ─────────────
 *   • The HuggingFace model is downloaded once and cached at
 *     ~/.kirograph/models/ (nomic-ai/nomic-embed-text-v1.5, ~270 MB).
 *   • All optional engine packages must be installed:
 *       npm install better-sqlite3 sqlite-vec
 *       npm install @orama/orama @orama/plugin-data-persistence
 *       npm install @lancedb/lancedb
 *       npm install qdrant-local
 *       npm install typesense
 *
 * Usage
 * ─────
 *   npx tsx scripts/rebuild-semantic-fixtures.ts
 *   npx tsx scripts/rebuild-semantic-fixtures.ts --engines cosine,orama
 *
 * Then commit the updated tests/fixtures/semantic/ directories.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import KiroGraph from '../src/index';
import type { KiroGraphConfig } from '../src/config';

// ── Paths ─────────────────────────────────────────────────────────────────────

const SOURCE = path.resolve(__dirname, '../tests/fixtures/sample-project');
const DEST_BASE = path.resolve(__dirname, '../tests/fixtures/semantic');
const KIROGRAPH_DIR = '.kirograph';

// Files inside .kirograph/ that must not be committed (process-specific state)
const EPHEMERAL_FILES = [
  'qdrant-server.json',
  'typesense-server.json',
  'kirograph.lock',
  'dirty',
];

// ── Engine matrix ─────────────────────────────────────────────────────────────

type Engine = 'cosine' | 'sqlite-vec' | 'orama' | 'lancedb' | 'qdrant' | 'typesense';

const ALL_ENGINES: Engine[] = [
  'cosine',
  'sqlite-vec',
  'orama',
  'lancedb',
  'qdrant',
  'typesense',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function copySource(dest: string): void {
  // Copy only the TS source tree — never .kirograph/
  for (const entry of fs.readdirSync(SOURCE)) {
    if (entry === KIROGRAPH_DIR) continue;
    fs.cpSync(path.join(SOURCE, entry), path.join(dest, entry), { recursive: true });
  }
}

function removeEphemeral(kirographDir: string): void {
  for (const f of EPHEMERAL_FILES) {
    const p = path.join(kirographDir, f);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
    }
  }
}

function saveFixture(tmpKirograph: string, engine: Engine): void {
  const dest = path.join(DEST_BASE, engine);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(tmpKirograph, dest, { recursive: true });
  console.log(`  ✓ saved → tests/fixtures/semantic/${engine}/`);
}

// ── Per-engine build ──────────────────────────────────────────────────────────

async function buildEngine(engine: Engine): Promise<void> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Engine: ${engine}`);
  console.log('─'.repeat(60));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `kg-sem-${engine}-`));

  try {
    // 1. Copy TS source
    copySource(tmpDir);
    console.log('  Copied source files');

    // 2. Build config for this engine
    const config: Partial<KiroGraphConfig> = {
      enableEmbeddings: true,
      semanticEngine: engine,
      enableArchitecture: false,
    };

    // 3. Init + full index (includes embedding phase)
    console.log('  Initialising KiroGraph (may download model on first run)…');
    let modelDownloaded = false;
    const kg = await KiroGraph.init(tmpDir, config, (_file, _loaded, _total, done) => {
      if (!modelDownloaded && !done) {
        process.stdout.write('  Downloading model… ');
        modelDownloaded = true;
      }
      if (done && modelDownloaded) {
        process.stdout.write('done\n');
        modelDownloaded = false;
      }
    });

    console.log('  Running indexAll (parse + embed)…');
    const result = await kg.indexAll({
      force: true,
      onProgress: (p) => {
        process.stdout.write(`\r  Phase: ${p.phase.padEnd(20)} ${p.current}/${p.total}  `);
      },
    });
    process.stdout.write('\n');

    const stats = await kg.getStats();
    console.log(`  Files: ${result.filesIndexed}  Nodes: ${result.nodesCreated}  Edges: ${result.edgesCreated}`);
    console.log(`  Embeddings: ${stats.embeddingCount}/${stats.embeddableNodeCount}`);
    console.log(`  Engine fallback: ${stats.engineFallback ?? 'none'}`);

    if (result.errors.length) {
      console.warn('  Errors:', result.errors);
    }

    kg.close();

    // 4. Remove ephemeral files
    const kirographDir = path.join(tmpDir, KIROGRAPH_DIR);
    removeEphemeral(kirographDir);

    // 5. Save fixture
    saveFixture(kirographDir, engine);

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Parse optional --engines flag
  const engineArg = process.argv.find(a => a.startsWith('--engines='))?.split('=')[1];
  const engines: Engine[] = engineArg
    ? (engineArg.split(',').filter(e => ALL_ENGINES.includes(e as Engine)) as Engine[])
    : ALL_ENGINES;

  console.log('Rebuilding semantic fixtures for engines:', engines.join(', '));
  console.log(`Source: ${SOURCE}`);
  console.log(`Dest:   ${DEST_BASE}`);

  fs.mkdirSync(DEST_BASE, { recursive: true });

  const results: Array<{ engine: Engine; ok: boolean; error?: string }> = [];

  for (const engine of engines) {
    try {
      await buildEngine(engine);
      results.push({ engine, ok: true });
    } catch (err: any) {
      console.error(`\n  ✗ ${engine} FAILED:`, err.message ?? err);
      results.push({ engine, ok: false, error: String(err.message ?? err) });
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  Summary');
  console.log('═'.repeat(60));
  for (const r of results) {
    const mark = r.ok ? '✓' : '✗';
    console.log(`  ${mark}  ${r.engine.padEnd(14)} ${r.error ?? ''}`);
  }

  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    console.log(`\n${failed.length} engine(s) failed. Fix errors and re-run.`);
    process.exit(1);
  }

  console.log('\n✓ All fixtures built. Commit tests/fixtures/semantic/ to git.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
