import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  createDefaultConfig,
  validateConfig,
  loadConfig,
  saveConfig,
  updateConfig,
  addIncludePatterns,
  addExcludePatterns,
  shouldIncludeFile,
  isSafeRegex,
} from '../../src/config';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-cfg-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── isSafeRegex ───────────────────────────────────────────────────────────────

describe('isSafeRegex()', () => {
  it('returns true for safe glob patterns', () => {
    expect(isSafeRegex('src/**/*.ts')).toBe(true);
    expect(isSafeRegex('*.min.js')).toBe(true);
    expect(isSafeRegex('node_modules/**')).toBe(true);
  });

  it('returns false for patterns longer than 100 chars', () => {
    expect(isSafeRegex('a'.repeat(101))).toBe(false);
  });

  it('returns false for nested quantifiers', () => {
    expect(isSafeRegex('(a+)+')).toBe(false);
    expect(isSafeRegex('(a*)*')).toBe(false);
    expect(isSafeRegex('(a+)*')).toBe(false);
  });

  it('returns false for alternation with quantifiers', () => {
    expect(isSafeRegex('(a|b)+')).toBe(false);
  });

  it('returns true for 100-char pattern exactly', () => {
    expect(isSafeRegex('a'.repeat(100))).toBe(true);
  });
});

// ── createDefaultConfig ───────────────────────────────────────────────────────

describe('createDefaultConfig()', () => {
  it('returns an object with expected defaults', () => {
    const cfg = createDefaultConfig();
    expect(cfg.version).toBe(1);
    expect(cfg.enableEmbeddings).toBe(false);
    expect(cfg.semanticEngine).toBe('cosine');
    expect(cfg.minLogLevel).toBe('warn');
    expect(cfg.cavemanMode).toBe('off');
    expect(cfg.exclude).toContain('node_modules/**');
  });

  it('default exclude includes common build dirs', () => {
    const cfg = createDefaultConfig();
    expect(cfg.exclude).toContain('dist/**');
    expect(cfg.exclude).toContain('build/**');
    expect(cfg.exclude).toContain('.git/**');
  });
});

// ── validateConfig ────────────────────────────────────────────────────────────

describe('validateConfig()', () => {
  it('returns defaults for null input', () => {
    const cfg = validateConfig(null);
    expect(cfg.version).toBe(1);
  });

  it('returns defaults for non-object input', () => {
    expect(validateConfig('string').version).toBe(1);
    expect(validateConfig(42).version).toBe(1);
    expect(validateConfig([]).version).toBe(1);
  });

  it('coerces valid fields', () => {
    const cfg = validateConfig({
      version: 2,
      enableEmbeddings: true,
      embeddingModel: 'custom-model',
      minLogLevel: 'debug',
      cavemanMode: 'lite',
      enableArchitecture: true,
    });
    expect(cfg.version).toBe(2);
    expect(cfg.enableEmbeddings).toBe(true);
    expect(cfg.embeddingModel).toBe('custom-model');
    expect(cfg.minLogLevel).toBe('debug');
    expect(cfg.cavemanMode).toBe('lite');
    expect(cfg.enableArchitecture).toBe(true);
  });

  it('falls back to defaults for invalid field values', () => {
    const cfg = validateConfig({
      maxFileSize: -1,       // invalid: must be > 0
      embeddingDim: 0,       // invalid: must be > 0
      minLogLevel: 'verbose', // invalid: not in set
      cavemanMode: 'turbo',  // invalid: not in set
      semanticEngine: 'unknown', // invalid
    });
    expect(cfg.maxFileSize).toBe(1_048_576);
    expect(cfg.embeddingDim).toBe(768);
    expect(cfg.minLogLevel).toBe('warn');
    expect(cfg.cavemanMode).toBe('off');
    expect(cfg.semanticEngine).toBe('cosine');
  });

  it('accepts all valid semanticEngine values', () => {
    const engines = ['cosine', 'sqlite-vec', 'orama', 'pglite', 'lancedb', 'qdrant', 'typesense'];
    for (const engine of engines) {
      expect(validateConfig({ semanticEngine: engine }).semanticEngine).toBe(engine);
    }
  });

  it('useVecIndex=true maps to semanticEngine=sqlite-vec when no explicit engine', () => {
    const cfg = validateConfig({ useVecIndex: true });
    expect(cfg.semanticEngine).toBe('sqlite-vec');
  });

  it('explicit semanticEngine wins over useVecIndex', () => {
    const cfg = validateConfig({ useVecIndex: true, semanticEngine: 'orama' });
    expect(cfg.semanticEngine).toBe('orama');
  });

  it('filters unsafe regex patterns from exclude', () => {
    const cfg = validateConfig({ exclude: ['safe/**', '(a+)+'] });
    expect(cfg.exclude).toContain('safe/**');
    expect(cfg.exclude).not.toContain('(a+)+');
  });

  it('filters unsafe regex patterns from include', () => {
    const cfg = validateConfig({ include: ['src/**', '(a|b)+'] });
    expect(cfg.include).toContain('src/**');
    expect(cfg.include).not.toContain('(a|b)+');
  });

  it('validates architectureLayers', () => {
    const cfg = validateConfig({
      architectureLayers: { api: ['src/routes/**'], db: ['src/db/**'] }
    });
    expect(cfg.architectureLayers?.api).toEqual(['src/routes/**']);
    expect(cfg.architectureLayers?.db).toEqual(['src/db/**']);
  });

  it('rejects architectureLayers that is not an object', () => {
    const cfg = validateConfig({ architectureLayers: 'invalid' });
    expect(cfg.architectureLayers).toBeUndefined();
  });

  it('fuzzyResolutionThreshold: accepts 0 and 1 boundaries', () => {
    expect(validateConfig({ fuzzyResolutionThreshold: 0 }).fuzzyResolutionThreshold).toBe(0);
    expect(validateConfig({ fuzzyResolutionThreshold: 1 }).fuzzyResolutionThreshold).toBe(1);
  });

  it('fuzzyResolutionThreshold: rejects values outside [0, 1]', () => {
    expect(validateConfig({ fuzzyResolutionThreshold: -0.1 }).fuzzyResolutionThreshold).toBe(0.5);
    expect(validateConfig({ fuzzyResolutionThreshold: 1.1 }).fuzzyResolutionThreshold).toBe(0.5);
  });
});

