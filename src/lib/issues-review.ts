
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Query } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

async function applyIssue(jobId: string, issueId: string) {
  const ref = db.collection('jobs').doc(jobId).collection('issues').doc(issueId);
  const snap = await ref.get();
  if (!snap.exists) return { issueId, ok: false, reason: 'not-found' };
  const issue = snap.data() as any;
  if (issue.status !== 'open') return { issueId, ok: false, reason: 'already-closed' };
  
  const rowRef = db.collection('jobs').doc(jobId).collection('rows').doc(issue.rowId);
  const rowSnap = await rowRef.get();
  if (!rowSnap.exists) return { issueId, ok: false, reason: 'row-not-found' };

  const field = issue.field;
  const suggestion = issue.suggestion;
  if (field && suggestion !== undefined && suggestion !== null) {
    await rowRef.set({ normalized: { [field]: suggestion } }, { merge: true });
  }
  await ref.set({ status: 'accepted', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { issueId, ok: true };
}

export const issuesGet = onRequest({ cors: true }, async (req, res) => {
    try {
        const { jobId, status, source, severity, limit = 100 } = req.query;
        if (!jobId) return res.status(400).json({ error: 'jobId required' });

        let q: Query = db.collection('jobs').doc(String(jobId)).collection('issues');
        if (status) q = q.where('status', '==', String(status));
        if (source) q = q.where('source', '==', String(source));
        if (severity) q = q.where('severity', '==', String(severity));

        const snap = await q.limit(Number(limit)).get();
        const issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return res.json(issues);
    } catch(e: any) {
        logger.error('issuesGet error', e);
        return res.status(500).json({ error: String(e?.message || e) });
    }
});

export const issuesApply = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { jobId, issueIds } = req.body || {};
    if (!jobId || !Array.isArray(issueIds)) return res.status(400).json({ error: 'jobId and issueIds[] required' });
    const results = [] as any[];
    for (const id of issueIds) results.push(await applyIssue(jobId, String(id)));
    return res.json({ results });
  } catch (e: any) {
    logger.error('issuesApply error', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

export const issuesReject = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { jobId, issueIds } = req.body || {};
    if (!jobId || !Array.isArray(issueIds)) return res.status(400).json({ error: 'jobId and issueIds[] required' });
    const writer = db.bulkWriter();
    for (const id of issueIds) {
      const ref = db.collection('jobs').doc(jobId).collection('issues').doc(String(id));
      writer.set(ref, { status: 'rejected', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await writer.close();
    return res.json({ ok: true, count: issueIds.length });
  } catch (e: any) {
    logger.error('issuesReject error', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

export const issuesApplySafe = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { jobId, minConfidence = 0.9 } = req.body || {};
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const qs = await db.collection('jobs').doc(jobId).collection('issues')
      .where('status', '==', 'open').where('confidence', '>=', Number(minConfidence)).get();
    let applied = 0;
    for (const d of qs.docs) { await applyIssue(jobId, d.id); applied++; }
    return res.json({ applied, minConfidence });
  } catch (e: any) {
    logger.error('issuesApplySafe error', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

export const rulesGet = onRequest({cors: true}, async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({error: 'id is required'});
    const ruleSet = await db.collection('ruleSets').doc(String(id)).get();
    if (!ruleSet.exists) return res.status(404).json({error: 'not found'});
    return res.json(ruleSet.data());
});

export const rulesSave = onRequest({cors: true}, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { id, ruleSet } = req.body;
    if (!id || !ruleSet) return res.status(400).json({error: 'id and ruleSet are required'});
    await db.collection('ruleSets').doc(id).set(ruleSet, {merge: false});
    return res.json({ok: true});
});
