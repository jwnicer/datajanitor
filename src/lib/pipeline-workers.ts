import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { Storage } from '@google-cloud/storage';
import * as XLSX from 'xlsx';

// ----- Admin init -----
if (!getApps().length) initializeApp();
const db = getFirestore();
const gcs = new Storage();
const DEFAULT_BUCKET = process.env.UPLOAD_BUCKET
  || process.env.GCLOUD_STORAGE_BUCKET
  || (() => { try { return getAdminStorage().bucket().name; } catch { return ''; } })();
if (!DEFAULT_BUCKET) console.warn('[WARN] No bucket env set; set UPLOAD_BUCKET to your default bucket name');

// ----- Helpers -----
function parseUploadPath(path?: string){
  if (!path) return null; // expected uploads/{uid}/{jobId}/{filename}
  const parts = path.split('/'); if (parts.length < 4 || parts[0] !== 'uploads') return null;
  const [, uid, jobId, ...rest] = parts; return { uid, jobId, filename: rest.join('/') };
}
function inferType(filename: string, contentType?: string){
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'jsonl' || ext === 'ndjson') return 'jsonl';
  if (ext === 'tsv') return 'tsv';
  if (ext === 'csv') return 'csv';
  if (contentType?.includes('spreadsheetml')) return 'xlsx';
  if (contentType?.includes('json')) return 'jsonl';
  if (contentType?.includes('tsv')) return 'tsv';
  if (contentType?.includes('csv')) return 'csv';
  return 'csv';
}

// ===========================================================================
// 2) Storage Trigger — set({merge:true}); calls parser; safe on any bucket
// ===========================================================================
export const onUpload = onObjectFinalized({ bucket: DEFAULT_BUCKET || undefined }, async (event) => {
  const obj = event.data; const name = obj.name || '';
  const meta = parseUploadPath(name); if (!meta) return; // ignore non-upload paths
  const { uid, jobId, filename } = meta;
  const fileType = inferType(filename, obj.contentType || undefined);

  const jobRef = db.collection('jobs').doc(jobId);
  await jobRef.set({
    status: 'queued', filename, fileType, createdAt: FieldValue.serverTimestamp(), createdBy: uid,
  }, { merge: true });

  await parseFileTask({ bucket: obj.bucket, name, uid, jobId, fileType });
});

// ===========================================================================
// 3) Parser — CSV/TSV/XLSX/JSONL → preview {header, rows} + rowsTotal
// ===========================================================================
export async function parseFileTask(
  { bucket, name, uid, jobId, fileType }:
  { bucket: string; name: string; uid: string; jobId: string; fileType: string }
){
  const jobRef = db.collection('jobs').doc(jobId);
  await jobRef.set({ status: 'parsing' }, { merge: true });

  try{
    const [buf] = await gcs.bucket(bucket).file(name).download();
    let rows: any[][] = [];

    if (fileType === 'xlsx'){
      const wb = XLSX.read(buf, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];
    } else if (fileType === 'jsonl'){
      const lines = buf.toString('utf8').split(/\r?\n/).filter(Boolean);
      const objs = lines.slice(0, 1000).map(l => JSON.parse(l));
      const header = Array.from(new Set(objs.flatMap(o => Object.keys(o))));
      rows = [header, ...objs.map(o => header.map(h => o[h] ?? ''))];
    } else { // csv/tsv
      const text = buf.toString('utf8');
      const delim = fileType === 'tsv' ? '\t' : ',';
      const lines = text.split(/\r?\n/).filter(l => l.length);
      rows = lines.map(line => splitCSV(line, delim));
    }

    const header = (rows[0] || []).map(h => String(h||'').trim());
    const body = rows.slice(1);

    await jobRef.set({
      status: 'parsed',
      preview: { header, rows: body.slice(0, 100) },
      rowsTotal: body.length,
      parsedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch(e:any){
    await jobRef.set({ status: 'error', error: `Error parsing file: ${e?.message || e}` }, { merge: true });
    await jobRef.collection('issues').add({
      type: 'parsing', severity: 'error', message: `Error parsing file: ${e?.message || e}`,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

// RFC4180-friendly splitter for CSV + simple TSV
function splitCSV(line: string, delim: string){
  if (delim === '\t') return line.split('\t');
  const out: string[] = []; let cur = ''; let inQ = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"'){
      if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ){ out.push(cur); cur=''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.replace(/^\s+|\s+$/g, ''));
}