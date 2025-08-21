/*
  Batch 2 — Pipeline Workers (Firebase / GCP)
  -------------------------------------------------
  Responsibilities
  - Storage finalize trigger -> create Job + enqueue parse job (Pub/Sub)
  - Pub/Sub worker -> download file, parse (CSV/TSV/XLSX/JSONL),
    apply deterministic RuleEngine (Batch 1), write Issues/Rows to Firestore,
    and stream a normalized NDJSON export to Cloud Storage.

  Assumptions
  - Upload path: uploads/{uid}/{jobId}/{filename}
  - Firestore data model aligns with PRD (jobs, issues, rows collections)
  - RuleSet is loaded by job.ruleSetId (here: demo `loadRuleSetForJob`)

  External deps (add to package.json):
    "firebase-admin": "^12",
    "firebase-functions": "^5",
    "@google-cloud/pubsub": "^4",
    "@google-cloud/storage": "^7",
    "csv-parse": "^5",
    "xlsx": "^0.18.5" (or latest)

  Internal deps (from Batch 1):
    RuleEngine, RuleSet, simpleCountryMapper, simpleStateMapper

  Environment (set via functions:config or env):
    UPLOAD_BUCKET            # if different from default bucket
    EXPORT_BUCKET            # where to write normalized NDJSON
    PARSE_TOPIC              # Pub/Sub topic for parse jobs, e.g., "jobs-parse"
    DEFAULT_COUNTRY=US
*/

import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import * as logger from 'firebase-functions/logger';
import { PubSub } from '@google-cloud/pubsub';
import { Storage } from '@google-cloud/storage';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { parse as csvParse } from 'csv-parse';
import * as XLSX from 'xlsx';
import { Readable } from 'node:stream';
import { pipeline as nodePipeline } from 'node:stream/promises';

// NOTE: adjust the import path based on your repo layout
import { RuleEngine, RuleSet, simpleCountryMapper, simpleStateMapper } from './rules-engine';
import { customCodeRegistry } from './custom-code-registry';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
const storage = new Storage();
const pubsub = new PubSub();

const PARSE_TOPIC = process.env.PARSE_TOPIC || 'jobs-parse';
const DEFAULT_COUNTRY = process.env.DEFAULT_COUNTRY || 'US';
const EXPORT_BUCKET = process.env.EXPORT_BUCKET || process.env.GCLOUD_STORAGE_BUCKET || (process.env.FUNCTIONS_EMULATOR ? undefined : undefined);

// --------------------------------------------
// Helpers
// --------------------------------------------

type UploadPathParts = { uid: string; jobId: string; filename: string };

function parseUploadPath(path?: string): UploadPathParts | null {
  if (!path) return null;
  // expected uploads/{uid}/{jobId}/{filename}
  const parts = path.split('/');
  if (parts.length < 4 || parts[0] !== 'uploads') return null;
  const [_, uid, jobId, ...rest] = parts;
  const filename = rest.join('/');
  return { uid, jobId, filename };
}

function inferType(filename: string, contentType?: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return 'csv';
  if (ext === 'tsv') return 'tsv';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'jsonl' || ext === 'ndjson') return 'jsonl';
  if (contentType?.includes('spreadsheetml')) return 'xlsx';
  if (contentType?.includes('csv')) return 'csv';
  return 'csv';
}

function makeIssueDoc(jobId: string) {
  return db.collection('jobs').doc(jobId).collection('issues').doc();
}

function makeRowDoc(jobId: string, rowId: string) {
  return db.collection('jobs').doc(jobId).collection('rows').doc(rowId);
}

async function updateJob(jobId: string, patch: Record<string, any>) {
  await db.collection('jobs').doc(jobId).set(patch, { merge: true });
}

async function publishParseMessage(data: any) {
  const topic = pubsub.topic(PARSE_TOPIC);
  const buffer = Buffer.from(JSON.stringify(data));
  await topic.publishMessage({ data: buffer });
}

