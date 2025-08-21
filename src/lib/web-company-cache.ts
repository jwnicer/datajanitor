import { onRequest as onReq } from 'firebase-functions/v2/https';
import { initializeApp as init2, getApps as getApps2 } from 'firebase-admin/app';
import { getFirestore as getDb } from 'firebase-admin/firestore';

if (getApps2().length === 0) init2();
const dbC = getDb();

// Cache schema: collection `webCache` documents keyed by lower(name)|lower(location)
// { key, name, location, website, confidence, evidence, updatedAt }

function cacheKey(name: string, location?: string) {
  return `${String(name).toLowerCase()}|${String(location||'').toLowerCase()}`;
}

export const cacheSet = onReq({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { name, location, website, confidence, evidence } = req.body || {};
    if (!name || !website) return res.status(400).json({ error: 'name and website required' });
    const key = cacheKey(name, location);
    await dbC.collection('webCache').doc(key).set({ key, name, location: location||null, website, confidence: Number(confidence||0), evidence: evidence||[], updatedAt: new Date() }, { merge: true });
    res.json({ ok: true, key });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

export const cacheGet = onReq({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { name, location } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const key = cacheKey(name, location);
    const snap = await dbC.collection('webCache').doc(key).get();
    if (!snap.exists) return res.json({ hit: false });
    res.json({ hit: true, ...(snap.data() || {}) });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
