
import { onRequest as onRequestUpload } from 'firebase-functions/v2/https';
import { Storage } from '@google-cloud/storage';
import { initializeApp as init2, getApps as getApps2 } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getDb2, FieldValue as FieldValue2 } from 'firebase-admin/firestore';

if (getApps2().length === 0) init2();
const st = new Storage();
const db2 = getDb2();

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
    const jobId = String(req.query.jobId || 'job-' + Math.random().toString(36).slice(2));
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
      fileType: filename.split('.').pop(),
      status: 'queued',
      createdAt: FieldValue2.serverTimestamp(),
    }, { merge: true });

    return res.status(200).send(JSON.stringify({ ok: true, jobId, path: `gs://${bucket}/${path}` }));
  } catch (e: any) {
    const msg = e?.message || String(e);
    return res.status(500).send(JSON.stringify({ error: msg }));
  }
});
