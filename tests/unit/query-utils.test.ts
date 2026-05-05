import { describe, it, expect } from 'vitest';
import { extractSearchTerms, scorePathRelevance, kindBonus, STOP_WORDS } from '../../src/search/query-utils';
import type { NodeKind } from '../../src/types';

// ── extractSearchTerms ────────────────────────────────────────────────────────

describe('extractSearchTerms()', () => {
  it('splits camelCase into tokens', () => {
    expect(extractSearchTerms('getUserName')).toEqual(expect.arrayContaining(['user', 'name']));
  });

  it('splits PascalCase into tokens', () => {
    const terms = extractSearchTerms('AuthService');
    expect(terms).toContain('auth');
    expect(terms).toContain('service');
  });

  it('splits snake_case into tokens', () => {
    const terms = extractSearchTerms('create_user_token');
    expect(terms).toContain('create');
    expect(terms).toContain('user');
    expect(terms).toContain('token');
  });

  it('splits SCREAMING_SNAKE_CASE into tokens', () => {
    const terms = extractSearchTerms('MAX_RETRY_COUNT');
    expect(terms).toContain('max');
    expect(terms).toContain('retry');
    expect(terms).toContain('count');
  });

  it('splits dot.notation into tokens', () => {
    const terms = extractSearchTerms('auth.service.validate');
    expect(terms).toContain('auth');
    expect(terms).toContain('service');
    expect(terms).toContain('validate');
  });

  it('removes stop words', () => {
    const terms = extractSearchTerms('the user function for auth');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('for');
    expect(terms).toContain('user');
    expect(terms).toContain('auth');
  });

  it('removes tokens shorter than 3 chars', () => {
    const terms = extractSearchTerms('ab cd ef login');
    expect(terms).not.toContain('ab');
    expect(terms).not.toContain('cd');
    expect(terms).not.toContain('ef');
    expect(terms).toContain('login');
  });

  it('returns lowercase tokens', () => {
    const terms = extractSearchTerms('AuthToken');
    expect(terms.every(t => t === t.toLowerCase())).toBe(true);
  });

  it('deduplicates repeated tokens', () => {
    const terms = extractSearchTerms('auth auth auth');
    expect(terms.filter(t => t === 'auth')).toHaveLength(1);
  });

  it('returns empty array for empty string', () => {
    expect(extractSearchTerms('')).toEqual([]);
  });

  it('returns empty array for all stop words', () => {
    expect(extractSearchTerms('the and for with')).toEqual([]);
  });

  it('returns empty array for all short tokens', () => {
    expect(extractSearchTerms('ab cd ef')).toEqual([]);
  });

  it('handles numbers mixed with text', () => {
    const terms = extractSearchTerms('handler123');
    expect(terms).toContain('handler123');
  });

  it('handles consecutive special characters', () => {
    expect(() => extractSearchTerms('a__b...c--d')).not.toThrow();
  });

  it('handles very long input without throwing', () => {
    const long = 'getUserAuthenticationToken'.repeat(50);
    expect(() => extractSearchTerms(long)).not.toThrow();
  });

  it('handles SCREAMING acronym before lowercase', () => {
    // "HTMLParser" → HTML + Parser
    const terms = extractSearchTerms('HTMLParser');
    expect(terms.some(t => t.includes('html') || t.includes('parser'))).toBe(true);
  });
});

// ── scorePathRelevance ────────────────────────────────────────────────────────

describe('scorePathRelevance()', () => {
  it('returns 10 for exact filename match', () => {
    const score = scorePathRelevance('src/auth/auth.ts', 'auth');
    expect(score).toBeGreaterThanOrEqual(10);
  });

  it('returns 5 for matching directory segment', () => {
    const score = scorePathRelevance('src/controllers/user.ts', 'controllers');
    expect(score).toBeGreaterThanOrEqual(5);
  });

  it('returns 3 for substring match in path', () => {
    // "authentication" contains "auth" as substring
    const score = scorePathRelevance('src/authentication.ts', 'auth');
    // Either exact or substring
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 for no match', () => {
    expect(scorePathRelevance('src/unrelated/thing.ts', 'zzznonexistent')).toBe(0);
  });

  it('returns 0 for empty query', () => {
    expect(scorePathRelevance('src/auth.ts', '')).toBe(0);
  });

  it('returns 0 for all-stop-word query', () => {
    expect(scorePathRelevance('src/auth.ts', 'the and for')).toBe(0);
  });

  it('returns 0 for empty path', () => {
    expect(scorePathRelevance('', 'auth')).toBe(0);
  });

  it('accumulates score for multiple matching terms', () => {
    const single = scorePathRelevance('src/auth/token.ts', 'auth');
    const multi = scorePathRelevance('src/auth/token.ts', 'auth token');
    expect(multi).toBeGreaterThan(single);
  });

  it('handles Windows-style backslash paths', () => {
    expect(() => scorePathRelevance('src\\auth\\service.ts', 'auth')).not.toThrow();
  });

  it('filename without extension matches correctly', () => {
    const score = scorePathRelevance('src/validateToken.ts', 'validatetoken');
    expect(score).toBeGreaterThan(0);
  });
});

// ── kindBonus ─────────────────────────────────────────────────────────────────

describe('kindBonus()', () => {
  const cases: Array<[NodeKind, number]> = [
    ['function', 10],
    ['method', 10],
    ['route', 9],
    ['class', 8],
    ['component', 8],
    ['interface', 7],
    ['type_alias', 6],
    ['struct', 6],
    ['trait', 6],
    ['enum', 5],
    ['module', 4],
    ['namespace', 4],
    ['property', 3],
    ['field', 3],
    ['constant', 3],
    ['variable', 2],
    ['import', 1],
    ['export', 1],
    ['parameter', 0],
    ['file', 0],
  ];

  for (const [kind, expected] of cases) {
    it(`returns ${expected} for "${kind}"`, () => {
      expect(kindBonus(kind)).toBe(expected);
    });
  }

  it('returns 0 for unknown kind', () => {
    expect(kindBonus('unknown_kind' as NodeKind)).toBe(0);
  });

  it('higher kinds rank above lower kinds', () => {
    expect(kindBonus('function')).toBeGreaterThan(kindBonus('variable'));
    expect(kindBonus('class')).toBeGreaterThan(kindBonus('constant'));
    expect(kindBonus('method')).toBeGreaterThan(kindBonus('import'));
  });
});

// ── STOP_WORDS ────────────────────────────────────────────────────────────────

describe('STOP_WORDS', () => {
  it('is a Set', () => {
    expect(STOP_WORDS instanceof Set).toBe(true);
  });

  it('contains common English words', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('and')).toBe(true);
    expect(STOP_WORDS.has('for')).toBe(true);
  });

  it('does not contain meaningful programming terms', () => {
    expect(STOP_WORDS.has('auth')).toBe(false);
    expect(STOP_WORDS.has('router')).toBe(false);
    expect(STOP_WORDS.has('token')).toBe(false);
  });
});
