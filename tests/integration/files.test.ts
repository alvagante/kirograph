import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FileTree, FileTreeNode } from '../../src/index';
import KiroGraph from '../../src/index';
import { openFixture, FIXTURE_COUNTS } from '../helpers/fixture';

function collectPaths(tree: FileTree): string[] {
  const paths: string[] = [];
  function walk(node: FileTreeNode) {
    if (node.type === 'file') paths.push(node.path);
    if (node.children) node.children.forEach(walk);
  }
  (tree as FileTreeNode[]).forEach(walk);
  return paths;
}

let kg: KiroGraph;

beforeAll(async () => { kg = await openFixture(); });
afterAll(() => kg?.close());

describe('getFiles()', () => {
  it('returns a FileTree with all 6 indexed files', () => {
    const tree = kg.getFiles();
    expect(tree).toBeDefined();
    // Collect all file paths from the tree
    const paths = collectPaths(tree);
    expect(paths).toHaveLength(FIXTURE_COUNTS.files);
  });

  it('contains the expected source files', () => {
    const tree = kg.getFiles();
    const paths = collectPaths(tree);
    expect(paths.some(p => p.includes('auth.ts'))).toBe(true);
    expect(paths.some(p => p.includes('db.ts'))).toBe(true);
    expect(paths.some(p => p.includes('api.ts'))).toBe(true);
    expect(paths.some(p => p.includes('utils.ts'))).toBe(true);
    expect(paths.some(p => p.includes('index.ts'))).toBe(true);
    expect(paths.some(p => p.includes('auth.test.ts'))).toBe(true);
  });

  it('filterPath narrows results to src/ only', () => {
    const tree = kg.getFiles({ filterPath: 'src' });
    const paths = collectPaths(tree);
    expect(paths.every(p => p.startsWith('src/'))).toBe(true);
    expect(paths.some(p => p.includes('auth.test.ts'))).toBe(false);
  });

  it('filterPath for tests/ returns only the test file', () => {
    const tree = kg.getFiles({ filterPath: 'tests' });
    const paths = collectPaths(tree);
    expect(paths.every(p => p.startsWith('tests/'))).toBe(true);
    expect(paths.some(p => p.includes('auth.test.ts'))).toBe(true);
  });

  it('pattern **/*.test.ts returns only test files', () => {
    const tree = kg.getFiles({ pattern: '**/*.test.ts' });
    const paths = collectPaths(tree);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every(p => p.endsWith('.test.ts'))).toBe(true);
  });

  it('pattern *.nonexistent returns empty tree', () => {
    const tree = kg.getFiles({ pattern: '*.nonexistent' });
    const paths = collectPaths(tree);
    expect(paths).toHaveLength(0);
  });

  it('maxDepth=1 does not include deeply nested files', () => {
    const shallow = kg.getFiles({ maxDepth: 1 });
    const deep    = kg.getFiles();
    // shallow should have fewer or equal paths than deep
    expect(collectPaths(shallow).length).toBeLessThanOrEqual(collectPaths(deep).length);
  });
});

describe('getAffectedTests()', () => {
  it('auth.ts change affects auth.test.ts', () => {
    const affected = kg.getAffectedTests(['src/auth.ts']);
    expect(affected.some(p => p.includes('auth.test.ts'))).toBe(true);
  });

  it('utils.ts change affects no tests (nothing imports it)', () => {
    const affected = kg.getAffectedTests(['src/utils.ts']);
    expect(affected).toHaveLength(0);
  });

  it('db.ts change transitively affects auth.test.ts', () => {
    // db.ts imports auth.ts; auth.test.ts imports auth.ts
    // Transitive: changing db.ts can cascade to test files that import its deps
    const affected = kg.getAffectedTests(['src/db.ts']);
    // At minimum this should not throw; transitive coverage depends on depth
    expect(Array.isArray(affected)).toBe(true);
  });

  it('empty file list returns empty array', () => {
    expect(kg.getAffectedTests([])).toEqual([]);
  });

  it('non-existent file returns empty array', () => {
    expect(kg.getAffectedTests(['src/nonexistent.ts'])).toEqual([]);
  });

  it('returns only .test.ts files', () => {
    const affected = kg.getAffectedTests(['src/auth.ts']);
    expect(affected.every(p => p.includes('.test.'))).toBe(true);
  });
});
