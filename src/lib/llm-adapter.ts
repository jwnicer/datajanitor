/*
  Batch 3 — Gemini 2.5 LLM Adapter + Web Enrichment (HTTP endpoints)
  -------------------------------------------------------------------
  - POST /llm/adhoc        -> free-form LLM inspection over selected rows/columns
  - POST /llm/batch        -> LLM review for rows with open issues or flagged rules
  - POST /web/company      -> find official company website for a single name
  - POST /web/company/bulk -> enrich many rows in a job with website candidates

  Environment:
    GCP_PROJECT
    VERTEX_LOCATION=us-central1
    VERTEX_MODEL=models/gemini-2.5-pro
    CSE_ID           # Google Programmable Search Engine ID
    CSE_KEY          # Google CSE API key

  Notes:
  - This file expects Firestore collections per PRD (jobs, rows, issues, ruleSets).
  - PII redaction: fields in ruleSet.pii.fields are removed before sending to LLM.
  - LLM JSON schema: { issues: [{ rowId, field, ruleId, problem, suggestion, confidence }] }
*/

import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fetch from 'node-fetch';
import { adHocLlmPrompt } from '@/ai/flows/ad-hoc-llm-prompting';
import { llmAssistedDataReview } from '@/ai/flows/llm-assisted-data-review';
import { enrichCompanyWebsite } from '@/ai/flows/company-website-enrichment';
import type { Rule, RuleSet, Severity } from './rules-engine';

// Types shared with RuleEngine context (local copy for independence)
export type FixSource = 'deterministic' | 'llm' | 'web';


if (getApps().length === 0) initializeApp();
const db = getFirestore();


// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
async function loadRuleSetForJob(jobId: string): Promise<RuleSet> {
  const jobSnap = await db.collection('jobs').doc(jobId).get();
  const job = jobSnap.data() || {};
  const ruleSetId = job.ruleSetId;
  if (ruleSetId) {
    const rs = await db.collection('ruleSets').doc(ruleSetId).get();
    if (rs.exists) return rs.data() as RuleSet;
  }
  return { name: 'Default', version: 1, rules: [], pii: { fields: [] } };
}

