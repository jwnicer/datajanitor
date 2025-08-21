
import { llmAdhoc, llmBatch } from '@/lib/llm-adapter';
import { onUpload as onUploadRequest } from '@/lib/pipeline-workers';
import { webCompany, webCompanyBulk } from '@/lib/llm-adapter';
import { issuesApply, issuesApplySafe, issuesGet, issuesReject, rulesGet, rulesSave } from '@/lib/issues-review';
import { exportBQ } from '@/lib/bq-export';
import { upload } from '@/lib/upload';
import { dedupeScan } from '@/lib/dedupe';
import { cacheGet, cacheSet } from '@/lib/web-company-cache';
import { schemaPropose } from '@/lib/schema-propose';
import { processStart } from '@/lib/process-start';

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
    'rules': (req: Request) => {
        if (req.method === 'POST') return rulesSave(req as any, {} as any);
        return rulesGet(req as any, {} as any);
    },
    'export/bq': exportBQ,
    'dedupe/scan': dedupeScan,
    'cache/get': cacheGet,
    'cache/set': cacheSet,
    'schema/propose': schemaPropose,
    'process/start': processStart,
};

const handle = async (req: Request, { params }: { params: { handler: string[] } }) => {
    const path = params.handler.join('/');
    const handleFn = handlerMap[path];

    if (handleFn) {
        // This is a simplified proxy. A more robust solution would handle response objects.
        // For now, we assume the functions handle the request/response directly.
        // This is okay for local dev but not a perfect simulation.
        try {
            const result = await handleFn(req);
            if (result) {
              return result;
            }
            // Functions might not return anything if they handle the response themselves (res.send, etc)
            // which is common in Express-style Firebase Functions.
            // We create a dummy response here.
            return new Response(JSON.stringify({proxied: path}), { status: 200, headers: {'Content-Type': 'application/json'} });
        } catch(e: any) {
            return new Response(e.message, { status: 500 });
        }
    }
    return new Response('Not Found', { status: 404 });
}


export { handle as GET, handle as POST };
