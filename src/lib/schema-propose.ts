
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { VertexAI } from '@google-cloud/vertexai';

if (getApps().length === 0) initializeApp();

const PROJECT = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.VERTEX_MODEL || 'models/gemini-2.5-pro';

const CANONICAL_FIELDS = [
  'company_name','company_website','email','phone','country','state','city','zip','address','address_line1','address_line2',
  'insured_name','policy_number','policy_type','effective_date','expiration_date','premium','naic','vin','type','website'
];

function safeJSON<T=any>(t: string): T | null {
  try { return JSON.parse(t); } catch { return null; }
}

function localHeuristic(header: string[], sampleRows: any[][]) {
  const norm = (x: string) => String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const tri = (s:string)=> new Set([...Array(Math.max(1,s.length-2)).keys()].map(i=>s.slice(i,i+3)));
  function headerScore(a: string, b: string){ if(a===b) return 1; if(a.includes(b)||b.includes(a)) return .8; const A=tri(a),B=tri(b); const inter=[...A].filter(x=>B.has(x)).length; const union=new Set([...A,...B]).size||1; return inter/union; }
  function detectType(values: string[]){
    const clean = values.map(v => String(v||'').trim()).filter(Boolean);
    const n = Math.max(clean.length, 1);
    const unique = new Set(clean.map(v => v.toLowerCase())).size;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i; const urlRe = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i; const phoneRe = /^[+\d]?\s*(?:\d[\s-]?){6,14}\d$/; const currencyRe = /^[$€£¥]\s?\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{2})?$/;
    let c={int:0,float:0,date:0,email:0,url:0,phone:0,bool:0,currency:0};
    for(const v of clean){ if(/^(true|false|yes|no|0|1)$/i.test(v)) c.bool++; if(/^[+-]?\d+$/.test(v)) c.int++; if(/^[+-]?\d*\.\d+$/.test(v)) c.float++; if(!Number.isNaN(Date.parse(v))) c.date++; if(emailRe.test(v)) c.email++; if(urlRe.test(v)) c.url++; if(phoneRe.test(v)) c.phone++; if(currencyRe.test(v)) c.currency++; }
    let score = { string:0, integer:c.int/n, float:c.float/n, boolean:c.bool/n, date:c.date/n, email:c.email/n, phone:c.phone/n, url:c.url/n, currency:c.currency/n, enum:0 } as any;
    const uniqueRatio = unique/n; if(n>=5 && uniqueRatio<0.2) score.enum = 0.8;
    const sorted = Object.entries(score).sort((a,b)=>Number(b[1])-Number(a[1]));
    let type = sorted[0][0]; let confidence = sorted[0][1] as number; if(confidence<0.3){ type='string'; confidence=0.3; }
    return { type, confidence };
  }
  return header.map((h, i) => {
    const values = sampleRows.map(r=>r?.[i]).filter(v=>v!==undefined && v!==null).map(String);
    const info = detectType(values);
    const s = norm(h);
    const candidates = CANONICAL_FIELDS.map(f => ({ f, score: headerScore(s, norm(f)) }));
    // small type boosts
    for (const c of candidates) {
      if (info.type==='email' && /email/.test(c.f)) c.score += 0.25;
      if (info.type==='phone' && /phone|mobile|contact/.test(c.f)) c.score += 0.25;
      if (info.type==='date' && /date/.test(c.f)) c.score += 0.15;
      if (info.type==='url' && /website|url|domain/.test(c.f)) c.score += 0.2;
      if (info.type==='enum' && /type|status|category/.test(c.f)) c.score += 0.1;
    }
    const target = candidates.sort((a,b)=>b.score-a.score)[0].f;
    return { source: h||`col_${i+1}`, target, inferredType: info.type, confidence: Math.min(0.99, Number(info.confidence||0.5)+0.15), reason: 'Heuristic mapping' };
  });
}

export const schemaPropose = onRequest({ cors: true, maxInstances: 5 }, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'Use POST' }));
    const { header, sampleRows, canonicalFields } = (req.body || {});
    if (!Array.isArray(header) || !Array.isArray(sampleRows)) {
      return res.status(400).send(JSON.stringify({ error: 'Provide { header: string[], sampleRows: any[][] }' }));
    }

    // Cap sample to protect tokens
    const hdr = header.slice(0, 200);
    const rows = sampleRows.slice(0, 50); // up to 50 rows
    const canon = Array.isArray(canonicalFields) && canonicalFields.length ? canonicalFields : CANONICAL_FIELDS;

    // Try Gemini; if it fails, fall back to local heuristic
    let result: any[] | null = null;
    try {
      const vertex = new VertexAI({ project: PROJECT, location: LOCATION });
      const model = vertex.getGenerativeModel({ model: MODEL });
      const sys = `You are a strict JSON generator for schema mapping. Output ONLY JSON with this TypeScript shape:
{
  "mapping": Array<{ source: string; target: string; inferredType: 'string'|'integer'|'float'|'boolean'|'date'|'email'|'phone'|'url'|'currency'|'enum'|'unknown'; confidence: number; reason?: string; enumValues?: string[] }>
}
Rules: targets must be from this list: ${canon.join(', ')}. confidence is 0..1. Keep reasons short. If unsure, choose the most likely.`;
      const user = `HEADER:\n${JSON.stringify(hdr)}\n\nSAMPLE_ROWS (first 50):\n${JSON.stringify(rows)}\n\nReturn JSON only.`;
      const resp = await model.generateContent({ contents: [ { role: 'user', parts: [{ text: sys + '\n\n' + user }] } ] });
      const text = resp?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const json = safeJSON<{ mapping: any[] }>(text);
      if (json && Array.isArray(json.mapping)) result = json.mapping;
    } catch (e) {
      // fall back
    }

    if (!result) result = localHeuristic(hdr, rows);

    return res.send(JSON.stringify({ mapping: result, sourceColumns: hdr.length }));
  } catch (e: any) {
    return res.status(500).send(JSON.stringify({ error: e?.message || String(e) }));
  }
});
