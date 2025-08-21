
import { onRequest as onRequestUpload } from 'firebase-functions/v2/https';
import { Storage } from '@google-cloud/storage';
import { initializeApp as init2, getApps as getApps2 } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getDb2, FieldValue as FieldValue2 } from 'firebase-admin/firestore';

if (getApps2().length === 0) init2();
const st = new Storage();
const db2 = getDb2();

export const upload = onRequestUpload({ cors: true, maxInstances: 10 }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    const decoded = await getAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const jobId = String(req.query.jobId || 'job-' + Math.random().toString(36).slice(2));
    const ruleSetId = String(req.query.ruleSetId || 'default');

    const filename = req.headers['x-file-name'] ? String(req.headers['x-file-name']) : `upload-${Date.now()}`;
    const bucket = process.env.UPLOAD_BUCKET || process.env.GCLOUD_STORAGE_BUCKET!;
    const path = `uploads/${uid}/${jobId}/${filename}`;

    await st.bucket(bucket).file(path).save(req.rawBody, { resumable: false, metadata: { contentType: req.headers['content-type'] as string } });

    await db2.collection('jobs').doc(jobId).set({ createdBy: uid, ruleSetId, filename, fileType: filename.split('.').pop(), status: 'queued', createdAt: FieldValue2.serverTimestamp() }, { merge: true });

    res.json({ ok: true, jobId, path: `gs://${bucket}/${path}` });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