// --------------------------------------------
// Trigger: Storage -> enqueue parse job
// --------------------------------------------
export const onUpload = onObjectFinalized({ bucket: process.env.UPLOAD_BUCKET }, async (event) => {
  const obj = event.data;
  const name = obj.name || '';
  const meta = parseUploadPath(name);
  if (!meta) {
    logger.warn('Ignoring file outside expected path', name);
    return;
  }
  const { uid, jobId, filename } = meta;
  const fileType = inferType(filename, obj.contentType || undefined);

  await updateJob(jobId, {
    status: 'queued',
    filename,
    fileType,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
  });

  await publishParseMessage({ bucket: obj.bucket, name, uid, jobId, fileType });
  logger.info('Enqueued parse job', { jobId, name });
});

// --------------------------------------------
// Worker: Pub/Sub -> parse & validate
// --------------------------------------------
export const parseWorker = onMessagePublished({ topic: PARSE_TOPIC }, async (event) => {
  const msg = event.data?.message?.data ? JSON.parse(Buffer.from(event.data.message.data, 'base64').toString()) : {};
  const { bucket, name, jobId, fileType } = msg;
  if (!bucket || !name || !jobId) {
    logger.error('Missing required fields in message', msg);
    return;
  }

  try {
    await updateJob(jobId, { status: 'parsing' });

    const gcsFile = storage.bucket(bucket).file(name);
    const [exists] = await gcsFile.exists();
    if (!exists) throw new Error(`File not found: gs://${bucket}/${name}`);

    // Prepare export stream (NDJSON of normalized rows)
    const exportBucket = process.env.EXPORT_BUCKET || bucket;
    const exportFile = storage.bucket(exportBucket).file(`exports/${jobId}/normalized.ndjson`);
    await exportFile.save('', { resumable: false }); // create/truncate
    const exportStream = exportFile.createWriteStream({ resumable: false, gzip: false });

    // Load RuleSet for this job (replace with your own config source)
    const ruleSet = await loadRuleSetForJob(jobId);
    const engine = new RuleEngine(ruleSet, {
      defaultCountry: DEFAULT_COUNTRY,
      countryMapper: simpleCountryMapper,
      stateMapper: simpleStateMapper,
      fuzzyMaxDistance: 2,
      customCodeRegistry,
    });

    // Counters
    let rowCount = 0;
    let deterministicIssues = 0;

    await updateJob(jobId, { status: 'validating' });

    // BulkWriter for Firestore
    const writer = db.bulkWriter();

    const handleRow = async (row: Record<string, any>, idx: number) => {
      // normalize headers: trim keys
      const normalizedInput: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) normalizedInput[String(k).trim()] = v;

      const rowId = getStableRowId(normalizedInput, idx);
      const { normalizedRow, issues } = await engine.applyRow(normalizedInput, rowId);

      // Write row doc
      writer.set(makeRowDoc(jobId, rowId), { data: normalizedInput, normalized: normalizedRow });

      // Write issues
      for (const issue of issues) {
        deterministicIssues++;
        writer.set(makeIssueDoc(jobId), issue);
      }

      // Append to NDJSON export
      exportStream.write(JSON.stringify({ rowId, ...normalizedRow }) + '\n');

      rowCount++;
      if (rowCount % 2000 === 0) logger.info(`Processed ${rowCount} rows...`);
    };

    // Dispatch based on file type
    if (fileType === 'csv' || fileType === 'tsv') {
      await parseCSV({ bucket, name, delimiter: fileType === 'tsv' ? '\t' : ',' }, handleRow);
    } else if (fileType === 'xlsx') {
      await parseXLSX({ bucket, name }, handleRow);
    } else if (fileType === 'jsonl') {
      await parseJSONL({ bucket, name }, handleRow);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    await writer.close();
    await new Promise((res, rej) => exportStream.end(res));

    await updateJob(jobId, {
      status: 'review',
      rowCount,
      metrics: { deterministicIssues },
      exportPath: `gs://${exportBucket}/exports/${jobId}/normalized.ndjson`,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('Job finished', { jobId, rowCount, deterministicIssues });
  } catch (e: any) {
    logger.error('Job failed', { jobId, error: e?.message || e });
    await updateJob(jobId, { status: 'error', error: String(e?.message || e) });
    throw e;
  }
});

// --------------------------------------------
// Parsers
// --------------------------------------------

async function parseCSV(
  opts: { bucket: string; name: string; delimiter?: string },
  onRow: (row: Record<string, any>, idx: number) => Promise<void>
) {
  const { bucket, name, delimiter } = opts;
  const file = storage.bucket(bucket).file(name);
  const read = file.createReadStream();

  let idx = 0;
  const parser = csvParse({ columns: true, delimiter: delimiter || ',', bom: true, relax_column_count: true, skip_empty_lines: true });

  parser.on('readable', async () => {
    let record: any;
    while ((record = parser.read())) {
      // await inside stream: queue microtasks to avoid backpressure issues
      await onRow(record, idx++);
    }
  });

  await nodePipeline(read, parser);
}

async function parseXLSX(
  opts: { bucket: string; name: string },
  onRow: (row: Record<string, any>, idx: number) => Promise<void>
) {
  const { bucket, name } = opts;
  const [buf] = await storage.bucket(bucket).file(name).download();
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  let idx = 0;
  for (const r of rows) {
    await onRow(r, idx++);
  }
}

async function parseJSONL(
  opts: { bucket: string; name: string },
  onRow: (row: Record<string, any>, idx: number) => Promise<void>
) {
  const { bucket, name } = opts;
  const file = storage.bucket(bucket).file(name);
  const stream = file.createReadStream();

  let leftover = '';
  let idx = 0;
  await new Promise<void>((resolve, reject) => {
    stream
      .on('data', async (chunk: Buffer) => {
        const text = leftover + chunk.toString('utf8');
        const lines = text.split('\n');
        leftover = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            await onRow(obj, idx++);
          } catch (e) {
            // Skip malformed line but continue
          }
        }
      })
      .on('end', async () => {
        if (leftover.trim()) {
          try { await onRow(JSON.parse(leftover), idx++); } catch {}
        }
        resolve();
      })
      .on('error', reject);
  });
}

