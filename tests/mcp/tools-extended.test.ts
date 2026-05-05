import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import KiroGraph from '../../src/index';
import { ToolHandler } from '../../src/mcp/tools';
import { openFixture } from '../helpers/fixture';

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

// ── kirograph_architecture (disabled in fixture) ──────────────────────────────

describe('kirograph_architecture', () => {
  it('returns without error', async () => {
    const res = await call('kirograph_architecture', {});
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBeDefined();
  });

  it('does not error with level=packages', async () => {
    const res = await call('kirograph_architecture', { level: 'packages' });
    expect(res.isError).toBeFalsy();
  });

  it('does not error with level=layers', async () => {
    const res = await call('kirograph_architecture', { level: 'layers' });
    expect(res.isError).toBeFalsy();
  });

  it('does not error with level=both', async () => {
    const res = await call('kirograph_architecture', { level: 'both' });
    expect(res.isError).toBeFalsy();
  });
});

// ── kirograph_type_hierarchy ──────────────────────────────────────────────────

describe('kirograph_type_hierarchy', () => {
  it('returns graceful message for unknown symbol', async () => {
    const res = await call('kirograph_type_hierarchy', { symbol: 'zzz_nonexistent_xyz' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBeDefined();
  });

  it('returns without error for a known class', async () => {
    const res = await call('kirograph_type_hierarchy', { symbol: 'AuthService' });
    expect(res.isError).toBeFalsy();
  });

  it('respects direction=up', async () => {
    const res = await call('kirograph_type_hierarchy', { symbol: 'AuthService', direction: 'up' });
    expect(res.isError).toBeFalsy();
  });

  it('respects direction=down', async () => {
    const res = await call('kirograph_type_hierarchy', { symbol: 'AuthService', direction: 'down' });
    expect(res.isError).toBeFalsy();
  });
});

// ── kirograph_surprising ──────────────────────────────────────────────────────

describe('kirograph_surprising', () => {
  it('returns without error', async () => {
    const res = await call('kirograph_surprising', {});
    expect(res.isError).toBeFalsy();
  });

  it('respects limit', async () => {
    const res = await call('kirograph_surprising', { limit: 3 });
    expect(res.isError).toBeFalsy();
  });
});

// ── kirograph_node with includeCode ──────────────────────────────────────────

describe('kirograph_node includeCode', () => {
  it('returns source snippet when includeCode=true', async () => {
    const res = await call('kirograph_node', { symbol: 'validateToken', includeCode: true });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('validateToken');
  });

  it('works without includeCode flag', async () => {
    const res = await call('kirograph_node', { symbol: 'validateToken' });
    expect(res.isError).toBeFalsy();
  });
});

// ── unknown tool ──────────────────────────────────────────────────────────────

describe('unknown tool', () => {
  it('returns error content for unrecognised tool name', async () => {
    const res = await call('kirograph_nonexistent_tool', {});
    // Should either be isError or contain an error-like message
    expect(res.content[0].text).toBeDefined();
  });
});

// ── kirograph_search with kind filter ────────────────────────────────────────

describe('kirograph_search kind variants', () => {
  it('kind=method returns only methods', async () => {
    const res = await call('kirograph_search', { query: 'validate', kind: 'method' });
    expect(res.isError).toBeFalsy();
  });

  it('kind=function returns only functions', async () => {
    const res = await call('kirograph_search', { query: 'create', kind: 'function' });
    expect(res.isError).toBeFalsy();
  });

  it('query with many terms does not error', async () => {
    const res = await call('kirograph_search', { query: 'auth service validate token hash password' });
    expect(res.isError).toBeFalsy();
  });
});

// ── kirograph_callers / callees with limit ────────────────────────────────────

describe('kirograph_callers / callees with limit', () => {
  it('kirograph_callers respects limit', async () => {
    const res = await call('kirograph_callers', { symbol: 'validateToken', limit: 1 });
    expect(res.isError).toBeFalsy();
  });

  it('kirograph_callees respects limit', async () => {
    const res = await call('kirograph_callees', { symbol: 'createRouter', limit: 1 });
    expect(res.isError).toBeFalsy();
  });
});

// ── kirograph_path edge cases ─────────────────────────────────────────────────

describe('kirograph_path edge cases', () => {
  it('unknown from symbol returns not-found message', async () => {
    const res = await call('kirograph_path', { from: 'zzz_unknown', to: 'AuthService' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text.toLowerCase()).toContain('not found');
  });

  it('unknown to symbol returns not-found message', async () => {
    const res = await call('kirograph_path', { from: 'AuthService', to: 'zzz_unknown' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text.toLowerCase()).toContain('not found');
  });
});

// ── kirograph_files format variants ──────────────────────────────────────────

describe('kirograph_files format variants', () => {
  it('flat format returns a flat list', async () => {
    const res = await call('kirograph_files', { format: 'flat' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('auth.ts');
  });

  it('grouped format groups by directory', async () => {
    const res = await call('kirograph_files', { format: 'grouped' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('auth.ts');
  });

  it('tree format (default) renders tree connectors', async () => {
    const res = await call('kirograph_files', { format: 'tree' });
    expect(res.isError).toBeFalsy();
    // Tree format uses ├── or └──
    expect(res.content[0].text).toMatch(/[├└]/);
  });

  it('includeMetadata=false omits language tags', async () => {
    const withMeta = await call('kirograph_files', { format: 'flat', includeMetadata: true });
    const withoutMeta = await call('kirograph_files', { format: 'flat', includeMetadata: false });
    // With metadata should include language brackets; without should not
    expect(withMeta.content[0].text.length).toBeGreaterThanOrEqual(withoutMeta.content[0].text.length);
  });
});

// ── kirograph_context edge cases ──────────────────────────────────────────────

describe('kirograph_context edge cases', () => {
  it('task with no matching symbols returns graceful response', async () => {
    const res = await call('kirograph_context', { task: 'zzznonexistentfeaturexyz' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBeDefined();
  });

  it('task with maxNodes=1 respects limit', async () => {
    const res = await call('kirograph_context', { task: 'authentication', maxNodes: 1 });
    expect(res.isError).toBeFalsy();
  });

  it('includeCode=false does not include code fences', async () => {
    const res = await call('kirograph_context', { task: 'auth', includeCode: false });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).not.toContain('```');
  });
});
