import { describe, it, expect } from 'vitest';
import { RuleEngine, RuleSet } from '../lib/rules-engine';

describe('RuleEngine validators', () => {
  const ruleSet: RuleSet = {
    name: 'Test', version: 1,
    rules: [
      { id: 'req', label: 'req', appliesTo: ['x'], validator: 'required', enabled: true, severity: 'error' },
      { id: 'email', label: 'email', appliesTo: ['email'], validator: 'email', enabled: true, fix: { strategy: 'auto_fix' } },
      { id: 'enum', label: 'enum', appliesTo: ['cat'], validator: 'enum', enabled: true, params: { allowed: ['A','B'], synonyms: { Alpha: 'A' } }, fix: { strategy: 'auto_fix' } },
    ],
  };

  it('required fails on empty', async () => {
    const e = new RuleEngine(ruleSet);
    const res = await e.applyRow({ x: '' } as any, '1');
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it('email normalizes to lowercase', async () => {
    const e = new RuleEngine(ruleSet);
    const res = await e.applyRow({ x: 'ok', email: 'USER@EXAMPLE.COM' } as any, '1');
    expect(res.normalizedRow.email).toBe('user@example.com');
  });

  it('enum maps synonym', async () => {
    const e = new RuleEngine(ruleSet);
    const res = await e.applyRow({ x: 'ok', cat: 'Alpha' } as any, '1');
    expect(res.normalizedRow.cat).toBe('A');
  });
});
