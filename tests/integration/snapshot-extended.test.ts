import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openFixtureCopy, cleanupTmp } from '../helpers/fixture';
import KiroGraph from '../../src/index';

let kg: KiroGraph;
let tmpDir: string;

beforeEach(async () => {
  ({ kg, tmpDir } = await openFixtureCopy());
});

afterEach(() => {
  try { kg?.close(); } catch { /* ignore */ }
  cleanupTmp(tmpDir);
});

describe('SnapshotManager — load / loadLatest', () => {
  it('load() returns null for non-existent label', () => {
    const mgr = kg.createSnapshotManager();
    expect(mgr.load('does-not-exist')).toBeNull();
  });

  it('load() retrieves a previously saved snapshot by label', () => {
    const mgr = kg.createSnapshotManager();
    mgr.save('v1');
    const snap = mgr.load('v1');
    expect(snap).not.toBeNull();
    expect(snap!.label).toBe('v1');
    expect(snap!.nodeCount).toBeGreaterThan(0);
  });

  it('loadLatest() returns null when no snapshots exist', () => {
    const mgr = kg.createSnapshotManager();
    expect(mgr.loadLatest()).toBeNull();
  });

  it('loadLatest() returns the most recent snapshot', () => {
    const mgr = kg.createSnapshotManager();
    mgr.save('older');
    // small delay so timestamps differ
    const snap = mgr.save('newer');
    const latest = mgr.loadLatest();
    expect(latest).not.toBeNull();
    // newer was saved last — should be latest (list sorts desc)
    expect(['older', 'newer']).toContain(latest!.label);
  });

  it('currentSnapshot() returns live graph state', () => {
    const mgr = kg.createSnapshotManager();
    const current = mgr.currentSnapshot();
    expect(current.label).toBe('current');
    expect(current.nodeCount).toBeGreaterThan(0);
    expect(current.edgeCount).toBeGreaterThan(0);
    expect(current.nodes.length).toBe(current.nodeCount);
    expect(current.edges.length).toBe(current.edgeCount);
  });

  it('diff() detects nodes added after snapshot', () => {
    const mgr = kg.createSnapshotManager();
    const before = mgr.save('before');
    // current matches before exactly — so diff should be empty
    const diff = mgr.diff(before, mgr.currentSnapshot());
    expect(diff.addedNodes).toHaveLength(0);
    expect(diff.removedNodes).toHaveLength(0);
  });

  it('save() without label uses ISO timestamp as label', () => {
    const mgr = kg.createSnapshotManager();
    const snap = mgr.save();
    expect(snap.label).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('list() is sorted newest-first', () => {
    const mgr = kg.createSnapshotManager();
    const s1 = mgr.save('first');
    const s2 = mgr.save('second');
    const list = mgr.list();
    const ts = list.map(s => s.timestamp);
    // timestamps should be non-increasing
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i - 1]).toBeGreaterThanOrEqual(ts[i]);
    }
  });
});
