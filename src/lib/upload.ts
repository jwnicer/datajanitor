
import { onRequest as onRequestUpload } from 'firebase-functions/v2/https';
import { Storage } from '@google-cloud/storage';
import { initializeApp as init2, getApps as getApps2 } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getDb2, FieldValue as FieldValue2 } from 'firebase-admin/firestore';
import { parse as csvParse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

if (getApps2().length === 0) init2();
const st = new Storage();
const db2 = getDb2();

function getHeaders(fileBuffer: Buffer, filename: string): string[] {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension === 'csv' || extension === 'tsv') {
        const records = csvParse(fileBuffer, {
            columns: true,
            skip_empty_lines: true,
            to: 1,
        });
        return records.length > 0 ? Object.keys(records[0]) : [];
    } else if (extension === 'xlsx' || extension === 'xls') {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        return json.length > 0 ? (json[0] as string[]) : [];
    }
    return [];
}


export const upload = onRequestUpload({ cors: true, maxInstances: 10 }, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'Use POST' }));

    // Auth is now optional. If token provided, we associate with user.
    let uid = 'anonymous';
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const decoded = await getAdminAuth().verifyIdToken(token);
        uid = decoded.uid;
      } catch (e) {
        // Ignore invalid tokens, treat as anonymous
      }
    }

    // Params
    const jobId = String(req.query.jobId || 'job-' + Math.random().toString(36).slice(2, 8));
    const ruleSetId = String(req.query.ruleSetId || 'default');
    const filename = (req.headers['x-file-name'] as string) || `upload-${Date.now()}`;

    // Ensure we have a body (raw bytes)
    const getBody = async (): Promise<Buffer> => {
      const anyReq = req as any;
      if (anyReq.rawBody && Buffer.isBuffer(anyReq.rawBody) && anyReq.rawBody.length > 0) return anyReq.rawBody;
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      return Buffer.concat(chunks);
    };

    const body = await getBody();
    if (!body || body.length === 0) throw new Error('Empty upload body');

    const headers = getHeaders(body, filename);

    // Bucket & path
    const bucket = process.env.UPLOAD_BUCKET || process.env.GCLOUD_STORAGE_BUCKET;
    if (!bucket) throw new Error('UPLOAD_BUCKET or GCLOUD_STORAGE_BUCKET is not set');
    const path = `uploads/${uid}/${jobId}/${filename}`;

    // Save
    await st.bucket(bucket).file(path).save(body, {
      resumable: false,
      metadata: { contentType: (req.headers['content-type'] as string) || 'application/octet-stream' },
    });

    // Create/merge Job doc
    await db2.collection('jobs').doc(jobId).set({
      createdBy: uid,
      ruleSetId,
      filename,
      status: 'queued',
      createdAt: FieldValue2.serverTimestamp(),
      headers: headers
    }, { merge: true });

    return res.status(200).send(JSON.stringify({ ok: true, jobId, path: `gs://${bucket}/${path}`, headers, filename }));
  } catch (e: any) {
    const msg = e?.message || String(e);
    return res.status(500).send(JSON.stringify({ error: msg }));
  }
});