function redactRows(rows: any[], piiFields: string[] | undefined) {
  if (!piiFields || piiFields.length === 0) return rows;
  return rows.map((r) => {
    const copy: any = { ...r };
    for (const f of piiFields) if (f in copy) delete copy[f];
    return copy;
  });
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function writeIssues(jobId: string, issues: any[], source: FixSource) {
  const writer = db.bulkWriter();
  for (const it of issues) {
    const ref = db.collection('jobs').doc(jobId).collection('issues').doc();
    writer.set(ref, {
      ...it,
      severity: it.severity || 'warning',
      source,
      status: 'open',
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await writer.close();
}


// ---------------------------------------------------------------------
// HTTP: /llm/adhoc — free-form prompt over selected rows/columns
// Body: { jobId, prompt, rowIds?: string[], columns?: string[], limit?: number }
// ---------------------------------------------------------------------
export const llmAdhoc = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { jobId, prompt, rowIds, columns, limit = 20 } = req.body || {};
    if (!jobId || !prompt) return res.status(400).json({ error: 'jobId and prompt required' });

    const ruleSet = await loadRuleSetForJob(jobId);

    // Fetch sample rows
    let rowsQuery = db.collection('jobs').doc(jobId).collection('rows').limit(Math.min(200, limit));
    if (Array.isArray(rowIds) && rowIds.length > 0) {
      // Fetch directly if IDs provided (batch get)
      const snaps = await Promise.all(rowIds.map((id: string) => db.collection('jobs').doc(jobId).collection('rows').doc(id).get()));
      const rows = snaps.filter(s => s.exists).map(s => ({ rowId: s.id, ...(s.data()?.normalized || s.data()?.data || {}) }));
      const redacted = redactRows(rows, ruleSet.pii?.fields);
      const result = await adHocLlmPrompt({ prompt, sample: JSON.stringify(redacted), rules: JSON.stringify(ruleSet.rules) });
      const issues = [{ rowId: 'ad-hoc', field: '*', ruleId: 'ad-hoc-llm', problem: prompt, suggestion: result, confidence: 0.9 }];
      await writeIssues(jobId, issues, 'llm');
      return res.json({ count: rows.length, issues });
    }

    const snap = await rowsQuery.get();
    const rows = snap.docs.map(d => ({ rowId: d.id, ...(d.data()?.normalized || d.data()?.data || {}) }));
    const subset = columns && columns.length > 0 ? rows.map(r => { const s: any = { rowId: r.rowId }; for (const c of columns) s[c] = (r as any)[c]; return s; }) : rows;
    const redacted = redactRows(subset, ruleSet.pii?.fields);
    const result = await adHocLlmPrompt({ prompt, sample: JSON.stringify(redacted), rules: JSON.stringify(ruleSet.rules) });
    const issues = [{ rowId: 'ad-hoc', field: '*', ruleId: 'ad-hoc-llm', problem: prompt, suggestion: result, confidence: 0.9 }];
    await writeIssues(jobId, issues, 'llm');
    return res.json({ count: subset.length, issues });
  } catch (e: any) {
    logger.error('llmAdhoc error', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// ---------------------------------------------------------------------
// HTTP: /llm/batch — review rows that already have open deterministic issues
// Body: { jobId, limit?: number }
// ---------------------------------------------------------------------
export const llmBatch = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { jobId, limit = 50 } = req.body || {};
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    const ruleSet = await loadRuleSetForJob(jobId);

    // Find rowIds with open deterministic issues
    const issuesSnap = await db.collection('jobs').doc(jobId).collection('issues')
      .where('status', '==', 'open').where('source', '==', 'deterministic').limit(Math.min(200, limit)).get();

    const rowIds = Array.from(new Set(issuesSnap.docs.map(d => d.data().rowId))).slice(0, limit);
    if (rowIds.length === 0) return res.json({ message: 'No rows with open deterministic issues.' });

    const rowSnaps = await Promise.all(rowIds.map(id => db.collection('jobs').doc(jobId).collection('rows').doc(id).get()));
    const rows = rowSnaps.filter(s => s.exists).map(s => {
        const data = s.data();
        return { rowId: s.id, ...(data?.normalized || data?.data || {}) };
    });

    const batches = chunk(rows, 20);
    const allIssues: any[] = [];
    for (const b of batches) {
      const redacted = redactRows(b, ruleSet.pii?.fields);
      const { issues } = await llmAssistedDataReview({ rules: ruleSet.rules || [], rows: redacted });
      allIssues.push(...issues);
    }

    await writeIssues(jobId, allIssues, 'llm');
    return res.json({ reviewed: rows.length, issues: allIssues.length });
  } catch (e: any) {
    logger.error('llmBatch error', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// ---------------------------------------------------------------------
// HTTP: /web/company — single lookup
// Body: { name, location?, jobId?, rowId?, fieldName?="company_website" }
// ---------------------------------------------------------------------
export const webCompany = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { name, location, jobId, rowId, fieldName = 'company_website' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });

    const result = await enrichCompanyWebsite({companyName: name, location});
    if (jobId && rowId && result) {
      // write as a web-sourced suggestion issue
      const issue = {
        rowId,
        field: fieldName,
        ruleId: 'web-company-website',
        problem: `Suggest website for ${name}`,
        suggestion: { website: result.website, evidence: result.evidence },
        confidence: result.confidence,
        severity: 'info' as Severity,
        source: 'web' as FixSource,
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
      };
      await db.collection('jobs').doc(jobId).collection('issues').add(issue);
    }
    return res.json(result || { website: null, confidence: 0 });
  } catch (e: any) {
    logger.error('webCompany error', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// ---------------------------------------------------------------------
// HTTP: /web/company/bulk — enrich many rows lacking a website
// Body: { jobId, companyField="company_name", websiteField="company_website", limit=100 }
// ---------------------------------------------------------------------
export const webCompanyBulk = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { jobId, companyField = 'company_name', websiteField = 'company_website', limit = 100 } = req.body || {};
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    const rowsSnap = await db.collection('jobs').doc(jobId).collection('rows').limit(Math.min(500, limit)).get();
    const rows = rowsSnap.docs.map(d => ({ id: d.id, ...(d.data()?.normalized || d.data()?.data || {}) }));
    let enriched = 0;
    for (const r of rows) {
      const name = (r as any)[companyField];
      const existing = (r as any)[websiteField];
      if (!name || existing) continue;
      const result = await enrichCompanyWebsite({companyName: String(name)});
      if (!result?.website) continue;
      enriched++;
      await db.collection('jobs').doc(jobId).collection('issues').add({
        rowId: r.id,
        field: websiteField,
        ruleId: 'web-company-website',
        problem: `Suggest website for ${name}`,
        suggestion: { website: result.website, evidence: result.evidence },
        confidence: result.confidence,
        severity: 'info',
        source: 'web',
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return res.json({ scanned: rows.length, enriched });
  } catch (e: any) {
    logger.error('webCompanyBulk error', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});
