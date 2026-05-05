import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { Command } from 'commander';
import KiroGraph from '../../src/index';
import { openFixtureCopy, cleanupTmp, FIXTURE_PATH } from '../helpers/fixture';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Run a registered command against a fresh Commander program. Returns stdout lines captured via mock. */
async function runCommand(
  register: (p: Command) => void,
  args: string[],
): Promise<{ exitCode: number; output: string; error: string }> {
  const lines: string[] = [];
  const errLines: string[] = [];
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  console.log  = (...a: unknown[]) => lines.push(a.map(String).join(' '));
  console.error = (...a: unknown[]) => errLines.push(a.map(String).join(' '));

  const program = new Command();
  program.exitOverride(); // prevent process.exit
  register(program);

  let exitCode = 0;
  try {
    await program.parseAsync(['node', 'kirograph', ...args]);
  } catch (e: any) {
    exitCode = e.exitCode ?? 1;
    errLines.push(String(e.message ?? e));
  } finally {
    console.log  = origLog;
    console.error = origErr;
  }

  return { exitCode, output: lines.join('\n'), error: errLines.join('\n') };
}

// ── Uninitialized directory ───────────────────────────────────────────────────

describe('commands on uninitialized directory', () => {
  let emptyDir: string;
  beforeAll(() => { emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-empty-')); });
  afterAll(() => { fs.rmSync(emptyDir, { recursive: true, force: true }); });

  it('KiroGraph.open() throws with helpful message', async () => {
    await expect(KiroGraph.open(emptyDir)).rejects.toThrow(/not initialized/i);
  });

  it('KiroGraph.open() error mentions kirograph init', async () => {
    try {
      await KiroGraph.open(emptyDir);
    } catch (e: any) {
      expect(e.message.toLowerCase()).toMatch(/init/);
    }
  });
});

// ── searchNodes FTS5 edge cases (via KiroGraph API) ───────────────────────────

describe('searchNodes() FTS5 injection safety', () => {
  let kg: KiroGraph;
  beforeAll(async () => { kg = await KiroGraph.open(FIXTURE_PATH); });
  afterAll(() => kg?.close());

  const INJECTIONS = [
    'OR DROP TABLE nodes',
    '"unclosed quote',
    '*',
    'AND NOT b',
    'NEAR(foo bar)',
    'a OR OR b',
    'a AND AND b',
    '\x00null byte',
    'a'.repeat(1000),
  ];

  for (const input of INJECTIONS) {
    it(`does not throw for: ${JSON.stringify(input.slice(0, 40))}`, () => {
      expect(() => kg.searchNodes(input)).not.toThrow();
    });

    it(`returns an array for: ${JSON.stringify(input.slice(0, 40))}`, () => {
      expect(Array.isArray(kg.searchNodes(input))).toBe(true);
    });
  }
});

// ── query command ─────────────────────────────────────────────────────────────

describe('kirograph query command', () => {
  it('finds AuthService via query command', async () => {
    const { register } = await import('../../src/bin/commands/query');
    const result = await runCommand(register, ['query', 'AuthService', FIXTURE_PATH]);
    expect(result.output + result.error).toContain('AuthService');
  });

  it('returns no results for nonexistent symbol', async () => {
    const { register } = await import('../../src/bin/commands/query');
    const { output } = await runCommand(register, ['query', 'zzz_nonexistent_xyz', FIXTURE_PATH]);
    expect(output.toLowerCase()).toMatch(/no results|0 result|^$/);
  });

  it('does not throw on FTS5 injection via CLI', async () => {
    const { register } = await import('../../src/bin/commands/query');
    await expect(
      runCommand(register, ['query', '"unclosed OR DROP TABLE', FIXTURE_PATH])
    ).resolves.toBeDefined();
  });
});

// ── dirty marker / lock ───────────────────────────────────────────────────────

describe('dirty marker', () => {
  let kg: KiroGraph;
  let tmpDir: string;

  beforeAll(async () => { ({ kg, tmpDir } = await openFixtureCopy()); });
  afterAll(() => { kg?.close(); cleanupTmp(tmpDir); });

  it('isDirty() is false on a fresh copy', () => {
    expect(kg.isDirty()).toBe(false);
  });

  it('isDirty() is true after markDirty()', () => {
    kg.markDirty();
    expect(kg.isDirty()).toBe(true);
  });

  it('isDirty() is false after clearDirty()', () => {
    kg.markDirty();
    kg.clearDirty();
    expect(kg.isDirty()).toBe(false);
  });

  it('syncIfDirty() returns null when not dirty', async () => {
    kg.clearDirty();
    expect(await kg.syncIfDirty()).toBeNull();
  });
});

// ── findNearestKiroGraphRoot ──────────────────────────────────────────────────

describe('findNearestKiroGraphRoot()', () => {
  it('finds the fixture root from a subdirectory', async () => {
    const { findNearestKiroGraphRoot } = await import('../../src/index');
    const subdir = path.join(FIXTURE_PATH, 'src');
    const found = findNearestKiroGraphRoot(subdir);
    expect(found).toBe(path.resolve(FIXTURE_PATH));
  });

  it('returns null for a directory with no .kirograph ancestor', async () => {
    const { findNearestKiroGraphRoot } = await import('../../src/index');
    expect(findNearestKiroGraphRoot(os.tmpdir())).toBeNull();
  });
});
