import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import levenshtein from 'js-levenshtein';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

interface DedupeConfig {
  jobId: string;
  keyFields?: string[]; // e.g., ['email'] or ['first_name','last_name','company_name']
  fuzzyFields?: { field: string; threshold?: number }[]; // levenshtein distance threshold per field
  limit?: number; // rows to scan (sample)
}

function norm(v: any) { return String(v||'').trim().toLowerCase(); }

function fuzzyScore(a: string, b: string) {
  if (!a || !b) return 0;
  const d = levenshtein(a, b);
  const L = Math.max(a.length, b.length) || 1;
  return 1 - d / L; // 1.0 identical, ~0.0 far
}

export const dedupeScan = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { jobId, keyFields = [], fuzzyFields = [], limit = 200 } = req.body as DedupeConfig;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    const rowsSnap = await db.collection('jobs').doc(jobId).collection('rows').limit(Math.min(2000, limit)).get();
    const rows = rowsSnap.docs.map(d => ({ id: d.id, ...(d.data()?.normalized || d.data()?.data || {}) }));

    const buckets = new Map<string, string[]>();
    // deterministic key bucketing
    for (const r of rows) {
      const key = keyFields.map(k => norm((r as any)[k])).join('|');
      if (!key) continue;
      const arr = buckets.get(key) || [];
      arr.push(r.id);
      buckets.set(key, arr);
    }

    // produce issues for buckets with >1
    let duplicates = 0;
    for (const [key, ids] of buckets.entries()) {
      if (ids.length <= 1) continue;
      duplicates += ids.length - 1;
      for (const id of ids) {
        await db.collection('jobs').doc(jobId).collection('issues').add({
          rowId: id,
          field: keyFields.join(','),
          ruleId: 'dedupe-key',
          problem: `Potential duplicate key: ${key}`,
          suggestion: { cluster: ids },
          confidence: 0.95,
          severity: 'warning',
          source: 'deterministic',
          status: 'open',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // fuzzy match (pairwise sample) — O(n^2) on sample, keep small
    const fuzzIssues: any[] = [];
    const fuzzPairs = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        let score = 0;
        for (const f of fuzzyFields) {
          const th = f.threshold ?? 0.85;
          const s = fuzzyScore(norm((rows[i] as any)[f.field]), norm((rows[j] as any)[f.field]));
          score = Math.max(score, s);
        }
        if (score >= 0.9) {
          const id1 = rows[i].id, id2 = rows[j].id;
          const key = id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
          if (fuzzPairs.has(key)) continue;
          fuzzPairs.add(key);
          fuzzIssues.push({
            rowId: id1,
            field: fuzzyFields.map(f => f.field).join(','),
            ruleId: 'dedupe-fuzzy',
            problem: `High similarity to row ${id2}`,
            suggestion: { match: id2, score },
            confidence: score,
            severity: 'info',
            source: 'deterministic',
            status: 'open',
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    if (fuzzIssues.length) {
      const writer = db.bulkWriter();
      for (const it of fuzzIssues) writer.create(db.collection('jobs').doc(jobId).collection('issues').doc(), it);
      await writer.close();
    }

    res.json({ scanned: rows.length, dupKeyCount: duplicates, fuzzyPairs: fuzzIssues.length });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
