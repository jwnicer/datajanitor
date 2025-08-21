
'use client';
import React from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiPost } from '@/lib/api';
import { toast } from 'sonner';

// types
export type InferredType = 'string'|'integer'|'float'|'boolean'|'date'|'email'|'phone'|'url'|'currency'|'enum'|'unknown';
export interface ColumnSpec { source: string; type: InferredType; confidence: number; samples: string[]; target?: string; suggestTargets: string[]; enumValues?: string[], reason?: string; }
export interface SchemaMapping { columns: ColumnSpec[] }

const CANONICAL_FIELDS = ['company_name','company_website','email','phone','country','state','city','zip','address','address_line1','address_line2','insured_name','policy_number','policy_type','effective_date','expiration_date','premium','naic','vin','type','website'];

export function SchemaMapper({ file, open, onClose, onConfirm }:{ file: File; open: boolean; onClose: ()=>void; onConfirm: (schema: SchemaMapping)=>void }){
  const [columns, setColumns] = React.useState<ColumnSpec[]>([]);
  const [header, setHeader] = React.useState<string[]>([]);
  const [sampleRows, setSampleRows] = React.useState<any[][]>([]);

  React.useEffect(() => { if (open && file) parseFile(file); }, [open, file]);

  async function parseFile(f: File) {
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
    const hdr = (rows[0] || []).map((h: any) => String(h || '').trim());
    setHeader(hdr);
    const body = rows.slice(1).filter((r: any[]) => r && r.length > 0);
    const sample = body.slice(0, 500);
    setSampleRows(sample);
    const cols: ColumnSpec[] = hdr.map((h: string, i: number) => {
      const values = sample.map(r => r?.[i]).filter((v: any) => v!==undefined && v!==null).map(String);
      const info = inferType(values);
      const sugg = suggestTargets(h, info.type);
      return { source: h || `col_${i+1}`, type: info.type, confidence: info.confidence, samples: values.slice(0,5), suggestTargets: sugg, target: sugg[0] };
    });
    setColumns(cols);
  }
  
  async function proposeWithGemini() {
    try {
      const { mapping } = await apiPost('/api/schema/propose', { header, sampleRows });
      if (!mapping || !Array.isArray(mapping)) throw new Error('Invalid response from server');
      
      const newColumns = columns.map(col => {
        const proposal = mapping.find((m:any) => m.source === col.source);
        if (proposal) {
          return {
            ...col,
            target: proposal.target,
            type: proposal.inferredType,
            confidence: proposal.confidence,
            reason: proposal.reason,
          };
        }
        return col;
      });
      setColumns(newColumns);
      toast.success("Gemini proposals applied!");

    } catch (e: any) {
      toast.error('Gemini proposal failed', { description: e.message });
    }
  }

  function inferType(values: string[]) {
    const clean = values.map(v => v.trim()).filter(v => v.length > 0);
    const n = clean.length || 1;
    const unique = new Set(clean.map(v => v.toLowerCase())).size;
    let c={int:0,float:0,date:0,email:0,url:0,phone:0,bool:0,currency:0};
    const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i, urlRe=/^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i, phoneRe=/^[+\d]?\s*(?:\d[\s-]?){6,14}\d$/, currencyRe=/^[$€£¥]\s?\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{2})?$/;
    for(const v of clean){ if(/^(true|false|yes|no|0|1)$/i.test(v)) c.bool++; if(/^[+-]?\d+$/.test(v)) c.int++; if(/^[+-]?\d*\.\d+$/.test(v)) c.float++; if(!Number.isNaN(Date.parse(v))) c.date++; if(emailRe.test(v)) c.email++; if(urlRe.test(v)) c.url++; if(phoneRe.test(v)) c.phone++; if(currencyRe.test(v)) c.currency++; }
    let score={ string:0, integer:c.int/n, float:c.float/n, boolean:c.bool/n, date:c.date/n, email:c.email/n, phone:c.phone/n, url:c.url/n, currency:c.currency/n, enum:0 } as any;
    const uniqueRatio = unique/n; if(n>=5 && uniqueRatio<0.2) score.enum = 0.8;
    const ranked = Object.entries(score).sort((a,b)=> (b[1] as number) - (a[1] as number));
    let type = ranked[0][0] as InferredType; let confidence = ranked[0][1] as number;
    if (confidence < 0.3) { type = 'string'; confidence = 0.3; }
    return { type, confidence };
  }

  function suggestTargets(src: string, t: InferredType) {
    const s = norm(src);
    const tri = (x:string)=> new Set([...Array(Math.max(1,x.length-2)).keys()].map(i=>x.slice(i,i+3)));
    function score(a: string, b: string){ if(a===b) return 1; if(a.includes(b)||b.includes(a)) return .8; const A=tri(a),B=tri(b); const inter=[...A].filter(x=>B.has(x)).length; const uni=new Set([...A,...B]).size||1; return inter/uni; }
    const cand = CANONICAL_FIELDS.map(f=>({f,score: score(s, norm(f))}));
    for(const c of cand){ if(t==='email'&&/email/.test(c.f)) c.score+=0.25; if(t==='phone'&&/phone|mobile|contact/.test(c.f)) c.score+=0.25; if(t==='date'&&/date/.test(c.f)) c.score+=0.15; if(t==='url'&&/website|url|domain/.test(c.f)) c.score+=0.2; }
    return cand.sort((a,b)=>b.score-a.score).slice(0,3).map(c=>c.f);
  }

  function norm(x: string){ return String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,''); }

  function confirm(){ onConfirm({ columns }); }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Map Columns & Confirm Types</DialogTitle></DialogHeader>
        <div className="flex justify-end gap-2">
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
                    <select className="border rounded px-2 py-1" value={c.target||''} onChange={(e)=> setColumns(prev=> prev.map((x,idx)=> idx===i? {...x, target: e.target.value }: x)) }>
                      <option value="">(choose)</option>
                      {[...new Set([...(c.suggestTargets||[]), ...CANONICAL_FIELDS])].map(f=> (<option key={f} value={f}>{f}</option>))}
                    </select>
                  </td>
                  <td className="p-2 text-xs italic text-muted-foreground">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={!columns.every(c=>!!c.target)}>Confirm & Continue</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
