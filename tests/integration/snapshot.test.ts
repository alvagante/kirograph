import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openFixtureCopy, cleanupTmp } from '../helpers/fixture';
import KiroGraph from '../../src/index';

let kg: KiroGraph;
let tmpDir: string;

beforeEach(async () => {
  ({ kg, tmpDir } = await openFixtureCopy());
});

afterEach(() => {
  try { kg?.close(); } catch { /* already closed */ }
  cleanupTmp(tmpDir);
});

describe('SnapshotManager', () => {
  it('save() returns a snapshot with the given label', () => {
    const mgr = kg.createSnapshotManager();
    const snap = mgr.save('pre-refactor');
    expect(snap).toBeDefined();
    expect(snap.label).toBe('pre-refactor');
    expect(snap.nodeCount).toBeGreaterThan(0);
    expect(snap.edgeCount).toBeGreaterThan(0);
  });

  it('list() returns saved snapshots', () => {
    const mgr = kg.createSnapshotManager();
    mgr.save('snap-a');
    const list = mgr.list();
    expect(list.some(s => s.label === 'snap-a')).toBe(true);
  });

  it('list() is empty before any snapshot is saved', () => {
    const mgr = kg.createSnapshotManager();
    const list = mgr.list();
    expect(list).toHaveLength(0);
  });

  it('diff() against self returns zero changes', () => {
    const mgr = kg.createSnapshotManager();
    const snap = mgr.save('baseline');
    const current = mgr.currentSnapshot();
    const diff = mgr.diff(snap, current);
    expect(diff.addedNodes).toHaveLength(0);
    expect(diff.removedNodes).toHaveLength(0);
    expect(diff.addedEdges).toHaveLength(0);
    expect(diff.removedEdges).toHaveLength(0);
  });

  it('save() captures correct node and edge counts', () => {
    const mgr = kg.createSnapshotManager();
    const nodes = kg.getAllNodes();
    const edges = kg.getAllEdges();
    const snap = mgr.save('count-check');
    expect(snap.nodeCount).toBe(nodes.length);
    expect(snap.edgeCount).toBe(edges.length);
  });
});
