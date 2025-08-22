/*
  lib-rules-engine — Batch 1
  -------------------------------------
  Core deterministic rule engine for data normalization & validation.
  - Rule/Issue types
  - Built-in validators (required, regex, enum+synonyms+fuzzy, range, date_format, email, phone, url)
  - Country/state mapping hook (pluggable)
  - Execution over a single row or arrays of rows (chunk)
  - Fix strategies: auto_fix, suggest_only, none (llm_suggest is a placeholder for later batches)

  External deps expected (add to package.json in infra batch):
    - js-levenshtein
    - libphonenumber-js
    - dayjs
    - validator (for URL/email hardening)

  Usage (sketch):
    const engine = new RuleEngine(ruleSet, { dictionaries });
    const { normalizedRow, issues } = engine.applyRow(row, 'row-1');
    // or
    const results = await engine.applyChunk(rows, (res) => {
      // stream handler per row
    });
*/

import levenshtein from 'js-levenshtein';
import dayjs from 'dayjs';
import isEmail from 'validator/lib/isEmail';
import isURL from 'validator/lib/isURL';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

// --------------------------
// Types
// --------------------------
export type Severity = 'info' | 'warning' | 'error';
export type FixStrategy = 'auto_fix' | 'suggest_only' | 'llm_suggest' | 'none';

export interface Rule {
  id: string;
  label: string;
  appliesTo: string[]; // field names ("*" means all fields)
  validator:
    | 'required'
    | 'regex'
    | 'enum'
    | 'range'
    | 'date_format'
    | 'email'
    | 'phone'
    | 'url'
    | 'country'
    | 'state'
    | 'custom_code'
    | 'llm_review';
  params?: Record<string, any>;
  fix?: { strategy: FixStrategy };
  severity?: Severity;
  enabled: boolean;
}

export interface RuleSet {
  name: string;
  version: number;
  rules: Rule[];
  dictionaries?: Record<string, any>;
  pii?: { fields: string[] };
}

export interface ValidationResult {
  valid: boolean;
  normalized?: any;
  problem?: string;
  suggestion?: any;
  confidence?: number; // 0..1
}

export interface Issue {
  rowId: string | number;
  field: string;
  ruleId: string;
  severity: Severity;
  problem: string;
  suggestion?: any;
  confidence?: number;
  source: 'deterministic' | 'llm' | 'web';
  status?: 'open' | 'accepted' | 'rejected';
}

export interface ApplyRowResult<RowT extends Record<string, any>> {
  normalizedRow: RowT;
  issues: Issue[];
}

export interface EngineOptions {
  defaultCountry?: string; // for phone parsing (e.g., 'US')
  dictionaries?: Record<string, any>;
  customCodeRegistry?: Record<string, (value: any, params: any, row: any, ctx: RuleContext) => ValidationResult>;
  countryMapper?: (value: string) => string | null; // map to ISO2
  stateMapper?: (value: string, country?: string) => string | null; // e.g., US states
  fuzzyMaxDistance?: number; // for enum fuzzy
}

export interface RuleContext {
  rule: Rule;
  field: string;
  rowId: string | number;
  row: Record<string, any>;
  options: EngineOptions;
  dictionaries?: Record<string, any>;
}

// --------------------------
// Helpers
// --------------------------
const isEmpty = (v: any) => v === undefined || v === null || String(v).trim() === '';
const toStr = (v: any) => (v === undefined || v === null ? '' : String(v));

