'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function ExportPanel({ jobId }:{ jobId:string }){
  const [dataset, setDataset] = React.useState('dq_exports');
  const [table, setTable] = React.useState('normalized_rows');

  const exportBQ = async () => {
    const res = await fetch('/api/export/bq', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ jobId, dataset, table }) });
    toast.success('Export to BigQuery started', { description: JSON.stringify(await res.json()) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">Dataset</label>
            <Input value={dataset} onChange={(e)=>setDataset(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Table</label>
            <Input value={table} onChange={(e)=>setTable(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={exportBQ}>Export to BigQuery</Button>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">Cleaned NDJSON also at <code>gs://&lt;bucket&gt;/exports/{jobId}/normalized.ndjson</code></div>
      </CardContent>
    </Card>
  );
}
