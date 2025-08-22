
import { llmAdhoc, llmBatch } from '@/lib/llm-adapter';
import { onUpload as onUploadRequest } from '@/lib/pipeline-workers';
import { webCompany, webCompanyBulk } from '@/lib/llm-adapter';
import { issuesApply, issuesApplySafe, issuesGet, issuesReject, rulesGet, rulesSave } from '@/lib/issues-review';
import { exportBQ } from '@/lib/bq-export';
import { upload } from '@/lib/upload';
import { dedupeScan } from '@/lib/dedupe';
import { cacheGet, cacheSet } from '@/lib/web-company-cache';
import { schemaPropose } from '@/lib/schema-propose';
import { Buffer } from 'node:buffer';

// This is a catch-all route that proxies requests to the appropriate Cloud Function.
// This is used for local development to simulate the Firebase Hosting rewrites.
// In production, Firebase Hosting will directly call the functions.

const handlerMap: Record<string, Function> = {
    'upload': upload,
    'llm/adhoc': llmAdhoc,
    'llm/batch': llmBatch,
    'web/company': webCompany,
    'web/company/bulk': webCompanyBulk,
    'issues': issuesGet,
    'issues/apply': issuesApply,
    'issues/reject': issuesReject,
    'issues/apply-safe': issuesApplySafe,
    'rules': (req: any, res: any) => {
        if (req.method === 'POST') return rulesSave(req, res);
        return rulesGet(req, res);
    },
    'export/bq': exportBQ,
    'dedupe/scan': dedupeScan,
    'cache/get': cacheGet,
    'cache/set': cacheSet,
    'schema/propose': schemaPropose,
};

async function toExpressReq(req: Request) {
    const url = new URL(req.url);
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => { headers[k] = v; });
    const rawBuffer = Buffer.from(await req.arrayBuffer());
    let body: any = rawBuffer;
    const ct = headers['content-type'] || '';
    if (ct.includes('application/json')) {
        try { body = JSON.parse(rawBuffer.toString('utf8')); } catch { body = {}; }
    }
    return { method: req.method, headers, query: Object.fromEntries(url.searchParams), rawBody: rawBuffer, body };
}

function createExpressRes() {
    const headers: Record<string, string> = {};
    let status = 200;
    let body: any;
    return {
        setHeader(key: string, value: string) { headers[key] = value; },
        getHeader(key: string) { return headers[key]; },
        status(code: number) { status = code; return this; },
        send(data: any) { body = data; return this; },
        json(data: any) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(data); return this; },
        end(data: any) { if (data !== undefined) body = data; return this; },
        get statusCode() { return status; },
        get headersObj() { return headers; },
        get bodyData() { return body; },
    };
}

const handle = async (req: Request, { params }: { params: { handler: string[] } }) => {
    const path = params.handler.join('/');
    const handleFn = handlerMap[path];

    if (!handleFn) return new Response('Not Found', { status: 404 });

    try {
        const expressReq = await toExpressReq(req);
        const expressRes = createExpressRes();
        await handleFn(expressReq, expressRes);
        const headers = new Headers(expressRes.headersObj);
        const body = expressRes.bodyData ?? '';
        return new Response(body, { status: expressRes.statusCode, headers });
    } catch (e: any) {
        return new Response(String(e?.message || e), { status: 500 });
    }
}

export { handle as GET, handle as POST };
