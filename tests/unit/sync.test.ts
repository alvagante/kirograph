/**
 * Unit tests for src/sync/index.ts
 * Covers: shouldIncludeFile, hashContent, getChangedFiles, scanDirectory
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldIncludeFile, hashContent } from '../../src/sync/index';
import type { KiroGraphConfig } from '../../src/config';

// Minimal config factory
function cfg(overrides: Partial<KiroGraphConfig> = {}): KiroGraphConfig {
  return {
    exclude: [],
    include: [],
    embeddingsEnabled: false,
    semanticEngine: 'cosine',
    enableArchitecture: false,
    maxNodes: 10,
    ...overrides,
  } as KiroGraphConfig;
}

// ── shouldIncludeFile ──────────────────────────────────────────────────────────

describe('shouldIncludeFile', () => {
  it('returns true when no include or exclude patterns', () => {
    expect(shouldIncludeFile('src/foo.ts', cfg())).toBe(true);
  });

  it('excludes a file matching an exact exclude pattern', () => {
    expect(shouldIncludeFile('node_modules/lib/a.js', cfg({ exclude: ['node_modules/**'] }))).toBe(false);
  });

  it('excludes nested paths matching glob', () => {
    expect(shouldIncludeFile('dist/bundle.js', cfg({ exclude: ['dist/**'] }))).toBe(false);
  });

  it('allows file not matching any exclude pattern', () => {
    expect(shouldIncludeFile('src/utils.ts', cfg({ exclude: ['dist/**'] }))).toBe(true);
  });

  it('include patterns filter in matching files', () => {
    const c = cfg({ include: ['src/**'] });
    expect(shouldIncludeFile('src/index.ts', c)).toBe(true);
  });

  it('include patterns filter out non-matching files', () => {
    const c = cfg({ include: ['src/**'] });
    expect(shouldIncludeFile('lib/index.ts', c)).toBe(false);
  });

  it('exclude takes priority over include', () => {
    const c = cfg({ include: ['src/**'], exclude: ['src/secret/**'] });
    expect(shouldIncludeFile('src/secret/key.ts', c)).toBe(false);
  });

  it('returns true for files matching include patterns without exclude', () => {
    const c = cfg({ include: ['**/*.ts'] });
    expect(shouldIncludeFile('deep/nested/file.ts', c)).toBe(true);
  });

  it('returns false for files not matching include pattern', () => {
    const c = cfg({ include: ['**/*.ts'] });
    expect(shouldIncludeFile('deep/nested/file.js', c)).toBe(false);
  });

  it('handles empty include array (no filtering by include)', () => {
    const c = cfg({ include: [] });
    expect(shouldIncludeFile('anything.go', c)).toBe(true);
  });

  it('handles multiple exclude patterns', () => {
    const c = cfg({ exclude: ['node_modules/**', 'dist/**', '**/*.log'] });
    expect(shouldIncludeFile('app.log', c)).toBe(false);
    expect(shouldIncludeFile('dist/out.js', c)).toBe(false);
    expect(shouldIncludeFile('src/app.ts', c)).toBe(true);
  });

  it('handles multiple include patterns (OR logic)', () => {
    const c = cfg({ include: ['src/**', 'lib/**'] });
    expect(shouldIncludeFile('src/a.ts', c)).toBe(true);
    expect(shouldIncludeFile('lib/b.ts', c)).toBe(true);
    expect(shouldIncludeFile('other/c.ts', c)).toBe(false);
  });

  it('does not throw on invalid glob patterns', () => {
    const c = cfg({ exclude: ['[invalid'] });
    expect(() => shouldIncludeFile('foo.ts', c)).not.toThrow();
  });
});

// ── hashContent ────────────────────────────────────────────────────────────────

describe('hashContent', () => {
  it('returns a 64-char hex string', () => {
    const h = hashContent('hello world');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same string input', () => {
    expect(hashContent('test content')).toBe(hashContent('test content'));
  });

  it('is deterministic for the same Buffer input', () => {
    const buf = Buffer.from('test content');
    expect(hashContent(buf)).toBe(hashContent(buf));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashContent('content A')).not.toBe(hashContent('content B'));
  });

  it('string and equivalent Buffer produce the same hash', () => {
    const str = 'hello';
    const buf = Buffer.from(str, 'utf8');
    expect(hashContent(str)).toBe(hashContent(buf));
  });

  it('handles empty string', () => {
    const h = hashContent('');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('empty string hash differs from non-empty', () => {
    expect(hashContent('')).not.toBe(hashContent('a'));
  });
});

// ── getChangedFiles (integration) ─────────────────────────────────────────────
// These run in an actual git repo (the project root), so we only assert shapes.

describe('getChangedFiles (live git)', () => {
  it('returns { added, modified, removed } arrays', async () => {
    const { getChangedFiles } = await import('../../src/sync/index');
    const result = await getChangedFiles(process.cwd(), cfg());
    expect(Array.isArray(result.added)).toBe(true);
    expect(Array.isArray(result.modified)).toBe(true);
    expect(Array.isArray(result.removed)).toBe(true);
  });

  it('only returns files with a known language extension', async () => {
    const { getChangedFiles } = await import('../../src/sync/index');
    const { detectLanguage } = await import('../../src/extraction/languages');
    const result = await getChangedFiles(process.cwd(), cfg());
    const all = [...result.added, ...result.modified, ...result.removed];
    for (const f of all) {
      expect(detectLanguage(f)).not.toBe('unknown');
    }
  });
});

// ── scanDirectory (integration) ───────────────────────────────────────────────

describe('scanDirectory (live fs)', () => {
  it('returns an array of absolute paths', async () => {
    const { scanDirectory } = await import('../../src/sync/index');
    const srcDir = new URL('../../src', import.meta.url).pathname;
    const results = await scanDirectory(srcDir, cfg({ exclude: ['node_modules/**'] }));
    expect(Array.isArray(results)).toBe(true);
    for (const p of results.slice(0, 5)) {
      expect(p.startsWith('/')).toBe(true);
    }
  });

  it('respects exclude patterns', async () => {
    const { scanDirectory } = await import('../../src/sync/index');
    const srcDir = new URL('../../src', import.meta.url).pathname;
    // Exclude all TypeScript files — should return far fewer results
    const withExclude = await scanDirectory(srcDir, cfg({ exclude: ['**/*.ts'] }));
    const withoutExclude = await scanDirectory(srcDir, cfg());
    expect(withExclude.length).toBeLessThan(withoutExclude.length);
  });

  it('returns empty array when aborted before start', async () => {
    const { scanDirectory } = await import('../../src/sync/index');
    const controller = new AbortController();
    controller.abort();
    const results = await scanDirectory(process.cwd(), cfg(), controller.signal);
    expect(results).toEqual([]);
  });
});
