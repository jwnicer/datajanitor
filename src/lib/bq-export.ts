
import { onRequest as onRequestBQ } from 'firebase-functions/v2/https';
import { BigQuery } from '@google-cloud/bigquery';

export const exportBQ = onRequestBQ({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Use POST');
    const { jobId, dataset, table } = req.body || {};
    if (!jobId || !dataset || !table) return res.status(400).json({ error: 'jobId, dataset, table required' });

    const projectId = process.env.GCP_PROJECT!;
    const bucket = process.env.EXPORT_BUCKET || process.env.GCLOUD_STORAGE_BUCKET!;
    const uri = `gs://${bucket}/exports/${jobId}/normalized.ndjson`;

    const bq = new BigQuery({ projectId });
    const [ds] = await bq.dataset(dataset).get({ autoCreate: true, location: process.env.BQ_LOCATION || 'US' });
    await ds.table(table).get({ autoCreate: true, schema: undefined }).catch(() => {});

    const [job] = await bq
      .dataset(dataset)
      .table(table)
      .load(uri, {
        sourceFormat: 'NEWLINE_DELIMITED_JSON',
        autodetect: true,
        writeDisposition: 'WRITE_APPEND',
      });

    const [status] = await job.getMetadata();
    res.json({ state: status.status?.state, errors: status.status?.errors || null, outputRows: status.statistics?.load?.outputRows });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
