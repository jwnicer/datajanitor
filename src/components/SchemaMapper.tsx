
'use client';
import React from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiPost } from '@/lib/api';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// types
export type InferredType = 'string'|'integer'|'float'|'boolean'|'date'|'email'|'phone'|'url'|'currency'|'enum'|'unknown';
export interface ColumnSpec { source: string; type: InferredType; confidence: number; samples: string[]; target?: string; suggestTargets: string[]; reason?: string; enumValues?: string[] }
export interface SchemaMapping { columns: ColumnSpec[]; canonicalFields: string[] }

// --- Canonical field sets ---
const CANON_SETS: Record<string,string[]> = {
  general: [
    'id','created_at','updated_at','name','title','first_name','last_name',
    'company_name','company_website','email','phone','country','state','city','zip','address','address_line1','address_line2',
    'website','domain','linkedin_url','notes','status','stage','owner','source'
  ],
  leads: [
    'contact_name','first_name','last_name','job_title','department',
    'company_name','company_domain','company_website','linkedin_url',
    'email','phone','country','state','city','zip','address_line1','address_line2',
    'growth_intent','cash_runway','gtm_traction','ops_maturity','decision_readiness',
    'engagement_1_1','qna_substantive','requested_follow_up','next_steps','score',
    'status','stage','owner','source','created_at','last_contacted_at','website'
  ],
  insurance: [
    'insured_name','policy_number','policy_type','effective_date','expiration_date','premium','naic','vin','address_line1','address_line2','city','state','zip','country','email','phone','company_name','website'
  ],
};

function safeJSON<T=any>(t: string): T | null { try { return JSON.parse(t); } catch { return null; } }


