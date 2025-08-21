import { describe, it, expect } from 'vitest';
import levenshtein from 'js-levenshtein';

function fuzzyScore(a: string, b: string) {
  const d = levenshtein(a, b);
  const L = Math.max(a.length, b.length) || 1;
  return 1 - d / L;
}

describe('fuzzyScore', () => {
  it('returns 1 for identical strings', () => {
    expect(fuzzyScore('hello', 'hello')).toBe(1);
  });
  it('is high for small edits', () => {
    expect(fuzzyScore('acme corp', 'acme-corp')).toBeGreaterThan(0.8);
  });
  it('is low for distinct strings', () => {
    expect(fuzzyScore('alpha', 'omega')).toBeLessThan(0.5);
  });
});
