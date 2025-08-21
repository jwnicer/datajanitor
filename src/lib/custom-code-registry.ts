// Custom validators usable via Rule params: { validator: 'custom_code', params: { fn: 'dateOrder', args: {...} } }
import dayjs from 'dayjs';
import type { ValidationResult, RuleContext } from './rules-engine';

export const customCodeRegistry: Record<string, (value: any, params: any, row: any, ctx: RuleContext) => ValidationResult> = {
  // Ensure end date is after start date
  dateOrder: (_value, args: { startField: string; endField: string }, row) => {
    const s = row[args?.startField];
    const e = row[args?.endField];
    const ds = dayjs(s), de = dayjs(e);
    if (!ds.isValid() || !de.isValid()) return { valid: false, problem: 'Invalid start/end date' };
    if (de.isBefore(ds)) return { valid: false, problem: 'End date precedes start date' };
    return { valid: true };
  },

  // Validate VIN (17 chars excluding I,O,Q)
  vin: (value) => {
    if (!value) return { valid: true };
    const v = String(value).trim().toUpperCase();
    const ok = /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
    return ok ? { valid: true, normalized: v } : { valid: false, problem: 'Invalid VIN' };
  },

  // NAIC company code — 5 or 6 digits
  naic: (value) => {
    if (!value) return { valid: true };
    const v = String(value).trim();
    return /^\d{5,6}$/.test(v) ? { valid: true, normalized: v } : { valid: false, problem: 'Invalid NAIC code' };
  },

  // US ZIP (+4 optional)
  zipUS: (value) => {
    if (!value) return { valid: true };
    const v = String(value).trim();
    return /^\d{5}(-?\d{4})?$/.test(v) ? { valid: true, normalized: v.replace(/-/,'') } : { valid: false, problem: 'Invalid ZIP' };
  },
};