// --------------------------------------------
// RuleSet loading (replace with your own logic/UI)
// --------------------------------------------
async function loadRuleSetForJob(jobId: string): Promise<RuleSet> {
  const jobSnap = await db.collection('jobs').doc(jobId).get();
  const job = jobSnap.data() || {};
  // If you store a ruleSetId on the job, load it here; else return a sensible default.
  const ruleSetId = job.ruleSetId;
  if (ruleSetId) {
    const rs = await db.collection('ruleSets').doc(ruleSetId).get();
    if (rs.exists) return rs.data() as RuleSet;
  }
  // Default minimal rules — customize as needed
  const defaultRuleSet: RuleSet = {
    name: 'Default',
    version: 1,
    rules: [
      { id: 'req-company', label: 'Company required', appliesTo: ['company_name'], validator: 'required', enabled: true, severity: 'error' },
      { id: 'email', label: 'Email normalize', appliesTo: ['email'], validator: 'email', fix: { strategy: 'auto_fix' }, enabled: true },
      { id: 'phone', label: 'Phone normalize', appliesTo: ['phone'], validator: 'phone', fix: { strategy: 'suggest_only' }, enabled: true },
      { id: 'country', label: 'Country ISO2', appliesTo: ['country'], validator: 'country', fix: { strategy: 'auto_fix' }, enabled: true },
    ],
    dictionaries: {},
  };
  return defaultRuleSet;
}

// --------------------------------------------
// Misc utilities
// --------------------------------------------
function getStableRowId(row: Record<string, any>, idx: number) {
  // prefer an existing id-like field, else fallback
  for (const k of Object.keys(row)) {
    if (/^(id|row_?id|uuid)$/i.test(k) && row[k]) return String(row[k]);
  }
  return `row-${idx + 1}`;
}