// ── loadConfig / saveConfig ───────────────────────────────────────────────────

describe('loadConfig() / saveConfig()', () => {
  it('creates default config file when none exists', async () => {
    const cfg = await loadConfig(tmpDir);
    expect(cfg.version).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, '.kirograph', 'config.json'))).toBe(true);
  });

  it('round-trips config via saveConfig/loadConfig', async () => {
    const cfg = createDefaultConfig();
    cfg.enableEmbeddings = true;
    cfg.minLogLevel = 'debug';
    await saveConfig(tmpDir, cfg);
    const loaded = await loadConfig(tmpDir);
    expect(loaded.enableEmbeddings).toBe(true);
    expect(loaded.minLogLevel).toBe('debug');
  });

  it('returns defaults when config file has invalid JSON', async () => {
    const dir = path.join(tmpDir, '.kirograph');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), '{ invalid json }');
    const cfg = await loadConfig(tmpDir);
    expect(cfg.version).toBe(1);
  });
});

// ── updateConfig ──────────────────────────────────────────────────────────────

describe('updateConfig()', () => {
  it('merges patch into existing config', async () => {
    await saveConfig(tmpDir, createDefaultConfig());
    const updated = await updateConfig(tmpDir, { minLogLevel: 'debug', enableArchitecture: true });
    expect(updated.minLogLevel).toBe('debug');
    expect(updated.enableArchitecture).toBe(true);
  });
});

// ── addIncludePatterns / addExcludePatterns ───────────────────────────────────

describe('addIncludePatterns() / addExcludePatterns()', () => {
  it('adds new include patterns', async () => {
    await saveConfig(tmpDir, createDefaultConfig());
    await addIncludePatterns(tmpDir, ['src/**/*.ts']);
    const cfg = await loadConfig(tmpDir);
    expect(cfg.include).toContain('src/**/*.ts');
  });

  it('does not duplicate existing include patterns', async () => {
    await saveConfig(tmpDir, { ...createDefaultConfig(), include: ['src/**/*.ts'] });
    await addIncludePatterns(tmpDir, ['src/**/*.ts']);
    const cfg = await loadConfig(tmpDir);
    expect(cfg.include.filter(p => p === 'src/**/*.ts')).toHaveLength(1);
  });

  it('adds new exclude patterns', async () => {
    await saveConfig(tmpDir, createDefaultConfig());
    await addExcludePatterns(tmpDir, ['coverage/**']);
    const cfg = await loadConfig(tmpDir);
    expect(cfg.exclude).toContain('coverage/**');
  });

  it('ignores unsafe patterns in addIncludePatterns', async () => {
    await saveConfig(tmpDir, createDefaultConfig());
    await addIncludePatterns(tmpDir, ['(a+)+']);
    const cfg = await loadConfig(tmpDir);
    expect(cfg.include).not.toContain('(a+)+');
  });
});

// ── shouldIncludeFile ─────────────────────────────────────────────────────────

describe('shouldIncludeFile()', () => {
  const cfg = createDefaultConfig(); // exclude has node_modules/**, dist/**

  it('excludes files matching exclude patterns', () => {
    expect(shouldIncludeFile(cfg, 'node_modules/lodash/index.js')).toBe(false);
    expect(shouldIncludeFile(cfg, 'dist/bundle.js')).toBe(false);
  });

  it('includes files not matching any exclude pattern', () => {
    expect(shouldIncludeFile(cfg, 'src/auth.ts')).toBe(true);
    expect(shouldIncludeFile(cfg, 'tests/helpers.ts')).toBe(true);
  });

  it('when include is set, only includes matching files', () => {
    const withInclude = { ...cfg, include: ['src/**'] };
    expect(shouldIncludeFile(withInclude, 'src/auth.ts')).toBe(true);
    expect(shouldIncludeFile(withInclude, 'tests/auth.test.ts')).toBe(false);
  });

  it('exclude takes priority over include', () => {
    // dist/ is in exclude, even if user adds it to include
    const withBoth = { ...cfg, include: ['dist/**'] };
    expect(shouldIncludeFile(withBoth, 'dist/bundle.js')).toBe(false);
  });
});
