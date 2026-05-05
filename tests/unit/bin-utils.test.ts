/**
 * Unit tests for src/bin/commands/utils.ts
 * Covers: formatSyncCounts, warnFallback
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatSyncCounts, warnFallback } from '../../src/bin/commands/utils';

// ── formatSyncCounts ───────────────────────────────────────────────────────────

describe('formatSyncCounts', () => {
  it('includes added count', () => {
    const out = formatSyncCounts({ added: [1, 2, 3], modified: [], removed: [], duration: 100 });
    expect(out).toContain('3');
  });

  it('includes modified count', () => {
    const out = formatSyncCounts({ added: [], modified: [1, 2], removed: [], duration: 50 });
    expect(out).toContain('2');
  });

  it('includes removed count', () => {
    const out = formatSyncCounts({ added: [], modified: [], removed: [1], duration: 75 });
    expect(out).toContain('1');
  });

  it('includes duration in ms', () => {
    const out = formatSyncCounts({ added: [], modified: [], removed: [], duration: 123 });
    expect(out).toContain('123ms');
  });

  it('returns a string', () => {
    const out = formatSyncCounts({ added: [], modified: [], removed: [], duration: 0 });
    expect(typeof out).toBe('string');
  });

  it('shows zeros when all counts are 0', () => {
    const out = formatSyncCounts({ added: [], modified: [], removed: [], duration: 0 });
    // Should contain '0' for counts
    expect(out).toContain('0');
  });

  it('handles large counts', () => {
    const added = new Array(1000).fill(null);
    const out = formatSyncCounts({ added, modified: [], removed: [], duration: 9999 });
    expect(out).toContain('1000');
    expect(out).toContain('9999ms');
  });
});

// ── warnFallback ──────────────────────────────────────────────────────────────

describe('warnFallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call console.warn when fallback is null', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnFallback(null);
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls console.warn with fallback engine name when set', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnFallback('cosine');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toContain('cosine');
  });

  it('includes "fallback" in the warning message', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnFallback('sqlite-vec');
    expect(spy.mock.calls[0]?.[0].toLowerCase()).toContain('fallback');
  });
});