function clamp01(n?: number) {
  if (typeof n !== 'number' || Number.isNaN(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

function safeLower(s: any) {
  return s == null ? '' : String(s).toLowerCase();
}

// --------------------------
// Built-in validators
// --------------------------
const validators = {
  required(value: any): ValidationResult {
    if (!isEmpty(value)) return { valid: true };
    return { valid: false, problem: 'Value is required.' };
  },

  regex(value: any, params: { pattern: string; flags?: string }): ValidationResult {
    if (isEmpty(value)) return { valid: true };
    const { pattern, flags } = params || ({} as any);
    if (!pattern) return { valid: true };
    const re = new RegExp(pattern, flags);
    const ok = re.test(String(value));
    return ok ? { valid: true } : { valid: false, problem: 'Value does not match pattern.' };
  },

  enum(
    value: any,
    params: { allowed: string[]; synonyms?: Record<string, string> },
    _row: any,
    ctx: RuleContext
  ): ValidationResult {
    if (isEmpty(value)) return { valid: true };
    const v = toStr(value).trim();
    const allowed = params?.allowed || [];
    const synonyms = Object.fromEntries(
      Object.entries(params?.synonyms || {}).map(([k, val]) => [k.toLowerCase(), val])
    );

    if (allowed.includes(v)) return { valid: true, normalized: v };
    const syn = synonyms[v.toLowerCase()];
    if (syn) return { valid: true, normalized: syn };

    // fuzzy to nearest allowed with distance threshold
    const maxD = ctx.options.fuzzyMaxDistance ?? 2;
    let best: { cand: string; dist: number } | null = null;
    for (const cand of allowed) {
      const d = levenshtein(v.toLowerCase(), cand.toLowerCase());
      if (!best || d < best.dist) best = { cand, dist: d };
    }
    if (best && best.dist <= maxD) {
      // soft normalize w/ lower confidence
      return { valid: true, normalized: best.cand, confidence: Math.max(0.6, 1 - best.dist / (maxD + 1)) };
    }
    return { valid: false, problem: 'Value not in allowed enum.' };
  },

  range(value: any, params: { min?: number; max?: number; type?: 'number' | 'date' }): ValidationResult {
    if (isEmpty(value)) return { valid: true };
    const type = params?.type || 'number';
    if (type === 'number') {
      const num = Number(value);
      if (Number.isNaN(num)) return { valid: false, problem: 'Not a number.' };
      if (params?.min !== undefined && num < params.min)
        return { valid: false, problem: `Number below min ${params.min}.` };
      if (params?.max !== undefined && num > params.max)
        return { valid: false, problem: `Number above max ${params.max}.` };
      return { valid: true, normalized: num };
    }
    // date
    const d = dayjs(value);
    if (!d.isValid()) return { valid: false, problem: 'Invalid date.' };
    if (params?.min !== undefined && d.valueOf() < params.min) return { valid: false, problem: 'Date below min.' };
    if (params?.max !== undefined && d.valueOf() > params.max) return { valid: false, problem: 'Date above max.' };
    return { valid: true, normalized: d.toISOString() };
  },

  date_format(value: any, params: { to?: 'iso' | 'epoch' | 'string'; parseFmt?: string }): ValidationResult {
    if (isEmpty(value)) return { valid: true };
    const d = dayjs(value);
    if (!d.isValid()) return { valid: false, problem: 'Invalid date.' };
    const to = params?.to || 'iso';
    if (to === 'iso') return { valid: true, normalized: d.toISOString() };
    if (to === 'epoch') return { valid: true, normalized: d.valueOf() };
    return { valid: true, normalized: d.format(params?.parseFmt || 'YYYY-MM-DD') };
  },

  email(value: any): ValidationResult {
    if (isEmpty(value)) return { valid: true };
    const v = toStr(value).trim().toLowerCase();
    const ok = isEmail(v);
    return ok ? { valid: true, normalized: v } : { valid: false, problem: 'Invalid email.' };
  },

  phone(value: any, params: { defaultCountry?: string }, _row: any, ctx: RuleContext): ValidationResult {
    if (isEmpty(value)) return { valid: true };
    const def = params?.defaultCountry || ctx.options.defaultCountry || 'US';
    const p = parsePhoneNumberFromString(String(value), def);
    if (p && p.isValid()) return { valid: true, normalized: p.formatInternational() };
    return { valid: false, problem: 'Invalid phone number.' };
  },

  url(value: any): ValidationResult {
    if (isEmpty(value)) return { valid: true };
    const v = toStr(value).trim();
    // allow inputs lacking protocol by testing with & without
    const ok = isURL(v, { require_protocol: false, allow_underscores: true });
    if (!ok) return { valid: false, problem: 'Invalid URL.' };
    try {
      const u = new URL(v.startsWith('http') ? v : `https://${v}`);
      // normalize host to lower
      u.host = u.host.toLowerCase();
      return { valid: true, normalized: u.toString() };
    } catch {
      return { valid: false, problem: 'Invalid URL.' };
    }
  },

  country(value: any, _params: any, _row: any, ctx: RuleContext): ValidationResult {
    if (isEmpty(value)) return { valid: true };
    const mapped = ctx.options.countryMapper?.(String(value));
    if (mapped) return { valid: true, normalized: mapped };
    return { valid: false, problem: 'Unknown country code/name.' };
  },

  state(value: any, params: { countryField?: string }, row: Record<string, any>, ctx: RuleContext): ValidationResult {
    if (isEmpty(value)) return { valid: true };
    const countryField = params?.countryField || 'country';
    const country = toStr(row[countryField]).toUpperCase() || undefined;
    const mapped = ctx.options.stateMapper?.(String(value), country);
    if (mapped) return { valid: true, normalized: mapped };
    return { valid: false, problem: 'Unknown/invalid state or province.' };
  },

  custom_code(value: any, params: any, row: Record<string, any>, ctx: RuleContext): ValidationResult {
    // Executes a sandboxed function registered by name in options.customCodeRegistry
    // params: { fn: string, args?: any }
    if (!params?.fn) return { valid: true };
    const fn = ctx.options.customCodeRegistry?.[params.fn];
    if (!fn) return { valid: false, problem: `Custom function not registered: ${params.fn}` };
    return fn(value, params?.args, row, ctx);
  },

  llm_review(_value: any): ValidationResult {
    // Placeholder: deterministic engine flags this to be picked up by the LLM batch.
    return { valid: true };
  },
};

export type ValidatorKey = keyof typeof validators;

// --------------------------
// RuleEngine
// --------------------------
export class RuleEngine<RowT extends Record<string, any> = Record<string, any>> {
  private ruleSet: RuleSet;
  private options: EngineOptions;
  private dictionaries: Record<string, any>;

  constructor(ruleSet: RuleSet, options: EngineOptions = {}) {
    this.ruleSet = ruleSet;
    this.options = options;
    this.dictionaries = ruleSet.dictionaries || options.dictionaries || {};
  }

  public async applyChunk(rows: RowT[], onResult?: (res: ApplyRowResult<RowT>, index: number) => void) {
    const out: ApplyRowResult<RowT>[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const res = await this.applyRow(r, i);
      out.push(res);
      if (onResult) onResult(res, i);
    }
    return out;
  }

  public async applyRow(row: RowT, rowId: string | number): Promise<ApplyRowResult<RowT>> {
    const issues: Issue[] = [];
    const normalized: RowT = { ...(row as any) };

    const activeRules = (this.ruleSet.rules || []).filter((r) => r.enabled);

    for (const rule of activeRules) {
      const fields = this.expandFields(rule.appliesTo, normalized);
      for (const field of fields) {
        const val = normalized[field];
        const ctx: RuleContext = { rule, field, rowId, row: normalized, options: this.options, dictionaries: this.dictionaries };
        const vr = await this.applyRule(rule, val, normalized, ctx);

        // write normalized value if provided and strategy allows auto fix
        const strategy = rule.fix?.strategy || 'none';
        if (vr.normalized !== undefined && (strategy === 'auto_fix')) {
          normalized[field] = vr.normalized;
        }

        // collect issues if invalid or suggestion exists (or strategy is suggest_only && normalized available)
        const hasSuggestion = vr.suggestion !== undefined || (vr.normalized !== undefined && strategy !== 'auto_fix');
        if (!vr.valid || hasSuggestion) {
          issues.push({
            rowId,
            field,
            ruleId: rule.id,
            severity: rule.severity || 'warning',
            problem: vr.problem || (hasSuggestion ? 'Review suggested fix.' : 'Validation check.'),
            suggestion: strategy === 'auto_fix' ? undefined : (vr.suggestion ?? vr.normalized),
            confidence: clamp01(vr.confidence),
            source: 'deterministic',
            status: 'open',
          });
        }
      }
    }

    return { normalizedRow: normalized, issues };
  }

  private async applyRule(rule: Rule, value: any, row: RowT, ctx: RuleContext): Promise<ValidationResult> {
    const name = rule.validator as ValidatorKey;
    const fn = validators[name];
    if (!fn) return { valid: true };
    try {
      // @ts-ignore — dynamic dispatch
      return await fn(value, rule.params, row, ctx);
    } catch (e: any) {
      return { valid: false, problem: `Validator error: ${e?.message || e}` };
    }
  }

  private expandFields(appliesTo: string[], row: RowT): string[] {
    if (!appliesTo || appliesTo.length === 0) return [];
    const set = new Set<string>();
    for (const f of appliesTo) {
      if (f === '*') {
        Object.keys(row).forEach((k) => set.add(k));
      } else set.add(f);
    }
    return Array.from(set);
  }
}

// --------------------------
// Example country/state mappers (plug your own in EngineOptions)
// --------------------------
export const simpleCountryMapper = (input: string): string | null => {
  if (!input) return null;
  const v = safeLower(input).replace(/\./g, '').trim();
  const map: Record<string, string> = {
    us: 'US', usa: 'US', 'united states': 'US', 'united states of america': 'US',
    ca: 'CA', canada: 'CA',
    gb: 'GB', uk: 'GB', 'united kingdom': 'GB',
    au: 'AU', australia: 'AU',
  };
  return map[v] || null;
};

export const simpleStateMapper = (input: string, country?: string): string | null => {
  if (!input) return null;
  const v = safeLower(input).replace(/\./g, '').trim();
  if ((country || '').toUpperCase() === 'US') {
    const map: Record<string, string> = {
      alabama: 'AL', al: 'AL', alaska: 'AK', ak: 'AK', arizona: 'AZ', az: 'AZ',
      arkansas: 'AR', ar: 'AR', california: 'CA', ca: 'CA', colorado: 'CO', co: 'CO',
      connecticut: 'CT', ct: 'CT', delaware: 'DE', de: 'DE', florida: 'FL', fl: 'FL',
      georgia: 'GA', ga: 'GA', hawaii: 'HI', hi: 'HI', idaho: 'ID', id: 'ID',
      illinois: 'IL', il: 'IL', indiana: 'IN', in: 'IN', iowa: 'IA', ia: 'IA',
      kansas: 'KS', ks: 'KS', kentucky: 'KY', ky: 'KY', louisiana: 'LA', la: 'LA',
      maine: 'ME', me: 'ME', maryland: 'MD', md: 'MD', massachusetts: 'MA', ma: 'MA',
      michigan: 'MI', mi: 'MI', minnesota: 'MN', mn: 'MN', mississippi: 'MS', ms: 'MS',
      missouri: 'MO', mo: 'MO', montana: 'MT', mt: 'MT', nebraska: 'NE', ne: 'NE',
      nevada: 'NV', nv: 'NV', 'new hampshire': 'NH', nh: 'NH', 'new jersey': 'NJ', nj: 'NJ',
      'new mexico': 'NM', nm: 'NM', 'new york': 'NY', ny: 'NY', 'north carolina': 'NC', nc: 'NC',
      'north dakota': 'ND', nd: 'ND', ohio: 'OH', oh: 'OH', oklahoma: 'OK', ok: 'OK',
      oregon: 'OR', or: 'OR', pennsylvania: 'PA', pa: 'PA', 'rhode island': 'RI', ri: 'RI',
      'south carolina': 'SC', sc: 'SC', 'south dakota': 'SD', sd: 'SD', tennessee: 'TN', tn: 'TN',
      texas: 'TX', tx: 'TX', utah: 'UT', ut: 'UT', vermont: 'VT', vt: 'VT',
      virginia: 'VA', va: 'VA', washington: 'WA', wa: 'WA', 'west virginia': 'WV', wv: 'WV',
      wisconsin: 'WI', wi: 'WI', wyoming: 'WY', wy: 'WY',
    };
    return map[v] || null;
  }
  return null;
};
