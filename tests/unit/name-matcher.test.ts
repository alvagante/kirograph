import { describe, it, expect } from 'vitest';
import { matchReference } from '../../src/resolution/name-matcher';
import type { Node } from '../../src/types';

function makeNode(id: string, name: string, qualifiedName = name): Node {
  return {
    id,
    kind: 'function',
    name,
    qualifiedName,
    filePath: 'src/test.ts',
    language: 'typescript',
    startLine: 1,
    endLine: 5,
    startColumn: 0,
    endColumn: 0,
    isExported: false,
    isAsync: false,
    isStatic: false,
    isAbstract: false,
    updatedAt: Date.now(),
  };
}

describe('matchReference()', () => {
  const nodes = [
    makeNode('fn:a', 'validateToken', 'auth::validateToken'),
    makeNode('fn:b', 'hashPassword', 'auth::hashPassword'),
    makeNode('fn:c', 'AuthService', 'module::AuthService'),
  ];

  // ── Strategy 1: qualified name ─────────────────────────────────────────────

  it('matches by qualified name (confidence 0.95)', () => {
    const result = matchReference('auth::validateToken', nodes, 0.0);
    expect(result).not.toBeNull();
    expect(result!.strategy).toBe('qualified');
    expect(result!.confidence).toBe(0.95);
    expect(result!.nodeId).toBe('fn:a');
  });

  it('qualified match respects threshold', () => {
    // threshold 0.96 exceeds qualified confidence of 0.95
    const result = matchReference('auth::validateToken', nodes, 0.96);
    expect(result).toBeNull();
  });

  // ── Strategy 2: exact name ─────────────────────────────────────────────────

  it('matches by exact name (confidence 0.90)', () => {
    const result = matchReference('validateToken', nodes, 0.0);
    expect(result).not.toBeNull();
    expect(result!.strategy).toBe('exact');
    expect(result!.confidence).toBe(0.9);
    expect(result!.nodeId).toBe('fn:a');
  });

  it('exact name does not match partial names', () => {
    const result = matchReference('validate', nodes, 0.0);
    expect(result).toBeNull();
  });

  it('exact match respects threshold', () => {
    // threshold 0.91 exceeds exact confidence of 0.90
    const result = matchReference('validateToken', nodes, 0.91);
    expect(result).toBeNull();
  });

  // ── Strategy 3: method call pattern ──────────────────────────────────────

  it('matches method call pattern (obj.method) at confidence 0.85', () => {
    const result = matchReference('service.validateToken', nodes, 0.0);
    expect(result).not.toBeNull();
    expect(result!.strategy).toBe('method');
    expect(result!.confidence).toBe(0.85);
    expect(result!.nodeId).toBe('fn:a');
  });

  it('method pattern: uses last segment of deep chain', () => {
    const result = matchReference('a.b.c.hashPassword', nodes, 0.0);
    expect(result!.strategy).toBe('method');
    expect(result!.nodeId).toBe('fn:b');
  });

  it('method pattern respects threshold', () => {
    const result = matchReference('x.validateToken', nodes, 0.9);
    expect(result).toBeNull();
  });

  // ── Strategy 4: fuzzy / lowercase ────────────────────────────────────────

  it('matches case-insensitively (confidence 0.50)', () => {
    const result = matchReference('VALIDATETOKEN', nodes, 0.0);
    expect(result).not.toBeNull();
    expect(result!.strategy).toBe('fuzzy');
    expect(result!.confidence).toBe(0.5);
  });

  it('fuzzy match respects threshold', () => {
    // threshold 0.51 exceeds fuzzy confidence of 0.50
    const result = matchReference('VALIDATETOKEN', nodes, 0.51);
    expect(result).toBeNull();
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('returns null for empty refName', () => {
    expect(matchReference('', nodes, 0.0)).toBeNull();
  });

  it('returns null for empty candidates', () => {
    expect(matchReference('validateToken', [], 0.0)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(matchReference('zzzNonExistent', nodes, 0.0)).toBeNull();
  });

  it('prefers qualified match over exact match', () => {
    // Both strategies could match; qualified should win
    const mixed = [
      makeNode('fn:exact', 'auth::validateToken'),      // exact name = 'auth::validateToken'
      makeNode('fn:qual', 'validateToken', 'auth::validateToken'), // qualified = 'auth::validateToken'
    ];
    const result = matchReference('auth::validateToken', mixed, 0.0);
    // qualified strategy fires first
    expect(result!.strategy).toBe('qualified');
  });

  it('returns correct nodeId for second candidate', () => {
    const result = matchReference('hashPassword', nodes, 0.0);
    expect(result!.nodeId).toBe('fn:b');
  });
});
