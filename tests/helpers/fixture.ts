import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import KiroGraph from '../../src/index';

export const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/sample-project');

// Known stable node IDs from the committed fixture (run rebuild-fixtures to refresh)
export const NODE_IDS = {
  AuthService:    'class:da3b8e41cc467d91cc8759b5970cdb26',
  validateToken:  'method:54a355076cf033fef136b200a944ee2d',
  hashPassword:   'method:2d51667aae20f89a40478c05478d8134',
  createToken:    'function:a424a883a99cb5aeb7b07ab1c1ad909f',
  DatabasePool:   'class:e1648ed29bb0a9685ad4fb0e01eef5e9',
  query:          'method:7ff84e1fc9efcd78a53104bbc921274d',
  authenticate:   'method:e0e90c047dc222740559f34152239942',
  createRouter:   'function:03be93831ec03ee94fc025e2fe0125cf',
  healthCheck:    'function:5a20832df2bc0a4f06d37d8aa0cc153c',
  formatDate:     'function:e40de14006181c3d1e028766239a569c',
  parseQuery:     'function:72a1f09373bf98ff89a818ea7b7c4ac4',
  internalHelper: 'function:c07c500716b643b07ce3755c6e7ea0d9',
  app:            'constant:3912a9c2ac73e72e843358af9ad21f16',
};

export const FIXTURE_COUNTS = {
  nodes:  24,
  edges:  17,
  files:  6,
  byKind: { class: 2, constant: 6, function: 6, import: 6, method: 4 },
};

/**
 * Open the committed fixture read-only.
 * Fast — no init, no indexing.
 */
export async function openFixture(): Promise<KiroGraph> {
  return KiroGraph.open(FIXTURE_PATH);
}

/**
 * Copy the fixture to a temp dir and open it there.
 * Use for tests that mutate state (sync, snapshot save, mark-dirty, etc.).
 */
export async function openFixtureCopy(): Promise<{ kg: KiroGraph; tmpDir: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kirograph-test-'));
  fs.cpSync(FIXTURE_PATH, tmpDir, { recursive: true });
  const kg = await KiroGraph.open(tmpDir);
  return { kg, tmpDir };
}

/**
 * Clean up a temp dir created by openFixtureCopy.
 */
export function cleanupTmp(tmpDir: string): void {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
