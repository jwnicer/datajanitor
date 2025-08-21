
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { VertexAI } from '@google-cloud/vertexai';

if (getApps().length === 0) initializeApp();

const PROJECT = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.VERTEX_MODEL || 'models/gemini-2.5-pro';

const CANON = [
  'company_name','company_website','email','phone','country','state','city','zip','address','address_line1','address_line2',
  'insured_name','policy_number','policy_type','effective_date','expiration_date','premium','naic','vin','type','website'
];

function safeJSON<T=any>(t: string): T | null { try { return JSON.parse(t); } catch { return null; } }

export const schemaPropose = onRequest({ cors: true, maxInstances: 5 }, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'Use POST' }));
    const { header, sampleRows } = req.body || {};
    if (!Array.isArray(header) || !Array.isArray(sampleRows)) return res.status(400).send(JSON.stringify({ error: 'Provide { header: string[], sampleRows: any[][] }' }));

    const vertex = new VertexAI({ project: PROJECT, location: LOCATION });
    const model = vertex.getGenerativeModel({ model: MODEL });

    const prompt = `You are a strict JSON generator for schema mapping.\nReturn ONLY valid JSON with this exact schema:\n{\n  "mapping": Array<{ source: string, target: string, inferredType: \"string\"|\"integer\"|\"float\"|\"boolean\"|\"date\"|\"email\"|\"phone\"|\"url\"|\"currency\"|\"enum\"|\"unknown\", confidence: number, reason?: string, enumValues?: string[] }>\n}\nTargets must be chosen only from this list: ${CANON.join(', ')}.\nPrefer high confidence. If unsure, choose the most likely and keep reason short.\n\nHEADER:\n${JSON.stringify(header)}\n\nSAMPLE_ROWS (first up to 50):\n${JSON.stringify(sampleRows.slice(0,50))}\n\nOutput JSON ONLY. No markdown, no prose.`;

    const resp = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const text = resp?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const json = safeJSON<{ mapping: any[] }>(text);
    if (!json || !Array.isArray(json.mapping)) return res.status(200).send(JSON.stringify({ mapping: [], note: 'Model did not return JSON; check prompt or inputs.' }));
    return res.send(JSON.stringify({ mapping: json.mapping }));
  } catch (e: any) {
    return res.status(500).send(JSON.stringify({ error: e?.message || String(e) }));
  }
});
