import { onRequest } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { Storage } from '@google-cloud/storage';
import * as crypto from 'crypto';

// ----- Admin init -----
if (!getApps().length) initializeApp();
const db = getFirestore();
const gcs = new Storage();
const DEFAULT_BUCKET = process.env.UPLOAD_BUCKET
  || process.env.GCLOUD_STORAGE_BUCKET
  || (() => { try { return getAdminStorage().bucket().name; } catch { return ''; } })();
if (!DEFAULT_BUCKET) console.warn('[WARN] No bucket env set; set UPLOAD_BUCKET to your default bucket name');

// ----- Helpers -----
function b64json<T=any>(b64?: string): T | null { try { return b64 ? JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) : null; } catch { return null; } }

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
function allowCORS(res: any){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type,x-file-name,x-schema-mapping');
}

// ===========================================================================
// 1) HTTP Upload — uses rawBody, creates Job doc idempotently, returns JSON
// ===========================================================================
export const upload = onRequest({ cors: true, maxInstances: 5 }, async (req, res) => {
  allowCORS(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  res.setHeader('Content-Type','application/json');
  try{
    if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'Use POST' }));

    const bucketName = DEFAULT_BUCKET; if (!bucketName) throw new Error('UPLOAD_BUCKET not set');

    // Auth
    const authHeader = req.headers.authorization || '';
    let uid = 'anonymous';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const decoded = await getAuth().verifyIdToken(token);
        uid = decoded.uid;
      } catch (e) {
        // Ignore invalid tokens, treat as anonymous
      }
    }

    // Params
    const fileName = (req.headers['x-file-name'] as string) || 'upload.bin';
    const jobId = (req.query.jobId as string) || `job-${crypto.randomBytes(3).toString('hex')}`;
    const ruleSetId = (req.query.ruleSetId as string) || 'default';
    const mapping = b64json(req.headers['x-schema-mapping'] as string | undefined);

    // Body
    const raw = req.rawBody; if (!raw || !raw.length) throw new Error('Empty request body');

    const destPath = `uploads/${uid}/${jobId}/${fileName}`;
    await gcs.bucket(bucketName).file(destPath).save(raw, {
      contentType: (req.headers['content-type'] as string) || 'application/octet-stream',
      metadata: { metadata: { uid: uid, jobId, ruleSetId } }
    });

    // Create/merge Job doc BEFORE the trigger runs
    const fileType = inferType(fileName, req.headers['content-type'] as string | undefined);
    await db.collection('jobs').doc(jobId).set({
      status: 'uploaded', filename: fileName, fileType, path: destPath,
      createdBy: uid, ruleSetId, createdAt: FieldValue.serverTimestamp(),
      schema: mapping || null,
    }, { merge: true });

    return res.send(JSON.stringify({ ok: true, jobId, path: destPath, fileType }));
  } catch(e:any){
    return res.status(500).send(JSON.stringify({ error: e?.message || String(e) }));
  }
});