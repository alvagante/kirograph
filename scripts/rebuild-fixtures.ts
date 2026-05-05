#!/usr/bin/env tsx
/**
 * Rebuild the committed test fixture database.
 *
 * Run after:
 *   - schema.sql changes
 *   - fixture source file changes
 *   - KiroGraph indexing logic changes
 *
 * Usage:
 *   npx tsx scripts/rebuild-fixtures.ts
 *
 * Then commit the updated .kirograph/kirograph.db
 */

import * as path from 'path';
import * as fs from 'fs';
import KiroGraph from '../src/index';

const FIXTURE = path.resolve(__dirname, '../tests/fixtures/sample-project');
const KIROGRAPH_DIR = path.join(FIXTURE, '.kirograph');

async function main() {
  console.log('Rebuilding fixture:', FIXTURE);

  // Wipe any previous .kirograph dir
  if (fs.existsSync(KIROGRAPH_DIR)) {
    fs.rmSync(KIROGRAPH_DIR, { recursive: true, force: true });
    console.log('Removed existing .kirograph/');
  }

  // Init with embeddings disabled so no model download is needed
  const kg = await KiroGraph.init(FIXTURE, {
    enableEmbeddings: false,
    enableArchitecture: true,
    useVecIndex: false,
  });

  console.log('Initialized .kirograph/');

  // Full index
  const result = await kg.indexAll({ force: true });

  console.log('\n── Index result ──────────────────────────────');
  console.log('  files indexed :', result.filesIndexed);
  console.log('  nodes created :', result.nodesCreated);
  console.log('  edges created :', result.edgesCreated);
  console.log('  errors        :', result.errors.length ? result.errors : 'none');
  console.log('  duration      :', result.duration + 'ms');

  // Full stats
  const stats = await kg.getStats();
  console.log('\n── Stats ─────────────────────────────────────');
  console.log('  total nodes   :', stats.totalNodes);
  console.log('  total edges   :', stats.totalEdges);
  console.log('  total files   :', stats.totalFiles);
  console.log('  nodes by kind :');
  for (const [kind, count] of Object.entries(stats.nodesByKind ?? {}).sort()) {
    console.log(`    ${kind.padEnd(16)}: ${count}`);
  }

  // Dead code
  const dead = kg.findDeadCode(100);
  console.log('\n── Dead code ─────────────────────────────────');
  dead.forEach(n => console.log(`  ${n.name} (${n.kind}) — ${n.filePath}`));

  // All node names (for test writing)
  const nodes = kg.getAllNodes();
  console.log('\n── All nodes ─────────────────────────────────');
  nodes.forEach(n => console.log(`  [${n.id}] ${n.name} (${n.kind}) ${n.isExported ? '✓exported' : ''} — ${n.filePath}:${n.startLine}`));

  // All edges
  const edges = kg.getAllEdges();
  console.log('\n── All edges ─────────────────────────────────');
  edges.forEach(e => console.log(`  ${e.source} → ${e.target} (${e.kind})`));

  kg.close();

  console.log('\n✓ Fixture rebuilt. Commit tests/fixtures/sample-project/.kirograph/kirograph.db');
}

main().catch(err => {
  console.error('Rebuild failed:', err);
  process.exit(1);
});
