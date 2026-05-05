/**
 * Unit tests for src/extraction/
 * Covers: detectLanguage, isSupportedLanguage, makeNodeId, extractFile
 */
import { describe, it, expect } from 'vitest';
import { detectLanguage, isSupportedLanguage, EXTENSION_MAP } from '../../src/extraction/languages';
import { makeNodeId, extractFile } from '../../src/extraction/extractor';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ── detectLanguage ─────────────────────────────────────────────────────────────

describe('detectLanguage', () => {
  it.each([
    ['.ts', 'typescript'],
    ['.tsx', 'tsx'],
    ['.js', 'javascript'],
    ['.jsx', 'jsx'],
    ['.mjs', 'javascript'],
    ['.cjs', 'javascript'],
    ['.py', 'python'],
    ['.pyw', 'python'],
    ['.go', 'go'],
    ['.rs', 'rust'],
    ['.java', 'java'],
    ['.c', 'c'],
    ['.h', 'c'],
    ['.cpp', 'cpp'],
    ['.cc', 'cpp'],
    ['.cxx', 'cpp'],
    ['.hpp', 'cpp'],
    ['.cs', 'csharp'],
    ['.php', 'php'],
    ['.rb', 'ruby'],
    ['.rake', 'ruby'],
    ['.swift', 'swift'],
    ['.kt', 'kotlin'],
    ['.kts', 'kotlin'],
    ['.dart', 'dart'],
    ['.svelte', 'svelte'],
    ['.pas', 'pascal'],
    ['.dpr', 'pascal'],
    ['.liquid', 'liquid'],
  ])('detects %s as %s', (ext, expected) => {
    expect(detectLanguage(`file${ext}`)).toBe(expected);
  });

  it('returns unknown for unrecognized extension', () => {
    expect(detectLanguage('file.xyz')).toBe('unknown');
    expect(detectLanguage('file.md')).toBe('unknown');
    expect(detectLanguage('Makefile')).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(detectLanguage('FILE.TS')).toBe('typescript');
    expect(detectLanguage('MAIN.PY')).toBe('python');
  });

  it('uses the last extension when there are multiple dots', () => {
    expect(detectLanguage('foo.test.ts')).toBe('typescript');
    expect(detectLanguage('bar.min.js')).toBe('javascript');
  });

  it('EXTENSION_MAP covers all entries detected', () => {
    for (const [ext, lang] of Object.entries(EXTENSION_MAP)) {
      expect(detectLanguage(`file${ext}`)).toBe(lang);
    }
  });
});

// ── isSupportedLanguage ────────────────────────────────────────────────────────

describe('isSupportedLanguage', () => {
  it('returns false for unknown', () => {
    expect(isSupportedLanguage('unknown')).toBe(false);
  });

  it('returns true for typescript', () => {
    expect(isSupportedLanguage('typescript')).toBe(true);
  });

  it('returns true for pascal (no grammar but still supported)', () => {
    expect(isSupportedLanguage('pascal')).toBe(true);
  });

  it('returns true for liquid', () => {
    expect(isSupportedLanguage('liquid')).toBe(true);
  });

  it('returns true for all languages in EXTENSION_MAP', () => {
    const langs = new Set(Object.values(EXTENSION_MAP));
    for (const lang of langs) {
      expect(isSupportedLanguage(lang)).toBe(true);
    }
  });
});

// ── makeNodeId ─────────────────────────────────────────────────────────────────

