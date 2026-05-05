import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import KiroGraph from '../../src/index';
import { ToolHandler } from '../../src/mcp/tools';
import { openFixture, NODE_IDS } from '../helpers/fixture';

let kg: KiroGraph;
let handler: ToolHandler;

beforeAll(async () => {
  kg = await openFixture();
  handler = new ToolHandler(kg);
});

afterAll(() => {
  kg?.close();
});

async function call(tool: string, args: Record<string, unknown> = {}) {
  return handler.handle(tool, args);
}

// ── kirograph_search ──────────────────────────────────────────────────────────

describe('kirograph_search', () => {
  it('finds AuthService', async () => {
    const res = await call('kirograph_search', { query: 'AuthService' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('AuthService');
  });

  it('returns empty result for non-existent symbol', async () => {
    const res = await call('kirograph_search', { query: 'zzz_nonexistent_xyz' });
    expect(res.isError).toBeFalsy();
    // Either empty JSON array or "no results" message
    const text = res.content[0].text;
    expect(text === '[]' || text.toLowerCase().includes('no') || JSON.parse(text).length === 0).toBe(true);
  });

  it('does not error on empty query', async () => {
    const res = await call('kirograph_search', { query: '' });
    expect(res.isError).toBeFalsy();
  });

  it('does not error on FTS5 injection input', async () => {
    const res = await call('kirograph_search', { query: '"unclosed OR DROP' });
    expect(res.isError).toBeFalsy();
  });

  it('respects kind filter', async () => {
    const res = await call('kirograph_search', { query: 'AuthService', kind: 'class' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('AuthService');
  });

  it('respects limit', async () => {
    const res = await call('kirograph_search', { query: 'a', limit: 2 });
    expect(res.isError).toBeFalsy();
    // Response is text; each result is separated by double newlines
    const text = res.content[0].text;
    const blocks = text.split('\n\n').filter(Boolean);
    expect(blocks.length).toBeLessThanOrEqual(2);
  });
});

// ── kirograph_node ────────────────────────────────────────────────────────────

describe('kirograph_node', () => {
  it('returns info for AuthService', async () => {
    const res = await call('kirograph_node', { symbol: 'AuthService' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('AuthService');
  });

  it('returns error-like response for unknown symbol', async () => {
    const res = await call('kirograph_node', { symbol: 'zzz_nonexistent_xyz' });
    // Should not throw — either isError or a "not found" message
    expect(res.content[0].text).toBeDefined();
  });
});

// ── kirograph_callers ─────────────────────────────────────────────────────────

describe('kirograph_callers', () => {
  it('returns callers for validateToken', async () => {
    const res = await call('kirograph_callers', { symbol: 'validateToken' });
    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toContain('authenticate');
  });

  it('returns empty result for unknown symbol', async () => {
    const res = await call('kirograph_callers', { symbol: 'zzz_nonexistent_xyz' });
    expect(res.isError).toBeFalsy();
  });
});

// ── kirograph_callees ─────────────────────────────────────────────────────────

describe('kirograph_callees', () => {
  it('returns callees for createRouter', async () => {
    const res = await call('kirograph_callees', { symbol: 'createRouter' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('createToken');
  });

  it('returns empty result for unknown symbol', async () => {
    const res = await call('kirograph_callees', { symbol: 'zzz_nonexistent_xyz' });
    expect(res.isError).toBeFalsy();
  });
});

// ── kirograph_path ────────────────────────────────────────────────────────────

describe('kirograph_path', () => {
  it('finds path from app to createToken', async () => {
    const res = await call('kirograph_path', { from: 'app', to: 'createToken' });
    expect(res.isError).toBeFalsy();
    const text = res.content[0].text;
    expect(text).toContain('app');
    expect(text).toContain('createToken');
  });

  it('handles same from and to', async () => {
    const res = await call('kirograph_path', { from: 'AuthService', to: 'AuthService' });
    expect(res.isError).toBeFalsy();
  });

  it('handles disconnected nodes gracefully', async () => {
    const res = await call('kirograph_path', { from: 'internalHelper', to: 'AuthService' });
    expect(res.isError).toBeFalsy();
  });
});

// ── kirograph_dead_code ───────────────────────────────────────────────────────

describe('kirograph_dead_code', () => {
  it('includes internalHelper', async () => {
    const res = await call('kirograph_dead_code', {});
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('internalHelper');
  });

  it('does not include exported symbols', async () => {
    const res = await call('kirograph_dead_code', {});
    expect(res.content[0].text).not.toContain('AuthService');
  });

  it('respects limit', async () => {
    const res = await call('kirograph_dead_code', { limit: 1 });
    expect(res.isError).toBeFalsy();
    // Each dead code entry is on its own line starting with "- "
    const lines = res.content[0].text.split('\n').filter(l => l.startsWith('- '));
    expect(lines.length).toBeLessThanOrEqual(1);
  });
});

// ── kirograph_status ──────────────────────────────────────────────────────────

describe('kirograph_status', () => {
  it('returns status without error', async () => {
    const res = await call('kirograph_status', {});
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBeDefined();
  });

  it('status output contains node count', async () => {
    const res = await call('kirograph_status', {});
    const text = res.content[0].text;
    // Should mention some numbers
    expect(/\d+/.test(text)).toBe(true);
  });
});

// ── kirograph_files ───────────────────────────────────────────────────────────

describe('kirograph_files', () => {
  it('returns file list without error', async () => {
    const res = await call('kirograph_files', {});
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('auth.ts');
  });

  it('filterPath narrows results', async () => {
    const res = await call('kirograph_files', { filterPath: 'src' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('auth.ts');
  });

  it('pattern filter works', async () => {
    const res = await call('kirograph_files', { pattern: '**/*.test.ts' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('auth.test.ts');
  });
});

// ── kirograph_hotspots ────────────────────────────────────────────────────────

describe('kirograph_hotspots', () => {
  it('returns hotspots without error', async () => {
    const res = await call('kirograph_hotspots', {});
    expect(res.isError).toBeFalsy();
  });

  it('respects limit', async () => {
    const res = await call('kirograph_hotspots', { limit: 3 });
    expect(res.isError).toBeFalsy();
    // Each hotspot has a "File:" line; count those
    const lines = res.content[0].text.split('\n').filter(l => l.includes('File:'));
    expect(lines.length).toBeLessThanOrEqual(3);
  });
});

// ── kirograph_context ─────────────────────────────────────────────────────────

describe('kirograph_context', () => {
  it('returns context for a valid task', async () => {
    const res = await call('kirograph_context', { task: 'fix authentication bug' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBeDefined();
  });

  it('does not error on very short task', async () => {
    const res = await call('kirograph_context', { task: 'a' });
    expect(res.isError).toBeFalsy();
  });
});

// ── kirograph_impact ──────────────────────────────────────────────────────────

describe('kirograph_impact', () => {
  it('returns impact for AuthService', async () => {
    const res = await call('kirograph_impact', { symbol: 'AuthService' });
    expect(res.isError).toBeFalsy();
  });

  it('returns empty result for unknown symbol', async () => {
    const res = await call('kirograph_impact', { symbol: 'zzz_nonexistent_xyz' });
    expect(res.isError).toBeFalsy();
  });
});

// ── kirograph_circular_deps ───────────────────────────────────────────────────

describe('kirograph_circular_deps', () => {
  it('returns without error', async () => {
    const res = await call('kirograph_circular_deps', {});
    expect(res.isError).toBeFalsy();
  });

  it('fixture has no circular dependencies', async () => {
    const res = await call('kirograph_circular_deps', {});
    expect(res.content[0].text.toLowerCase()).toContain('no circular');
  });
});
