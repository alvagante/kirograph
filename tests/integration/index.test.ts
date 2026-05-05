import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import KiroGraph from '../../src/index';
import { openFixture, FIXTURE_PATH, FIXTURE_COUNTS } from '../helpers/fixture';

let kg: KiroGraph;

beforeAll(async () => { kg = await openFixture(); });
afterAll(() => kg?.close());

describe('KiroGraph.isInitialized()', () => {
  it('returns true for the fixture path', () => {
    expect(KiroGraph.isInitialized(FIXTURE_PATH)).toBe(true);
  });

  it('returns false for a non-initialized directory', () => {
    expect(KiroGraph.isInitialized(os.tmpdir())).toBe(false);
  });

  it('returns false for a non-existent path', () => {
    expect(KiroGraph.isInitialized('/nonexistent/path/xyz')).toBe(false);
  });
});

describe('KiroGraph.open()', () => {
  it('opens without throwing', async () => {
    const kg2 = await KiroGraph.open(FIXTURE_PATH);
    expect(kg2).toBeDefined();
    kg2.close();
  });

  it('throws on an uninitialized directory', async () => {
    await expect(KiroGraph.open(os.tmpdir())).rejects.toThrow(/not initialized/i);
  });
});

describe('getProjectRoot()', () => {
  it('returns the resolved fixture path', () => {
    expect(kg.getProjectRoot()).toBe(path.resolve(FIXTURE_PATH));
  });
});

describe('getAllNodes()', () => {
  it('returns exactly the expected node count', () => {
    expect(kg.getAllNodes()).toHaveLength(FIXTURE_COUNTS.nodes);
  });

  it('returns nodes with required fields', () => {
    const nodes = kg.getAllNodes();
    for (const n of nodes) {
      expect(n.id).toBeTruthy();
      expect(n.name).toBeTruthy();
      expect(n.kind).toBeTruthy();
      expect(n.filePath).toBeTruthy();
    }
  });
});

describe('getAllEdges()', () => {
  it('returns exactly the expected edge count', () => {
    expect(kg.getAllEdges()).toHaveLength(FIXTURE_COUNTS.edges);
  });

  it('returns edges with required fields', () => {
    const edges = kg.getAllEdges();
    for (const e of edges) {
      expect(e.source).toBeTruthy();
      expect(e.target).toBeTruthy();
      expect(e.kind).toBeTruthy();
    }
  });
});

describe('getStats()', () => {
  it('returns without throwing', async () => {
    const stats = await kg.getStats();
    expect(stats).toBeDefined();
  });

  it('reports embeddings as disabled', async () => {
    const stats = await kg.getStats();
    expect(stats.embeddingsEnabled).toBe(false);
  });

  it('reports correct node counts by kind', async () => {
    const stats = await kg.getStats();
    expect(stats.nodesByKind.class).toBe(FIXTURE_COUNTS.byKind.class);
    expect(stats.nodesByKind.function).toBe(FIXTURE_COUNTS.byKind.function);
    expect(stats.nodesByKind.method).toBe(FIXTURE_COUNTS.byKind.method);
    expect(stats.nodesByKind.constant).toBe(FIXTURE_COUNTS.byKind.constant);
    expect(stats.nodesByKind.import).toBe(FIXTURE_COUNTS.byKind.import);
  });
});

describe('KiroGraph.init() in temp dir', () => {
  it('creates .kirograph directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-init-test-'));
    try {
      const kg2 = await KiroGraph.init(tmpDir, { enableEmbeddings: false });
      expect(fs.existsSync(path.join(tmpDir, '.kirograph'))).toBe(true);
      expect(KiroGraph.isInitialized(tmpDir)).toBe(true);
      kg2.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