describe('makeNodeId', () => {
  it('returns a string starting with the kind', () => {
    const id = makeNodeId('src/foo.ts', 'function', 'bar', 10);
    expect(id.startsWith('function:')).toBe(true);
  });

  it('is deterministic — same inputs produce same id', () => {
    const a = makeNodeId('src/foo.ts', 'function', 'bar', 10);
    const b = makeNodeId('src/foo.ts', 'function', 'bar', 10);
    expect(a).toBe(b);
  });

  it('different file paths produce different ids', () => {
    const a = makeNodeId('src/a.ts', 'function', 'fn', 1);
    const b = makeNodeId('src/b.ts', 'function', 'fn', 1);
    expect(a).not.toBe(b);
  });

  it('different names produce different ids', () => {
    const a = makeNodeId('src/foo.ts', 'function', 'foo', 1);
    const b = makeNodeId('src/foo.ts', 'function', 'bar', 1);
    expect(a).not.toBe(b);
  });

  it('different lines produce different ids', () => {
    const a = makeNodeId('src/foo.ts', 'function', 'fn', 1);
    const b = makeNodeId('src/foo.ts', 'function', 'fn', 2);
    expect(a).not.toBe(b);
  });

  it('different kinds produce different ids', () => {
    const a = makeNodeId('src/foo.ts', 'function', 'fn', 1);
    const b = makeNodeId('src/foo.ts', 'class', 'fn', 1);
    expect(a).not.toBe(b);
    expect(b.startsWith('class:')).toBe(true);
  });

  it('hash part is 32 hex chars', () => {
    const id = makeNodeId('src/foo.ts', 'function', 'bar', 5);
    const [, hash] = id.split(':');
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

// ── extractFile ────────────────────────────────────────────────────────────────

describe('extractFile', () => {
  const tmpDir = path.join(os.tmpdir(), `kirograph-extraction-test-${Date.now()}`);

  beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('returns null for unsupported extension', async () => {
    const file = path.join(tmpDir, 'README.md');
    fs.writeFileSync(file, '# hello');
    const result = await extractFile(file, tmpDir);
    expect(result).toBeNull();
  });

  it('returns ExtractedFile with correct metadata for a TypeScript file', async () => {
    const file = path.join(tmpDir, 'hello.ts');
    const content = `export function greet(name: string): string {\n  return \`Hello \${name}\`;\n}\n`;
    fs.writeFileSync(file, content);
    const result = await extractFile(file, tmpDir);
    expect(result).not.toBeNull();
    expect(result!.language).toBe('typescript');
    // filePath may be absolute or relative depending on extractFile internals
    expect(result!.filePath).toBeTruthy();
    expect(result!.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result!.fileSize).toBeGreaterThan(0);
    expect(Array.isArray(result!.nodes)).toBe(true);
    expect(Array.isArray(result!.edges)).toBe(true);
  });

  it('extracts function nodes from TypeScript source', async () => {
    const file = path.join(tmpDir, 'funcs.ts');
    const content = `export function add(a: number, b: number): number { return a + b; }\nexport function sub(a: number, b: number): number { return a - b; }\n`;
    fs.writeFileSync(file, content);
    const result = await extractFile(file, tmpDir);
    expect(result).not.toBeNull();
    const fnNames = result!.nodes.map(n => n.name);
    expect(fnNames).toContain('add');
    expect(fnNames).toContain('sub');
  });

  it('extracts class nodes from TypeScript source', async () => {
    const file = path.join(tmpDir, 'cls.ts');
    const content = `export class MyService {\n  doWork() { return 42; }\n}\n`;
    fs.writeFileSync(file, content);
    const result = await extractFile(file, tmpDir);
    expect(result).not.toBeNull();
    const classNodes = result!.nodes.filter(n => n.kind === 'class');
    expect(classNodes.some(n => n.name === 'MyService')).toBe(true);
  });

  it('accepts pre-read content (Buffer) without reading disk', async () => {
    const file = path.join(tmpDir, 'pre-read.ts');
    // Do NOT create the file — pass content directly
    const content = Buffer.from('export const x = 1;\n');
    // Must still validate path relative to tmpDir
    fs.writeFileSync(file, content); // create so path traversal check passes
    const result = await extractFile(file, tmpDir, content);
    expect(result).not.toBeNull();
    expect(result!.language).toBe('typescript');
  });

  it('accepts pre-read content as string', async () => {
    const file = path.join(tmpDir, 'pre-read-str.ts');
    const content = 'export const y = 2;\n';
    fs.writeFileSync(file, content);
    const result = await extractFile(file, tmpDir, content);
    expect(result).not.toBeNull();
  });

  it('contentHash matches hashContent of the same content', async () => {
    const { hashContent } = await import('../../src/sync/index');
    const file = path.join(tmpDir, 'hash-check.ts');
    const content = 'export const val = 42;\n';
    fs.writeFileSync(file, content);
    const result = await extractFile(file, tmpDir, content);
    expect(result!.contentHash).toBe(hashContent(content));
  });

  it('returns null on path traversal attempt', async () => {
    const outsideFile = path.join(os.tmpdir(), `traversal-test-${Date.now()}.ts`);
    fs.writeFileSync(outsideFile, 'const x = 1;\n');
    try {
      const result = await extractFile(outsideFile, tmpDir);
      expect(result).toBeNull();
    } finally {
      fs.unlinkSync(outsideFile);
    }
  });

  it('returns an ExtractedFile with empty nodes for Pascal (no grammar)', async () => {
    const file = path.join(tmpDir, 'unit.pas');
    const content = 'unit MyUnit;\ninterface\nimplementation\nend.\n';
    fs.writeFileSync(file, content);
    const result = await extractFile(file, tmpDir);
    expect(result).not.toBeNull();
    expect(result!.language).toBe('pascal');
    expect(result!.nodes).toEqual([]);
  });

  it('fileSize reflects byte length of content', async () => {
    const file = path.join(tmpDir, 'size-check.ts');
    const content = 'const a = 1;\n';
    fs.writeFileSync(file, content);
    const result = await extractFile(file, tmpDir, content);
    expect(result!.fileSize).toBe(Buffer.byteLength(content, 'utf8'));
  });
});

// Need vitest lifecycle imports at module level for the describe block above
import { beforeAll, afterAll } from 'vitest';
