import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GraphDatabase } from '../../src/db/database';
import { ArchitectureAnalyzer } from '../../src/architecture/index';
import { createDefaultConfig } from '../../src/config';
import type { Node } from '../../src/types';

let tmpDir: string;
let db: GraphDatabase;

function makeNode(id: string, filePath: string): Node {
  return {
    id, kind: 'function', name: id, qualifiedName: id, filePath,
    language: 'typescript', startLine: 1, endLine: 5,
    startColumn: 0, endColumn: 0, isExported: false, isAsync: false,
    isStatic: false, isAbstract: false, updatedAt: Date.now(),
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-aa-'));
  db = new GraphDatabase(tmpDir);
});

afterEach(() => {
  try { db.close(); } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ArchitectureAnalyzer.analyze()', () => {
  it('runs without error on empty DB', async () => {
    const config = { ...createDefaultConfig(), enableArchitecture: true };
    const analyzer = new ArchitectureAnalyzer(db, config, tmpDir);
    const result = await analyzer.analyze();
    expect(result).toHaveProperty('packages');
    expect(result).toHaveProperty('layers');
    expect(result).toHaveProperty('packageDeps');
    expect(result).toHaveProperty('layerDeps');
    expect(result).toHaveProperty('coupling');
    expect(result).toHaveProperty('filePackages');
    expect(result).toHaveProperty('fileLayers');
  });

  it('detects layers from indexed TypeScript files', async () => {
    db.upsertFile({ path: 'src/routes/users.ts', contentHash: 'a', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });
    db.upsertFile({ path: 'src/services/auth.ts', contentHash: 'b', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });
    db.upsertFile({ path: 'src/repositories/user.ts', contentHash: 'c', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });

    const config = { ...createDefaultConfig(), enableArchitecture: true };
    const analyzer = new ArchitectureAnalyzer(db, config, tmpDir);
    const result = await analyzer.analyze();

    const layerNames = result.layers.map(l => l.name);
    expect(layerNames).toContain('api');
    expect(layerNames).toContain('service');
    expect(layerNames).toContain('data');
  });

  it('uses config-defined layers with confidence=1.0', async () => {
    db.upsertFile({ path: 'src/custom/foo.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });

    const config = {
      ...createDefaultConfig(),
      enableArchitecture: true,
      architectureLayers: { myLayer: ['src/custom/**'] },
    };
    const analyzer = new ArchitectureAnalyzer(db, config, tmpDir);
    const result = await analyzer.analyze();

    const myLayer = result.layers.find(l => l.name === 'myLayer');
    expect(myLayer).toBeDefined();
    expect(myLayer?.source).toBe('config');

    const assignment = result.fileLayers['src/custom/foo.ts'];
    expect(assignment?.[0]?.confidence).toBe(1.0);
    expect(assignment?.[0]?.matchedPattern).toContain('config:');
  });

  it('groups files into directory packages when no manifests', async () => {
    db.upsertFile({ path: 'src/routes/a.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });
    db.upsertFile({ path: 'src/routes/b.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });
    db.upsertFile({ path: 'lib/utils/c.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });

    const config = { ...createDefaultConfig(), enableArchitecture: true };
    const analyzer = new ArchitectureAnalyzer(db, config, tmpDir);
    const result = await analyzer.analyze();

    const pkgIds = result.packages.map(p => p.id);
    // Should create directory packages for top-level dirs
    expect(pkgIds.some(id => id.startsWith('pkg:dir:src'))).toBe(true);
    expect(pkgIds.some(id => id.startsWith('pkg:dir:lib'))).toBe(true);
  });

  it('uses npm manifest when package.json exists', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-project', version: '1.0.0' })
    );
    db.upsertFile({ path: 'src/routes/a.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });

    const config = { ...createDefaultConfig(), enableArchitecture: true };
    const analyzer = new ArchitectureAnalyzer(db, config, tmpDir);
    const result = await analyzer.analyze();

    expect(result.packages.some(p => p.name === 'my-project')).toBe(true);
    expect(result.packages.some(p => p.source === 'manifest')).toBe(true);
  });

  it('computes coupling metrics for packages', async () => {
    db.upsertFile({ path: 'src/routes/a.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });
    db.upsertFile({ path: 'src/services/b.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });
    db.upsertNode(makeNode('fn:a', 'src/routes/a.ts'));
    db.upsertNode(makeNode('fn:b', 'src/services/b.ts'));
    db.insertEdge({ source: 'fn:a', target: 'fn:b', kind: 'imports' });

    const config = { ...createDefaultConfig(), enableArchitecture: true };
    const analyzer = new ArchitectureAnalyzer(db, config, tmpDir);
    const result = await analyzer.analyze();

    expect(result.coupling.length).toBeGreaterThan(0);
    for (const c of result.coupling) {
      expect(c.instability).toBeGreaterThanOrEqual(0);
      expect(c.instability).toBeLessThanOrEqual(1);
    }
  });

  it('calls onProgress callback', async () => {
    const messages: string[] = [];
    const config = { ...createDefaultConfig(), enableArchitecture: true };
    const analyzer = new ArchitectureAnalyzer(db, config, tmpDir);
    await analyzer.analyze((msg) => messages.push(msg));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some(m => m.includes('architecture'))).toBe(true);
  });

  it('persists packages to DB (clearArchitecture + upsertArchPackage)', async () => {
    db.upsertFile({ path: 'src/routes/a.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });

    const config = { ...createDefaultConfig(), enableArchitecture: true };
    const analyzer = new ArchitectureAnalyzer(db, config, tmpDir);
    await analyzer.analyze();

    // Running again should not error (clearArchitecture + re-insert)
    const result2 = await analyzer.analyze();
    expect(result2.packages.length).toBeGreaterThan(0);
  });

  it('groups root manifest files into subdirectory packages', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'root', version: '1.0.0' })
    );
    // Multiple files in same subdir
    db.upsertFile({ path: 'src/routes/a.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });
    db.upsertFile({ path: 'src/routes/b.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });
    db.upsertFile({ path: 'src/services/c.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });

    const config = { ...createDefaultConfig(), enableArchitecture: true };
    const analyzer = new ArchitectureAnalyzer(db, config, tmpDir);
    const result = await analyzer.analyze();

    // With root manifest, sub-directory packages are created
    const dirPkgs = result.packages.filter(p => p.source === 'directory');
    expect(dirPkgs.length).toBeGreaterThan(0);
  });

  it('returns empty layers when enableArchitecture=false and no architectureLayers', async () => {
    db.upsertFile({ path: 'src/routes/a.ts', contentHash: 'x', language: 'typescript', fileSize: 100, symbolCount: 1, indexedAt: Date.now() });

    const config = { ...createDefaultConfig(), enableArchitecture: false };
    const analyzer = new ArchitectureAnalyzer(db, config, tmpDir);
    const result = await analyzer.analyze();

    expect(result.layers).toHaveLength(0);
    expect(result.layerDeps).toHaveLength(0);
  });
});