export function SchemaMapper({ file, open, onClose, onConfirm, ruleSetId }:{ file: File; open: boolean; onClose: ()=>void; onConfirm: (schema: SchemaMapping)=>void; ruleSetId?: string }){
  const [columns, setColumns] = React.useState<ColumnSpec[]>([]);
  const [canon, setCanon] = React.useState<string[]>(pickCanon(ruleSetId));

  React.useEffect(() => { if (open && file) parseFile(file); }, [open, file, ruleSetId]);
  React.useEffect(() => { setCanon(pickCanon(ruleSetId)); }, [ruleSetId]);

  async function parseFile(f: File) {
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
    const header = (rows[0] || []).map((h: any) => String(h || '').trim());
    const body = rows.slice(1).filter((r: any[]) => r && r.length > 0);
    const sample = body.slice(0, 500);
    
    const cols: ColumnSpec[] = header.map((h: string, i: number) => {
      const values = sample.map(r => r?.[i]).filter((v: any) => v!==undefined && v!==null).map(String);
      return inferColumn(h, values);
    });
    setColumns(cols);
  }

  function inferColumn(name: string, values: string[]): ColumnSpec {
    const t = detectType(values);
    // baseline header match
    const s = norm(name);
    const scored = canon.map(f => ({ f, score: headerScore(s, norm(f)), reason: 'header similarity' }));
    // value heuristics (domain words)
    const boost = valueHeuristics(values);
    for (const b of boost) {
      const hit = scored.find(x => x.f === b.target);
      if (hit) { hit.score += b.delta; hit.reason = b.reason; }
    }
    scored.sort((a,b)=>b.score-a.score);
    const best = scored[0];
    const preselect = best && best.score >= 0.6; // confidence gating
    return {
      source: name || '—',
      type: t.type,
      confidence: t.confidence,
      samples: values.slice(0,5),
      suggestTargets: scored.slice(0,5).map(x=>x.f),
      target: preselect ? best.f : name,
      reason: preselect ? best.reason+` (${(best.score*100|0)}%)` : 'source header',
    };
  }
  
  async function proposeWithGemini() {
    try {
      const header = columns.map(c => c.source);
      const sampleRows = []; // this is tricky without reparsing. For now, let's assume we can get it if needed, or pass samples.
      const { mapping } = await apiPost('/api/schema/propose', { header, sampleRows, canonicalFields: canon });
      if (!mapping || !Array.isArray(mapping)) throw new Error('Invalid response from server');
      
      const newColumns = mergeGemini(columns, mapping);
      setColumns(newColumns);
      toast.success("Gemini proposals applied!");

    } catch (e: any) {
      toast.error('Gemini proposal failed', { description: e.message });
    }
  }

  // Merge Gemini suggestions onto heuristics
  function mergeGemini(base: ColumnSpec[], mapping: any[]): ColumnSpec[] {
    const bySrc = new Map(mapping.map(m => [String(m.source).toLowerCase(), m]));
    return base.map(col => {
      const m = bySrc.get(col.source.toLowerCase());
      if (!m) return col;
      const t = String(m.target||'');
      // Only accept Gemini target if it is within canonical list
      const valid = canon.includes(t);
      return {
        ...col,
        target: valid ? t : col.target,
        reason: valid ? (m.reason || 'Gemini') : col.reason,
        type: (m.inferredType || col.type) as InferredType,
        confidence: typeof m.confidence === 'number' ? Math.max(col.confidence, m.confidence) : col.confidence,
      };
    });
  }

  function detectType(values: string[]) {
    const clean = values.map(v => v.trim()).filter(v => v.length > 0);
    const n = clean.length || 1;
    const unique = new Set(clean.map(v => v.toLowerCase())).size;
    let c={int:0,float:0,date:0,email:0,url:0,phone:0,bool:0,currency:0};
    const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i, urlRe=/^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i, phoneRe=/^[+\d]?\s*(?:\d[\s-]?){6,14}\d$/, currencyRe=/^[$€£¥]\s?\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{2})?$/;
    for(const v of clean){ if(/^(true|false|yes|no|y|n|0|1)$/i.test(v)) c.bool++; if(/^[+-]?\d+$/.test(v)) c.int++; if(/^[+-]?\d*\.\d+$/.test(v)) c.float++; if(!Number.isNaN(Date.parse(v))) c.date++; if(emailRe.test(v)) c.email++; if(urlRe.test(v)) c.url++; if(phoneRe.test(v)) c.phone++; if(currencyRe.test(v)) c.currency++; }
    let score: Record<InferredType, number> = { string:0, integer:c.int/n, float:c.float/n, boolean:c.bool/n, date:c.date/n, email:c.email/n, phone:c.phone/n, url:c.url/n, currency:c.currency/n, enum:0, unknown:0 } as any;
    const uniqueRatio = unique/n; if(n>=5 && uniqueRatio<0.2) score.enum = 0.8;
    const ranked = Object.entries(score).sort((a,b)=> (b[1] as number) - (a[1] as number));
    let type = ranked[0][0] as InferredType; let confidence = ranked[0][1] as number;
    if (confidence < 0.3) { type = 'string'; confidence = 0.3; }
    return { type, confidence };
  }

  function valueHeuristics(values: string[]): { target:string; delta:number; reason:string }[] {
    const text = values.slice(0,50).join(' | ').toLowerCase();
    const hints: { target:string; delta:number; reason:string }[] = [];
    if (/strong\b|weak\b|mixed\b/.test(text)) hints.push({ target:'gtm_traction', delta:0.35, reason:'values look like GTM traction' });
    if (/high\b|partial\b|ad-?hoc\b/.test(text)) hints.push({ target:'ops_maturity', delta:0.35, reason:'values look like Ops maturity' });
    if (/clear intent|no plan|exploring|\bintent\b/.test(text)) hints.push({ target:'growth_intent', delta:0.35, reason:'values mention intent' });
    if (/positive|negative|break-?even|\bmo\b/.test(text)) hints.push({ target:'cash_runway', delta:0.3, reason:'values look like cash/runway bands' });
    if (/decision maker|influencer|engaged|no clarity/.test(text)) hints.push({ target:'decision_readiness', delta:0.3, reason:'values about decision roles/readiness' });
    if (/yes\b|no\b/.test(text)) hints.push({ target:'engagement_1_1', delta:0.15, reason:'yes/no answers detected' });
    return hints;
  }

  function headerScore(a: string, b: string){
    if (a===b) return 1; if (a.includes(b) || b.includes(a)) return 0.8;
    const tri=(s:string)=> new Set([...Array(Math.max(1,s.length-2)).keys()].map(i=>s.slice(i,i+3)));
    const A=tri(a), B=tri(b); const inter=[...A].filter(x=>B.has(x)).length; const uni=new Set([...A,...B]).size||1; return inter/uni;
  }

  function pickCanon(ruleSetId?: string){
    if (!ruleSetId) return CANON_SETS.general;
    const k = ruleSetId.toLowerCase();
    if (k.includes('lead') || k.includes('crm')) return CANON_SETS.leads;
    if (k.includes('insur') || k.includes('policy')) return CANON_SETS.insurance;
    return CANON_SETS.general;
  }

  function onSelectTarget(idx: number, val: string){
    if (val === '__skip__') return setColumns(p => p.map((c,i)=> i===idx ? { ...c, target: undefined } : c));
    if (val === '__new__') {
      const name = window.prompt('New target field name:');
      if (!name) return;
      return setColumns(p => p.map((c,i)=> i===idx ? { ...c, target: name.trim() } : c));
    }
    setColumns(p => p.map((c,i)=> i===idx ? { ...c, target: val } : c));
  }


  function norm(x: string){ return String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,''); }

  function confirm(){ onConfirm({ columns, canonicalFields: canon }); }
  
  const allMapped = columns.every(c => typeof c.target === 'string' && c.target.length>0);


  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
            <DialogTitle>Map Columns & Confirm Types</DialogTitle>
        </DialogHeader>
         <div className="flex justify-between items-center">
            <div className="text-xs text-muted-foreground">RuleSet: <b>{ruleSetId||'—'}</b> · Canonical fields loaded: {canon.length}. Only confident matches are pre‑selected.</div>
            <Button variant="outline" onClick={proposeWithGemini}>🤖 Use Gemini to propose</Button>
        </div>
        <div className="overflow-auto max-h-[60vh] border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-left">Source</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Samples</th>
                <th className="p-2 text-left">Target</th>
                <th className="p-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c, i) => (
                <tr key={c.source+String(i)} className="border-t hover:bg-muted/30">
                  <td className="p-2 font-medium">{c.source}</td>
                  <td className="p-2"><Badge variant={c.type==='string'?'outline':'default'}>{c.type}</Badge> <span className="text-xs text-muted-foreground ml-2">{Math.round(c.confidence*100)}%</span></td>
                  <td className="p-2 text-xs">
                    <div className="flex flex-wrap gap-1">{c.samples.map((s, idx)=> (<span key={idx} className="chip">{s.length>24? s.slice(0,23)+'…' : s}</span>))}</div>
                  </td>
                  <td className="p-2">
                    <select className="border rounded px-2 py-1" value={c.target||''} onChange={(e)=> onSelectTarget(i, e.target.value) }>
                      <option value="">(choose)</option>
                      <option value="__skip__">(skip)</option>
                      <option value="__new__">(create new…)</option>
                      {[...new Set([c.source, ...(c.suggestTargets||[]), ...canon])].map(f=> (<option key={f} value={f}>{f}</option>))}
                    </select>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                      <span>{c.reason || '—'}</span>
                    </TooltipTrigger><TooltipContent>{c.reason || 'No reason'}</TooltipContent></Tooltip></TooltipProvider>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={!allMapped}>Confirm & Continue</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
