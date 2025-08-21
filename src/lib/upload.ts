
import { onRequest as onRequestUpload } from 'firebase-functions/v2/https';
import { Storage } from '@google-cloud/storage';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp();
const st = new Storage();
const db = getFirestore();

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
        const decoded = await getAuth().verifyIdToken(token);
        uid = decoded.uid;
      } catch (e) {
        // Ignore invalid tokens, treat as anonymous
      }
    }

    // Params
    const jobId = String(req.query.jobId || 'job-' + Math.random().toString(36).slice(2, 8));
    const ruleSetId = String(req.query.ruleSetId || 'default');
    const filename = (req.headers['x-file-name'] as string) || `upload-${Date.now()}`;

    // v2: body should be available as Buffer in rawBody when Content-Type is octet-stream
    const anyReq = req as any;
    const body: Buffer | undefined = anyReq?.rawBody;
    if (!body || !Buffer.isBuffer(body) || body.length === 0) {
      throw new Error('Empty rawBody. Ensure the client sets Content-Type: application/octet-stream and sends the file bytes.');
    }

    // Optional schema mapping header
    let schema: any = undefined;
    const mapHeader = req.headers['x-schema-mapping'];
    if (mapHeader && typeof mapHeader === 'string') {
      try { schema = JSON.parse(Buffer.from(mapHeader, 'base64').toString('utf8')); } catch {}
    }

    const bucket = process.env.UPLOAD_BUCKET || process.env.GCLOUD_STORAGE_BUCKET;
    if (!bucket) throw new Error('UPLOAD_BUCKET or GCLOUD_STORAGE_BUCKET is not set');
    const path = `uploads/${uid}/${jobId}/${filename}`;

    await st.bucket(bucket).file(path).save(body, {
      resumable: false,
      metadata: { contentType: (req.headers['content-type'] as string) || 'application/octet-stream' },
    });

    const jobDoc: any = {
      createdBy: uid,
      ruleSetId,
      filename,
      fileType: filename.split('.').pop(),
      status: 'queued',
      createdAt: FieldValue.serverTimestamp(),
    };
    if (schema) jobDoc.schema = schema;

    await db.collection('jobs').doc(jobId).set(jobDoc, { merge: true });

    return res.status(200).send(JSON.stringify({ ok: true, jobId, path: `gs://${bucket}/${path}`, schemaSaved: !!schema }));
  } catch (e: any) {
    const msg = e?.message || String(e);
    return res.status(500).send(JSON.stringify({ error: msg }));
  }
});
