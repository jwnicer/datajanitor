
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Storage } from '@google-cloud/storage';
import { VertexAI } from '@google-cloud/vertexai';
import * as XLSX from 'xlsx';

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const storage = new Storage();

const PROJECT = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.VERTEX_MODEL || 'models/gemini-2.5-pro';

// ---- helpers ----
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const urlRe = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;
const phoneRe = /^[+\d]?\s*(?:\d[\s-]?){6,14}\d$/;

function normPhone(v: string){ return v.replace(/[^\d+]/g,''); }
function normUrl(v: string){ return /^https?:\/\//i.test(v) ? v : `https://${v}`; }
function toISODate(v: string){ const d = new Date(v); return isNaN(+d) ? null : d.toISOString().slice(0,10); }

type Rule = {
  ruleId: string;
  appliesTo?: string | string[]; // target field(s)
  type: 'required'|'email'|'phone'|'url'|'date'|'enum'|'regex';
  strategy?: 'auto_fix'|'suggest_only'|'none';
  pattern?: string;                 // for regex
  enum?: string[];                  // for enum canonical list
  synonyms?: Record<string,string>; // map variant -> canonical
};

export const processStart = onRequest({ cors: true, maxInstances: 5, timeoutSeconds: 540 }, async (req, res) => {
  res.setHeader('Content-Type','application/json');
  try {
    if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'Use POST' }));

    // Auth (reuse the same ID token the client used for /upload)
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')? authHeader.slice(7):'';
    // No token, no access
    // if (!token) return res.status(401).send(JSON.stringify({ error: 'Missing bearer token' }));
    // const user = await getAuth().verifyIdToken(token).catch(e=>{ throw new Error('Invalid ID token: '+e.message); });

    const { jobId, useLLM = true, llmLimit = 100 } = (req.body || {});
    if (!jobId) return res.status(400).send(JSON.stringify({ error: 'jobId is required' }));

    // Load job
    const jobRef = db.collection('jobs').doc(jobId);
    const snap = await jobRef.get();
    if (!snap.exists) throw new Error('Job not found');
    const job = snap.data() as any;
    const { createdBy, filename, ruleSetId = 'default', schema } = job || {};
    if (!createdBy || !filename) throw new Error('Job missing createdBy/filename');

    const bucket = process.env.UPLOAD_BUCKET || process.env.GCLOUD_STORAGE_BUCKET;
    if (!bucket) throw new Error('UPLOAD_BUCKET or GCLOUD_STORAGE_BUCKET not set');
    const inputPath = `uploads/${createdBy}/${jobId}/${filename}`;

    // Update status
    await jobRef.set({ status: 'processing', startedAt: FieldValue.serverTimestamp() }, { merge: true });

    // Download file
    const [buf] = await storage.bucket(bucket).file(inputPath).download();

    // Parse first sheet (works for xlsx/csv)
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
    const header = (rows[0]||[]).map(h => String(h||'').trim());
    const body = rows.slice(1);

    // Build mapping {source->target}
    const mapping: Record<string,string> = {};
    if (schema && Array.isArray(schema.columns)) {
      for (const c of schema.columns) if (c?.source && c?.target) mapping[String(c.source)] = String(c.target);
    }

    const targetHeader = header.map(h => mapping[h] || h);

    // Load rule set
    const rsSnap = await db.collection('ruleSets').doc(ruleSetId).get();
    const ruleSet = rsSnap.exists ? (rsSnap.data() as any) : { rules: [], dictionaries: {}, pii: { fields: [] } };
    const rules: Rule[] = Array.isArray(ruleSet.rules) ? ruleSet.rules : [];

    // Deterministic pass
    const issuesCol = jobRef.collection('issues');
    const batchSize = 400; // chunk Firestore writes
    let issuesBuffer: any[] = [];
    let normalizedLines: string[] = [];

    function pushIssue(i: any){ issuesBuffer.push(i); }
    async function flushIssues(){
      if (issuesBuffer.length === 0) return;
      const chunks = [] as any[];
      for (let i=0;i<issuesBuffer.length;i+=batchSize) chunks.push(issuesBuffer.slice(i,i+batchSize));
      for (const ch of chunks){
        const bt = db.batch();
        for (const it of ch){
          bt.set(issuesCol.doc(), { ...it, createdAt: FieldValue.serverTimestamp() });
        }
        await bt.commit();
      }
      issuesBuffer = [];
    }

    const validators: Record<string,(v:string)=>{ok:boolean;fix?:string}> = {
      email: v => ({ ok: emailRe.test(v), fix: v.trim().toLowerCase() }),
      phone: v => ({ ok: phoneRe.test(v), fix: normPhone(v) }),
      url:   v => ({ ok: urlRe.test(v), fix: normUrl(v) }),
      date:  v => { const iso = toISODate(v); return { ok: !!iso, fix: iso || undefined }; },
    };

    function applyEnums(val: string, r: Rule){
      if (!val) return { ok: false };
      if (r.synonyms && r.synonyms[val]) return { ok: true, fix: r.synonyms[val] };
      if (r.enum && r.enum.includes(val)) return { ok: true };
      return { ok: false };
    }

    const targetIndexes = targetHeader.reduce((acc, name, i)=>{ acc[name]=i; return acc; }, {} as Record<string,number>);

    for (let rowIdx=0; rowIdx<body.length; rowIdx++){
      const src = body[rowIdx] || [];
      const row: Record<string,string> = {};
      targetHeader.forEach((name, i)=>{ row[name] = String(src[i] ?? '').trim(); });

      // Default normalization object we will output (accepting safe fixes)
      const out: any = { ...row };

      for (const r of rules){
        const fields = Array.isArray(r.appliesTo) ? r.appliesTo : (r.appliesTo ? [r.appliesTo] : []);
        for (const field of fields){
          const val = row[field] ?? '';
          if (r.type === 'required'){
            if (!val){
              pushIssue({ jobId, rowId: rowIdx+2, field, ruleId: r.ruleId||'required', problem: 'Required field is empty', suggestion: null, source:'deterministic', severity:'error', status:'open' });
            }
            continue;
          }

          if (!val) continue; // skip empties for other types

          if (r.type in validators){
            const { ok, fix } = validators[r.type](val);
            if (!ok){
              const suggestion = fix || null;
              pushIssue({ jobId, rowId: rowIdx+2, field, ruleId: r.ruleId||r.type, problem:`Invalid ${r.type}`, suggestion, confidence: suggestion?0.98:0.6, source:'deterministic', severity:'warning', status:'open' });
              if (r.strategy === 'auto_fix' && suggestion) out[field] = suggestion;
            } else if (r.strategy === 'auto_fix' && fix && fix !== val) {
              // silently normalize (e.g., lowercase email)
              out[field] = fix;
            }
            continue;
          }

          if (r.type === 'regex' && r.pattern){
            const re = new RegExp(r.pattern);
            if (!re.test(val)) pushIssue({ jobId, rowId: rowIdx+2, field, ruleId: r.ruleId||'regex', problem:'Pattern mismatch', suggestion:null, confidence:0.6, source:'deterministic', severity:'warning', status:'open' });
            continue;
          }

          if (r.type === 'enum'){
            const { ok, fix } = applyEnums(val, r);
            if (!ok){
              pushIssue({ jobId, rowId: rowIdx+2, field, ruleId: r.ruleId||'enum', problem:'Value not in enum', suggestion: fix||null, confidence: fix?0.9:0.6, source:'deterministic', severity:'warning', status:'open' });
            } else if (r.strategy === 'auto_fix' && fix) out[field] = fix;
          }
        }
      }

      normalizedLines.push(JSON.stringify(out));

      // Flush periodically to avoid memory blowup
      if ((rowIdx+1) % 1000 === 0){ await flushIssues(); }
    }

    await flushIssues();

    // Optional LLM pass for ambiguous items
    if (useLLM){
      const vertex = new VertexAI({ project: PROJECT, location: LOCATION });
      const model = vertex.getGenerativeModel({ model: MODEL });

      // Pull up to llmLimit open deterministic issues and send context
      const openSnap = await issuesCol.where('status','==','open').where('source','==','deterministic').limit(llmLimit).get();
      const byRow: Record<string, any[]> = {};
      openSnap.forEach(d=>{ const it = d.data(); (byRow[it.rowId] ||= []).push(it); });

      const rowsForLLM = Object.entries(byRow).slice(0, Math.min(10, Object.keys(byRow).length));
      for (const [rowId, issues] of rowsForLLM){
        const idx = Number(rowId)-2; const context = body[idx] || [];
        const obj: any = {}; targetHeader.forEach((h,i)=> obj[h] = String(context[i]??''));
        // redact PII if your ruleSet lists fields
        const piiFields = (ruleSet?.pii?.fields||[]) as string[];
        for (const f of piiFields) if (obj[f]) obj[f] = '[REDACTED]';

        const prompt = `You are a data quality assistant. Given a row (as JSON) and a set of deterministic issues, propose JSON fixes where you are confident.\nReturn ONLY JSON: { suggestions: Array<{ field: string, value: string, confidence: number, reason?: string }> }\nRow: ${JSON.stringify(obj)}\nIssues: ${JSON.stringify(issues.map(i=>({ field:i.field, ruleId:i.ruleId, problem:i.problem })))}\n`;
        try{
          const resp = await model.generateContent({ contents: [{ role:'user', parts:[{ text: prompt }]}] });
          const text = resp?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const json = safeJSON<{ suggestions: { field:string, value:string, confidence:number, reason?:string }[] }>(text);
          if (json?.suggestions?.length){
            const bt = db.batch();
            json.suggestions.forEach(sug => {
              const ref = issuesCol.doc();
              bt.set(ref, {
                jobId, rowId: Number(rowId), field: sug.field, ruleId:'llm',
                problem:'LLM suggestion', suggestion: sug.value, confidence: Math.min(1, Math.max(0, Number(sug.confidence||0.8))),
                source:'llm', severity:'info', status:'open', createdAt: FieldValue.serverTimestamp(), reason: sug.reason||null
              });
            });
            await bt.commit();
          }
        } catch {}
      }
    }

    // Write normalized NDJSON
    const exportPath = `exports/${jobId}/normalized.ndjson`;
    await storage.bucket(bucket).file(exportPath).save(Buffer.from(normalizedLines.join('\n')),{ contentType:'application/x-ndjson' });

    // Update job
    const issuesSnap = await issuesCol.get();
    const deterministicIssues = issuesSnap.docs.filter(d => d.data().source === 'deterministic').length;
    const llmIssues = issuesSnap.docs.filter(d => d.data().source === 'llm').length;
    
    const metrics = { deterministicIssues, llmIssues };

    await jobRef.set({ status:'review', finishedAt: FieldValue.serverTimestamp(), exportPath: `gs://${bucket}/${exportPath}`, metrics }, { merge: true });

    return res.send(JSON.stringify({ ok:true, jobId, exportPath: `gs://${bucket}/${exportPath}`, metrics }));
  } catch (e:any) {
    return res.status(500).send(JSON.stringify({ error: e?.message || String(e) }));
  }
});

function safeJSON<T=any>(t: string): T | null { try { return JSON.parse(t); } catch { return null; } }
