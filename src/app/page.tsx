
'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RuleBuilder } from '@/components/rule-builder';
import { IssuesConsole } from '@/components/issues-console';
import { apiPost } from '@/lib/api';

export default function Home() {
  const [tab, setTab] = useState<'upload' | 'rules' | 'issues' | 'export'>('upload');
  const [jobId, setJobId] = useState<string>('job-' + Math.random().toString(36).slice(2, 8));
  const [ruleSetId, setRuleSetId] = useState<string>('default');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState('');

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert('Pick a file first');
    setStatus(`Uploading ${file.name}...`);
    try {
      // Note: This uses a simplified client-side upload via a backend function.
      // In a production app, you might use a signed URL for direct GCS upload.
      const res = await fetch(`/api/upload?jobId=${encodeURIComponent(jobId)}&ruleSetId=${encodeURIComponent(ruleSetId)}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type, 'X-File-Name': file.name },
        body: file,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStatus('Upload complete: ' + JSON.stringify(data));
      setTab('issues'); // Switch to issues tab after upload
    } catch (e: any) {
      setStatus('Upload error: ' + e.message);
    }
  };

  const runLLMBatch = async () => {
    setStatus('Triggering LLM batch review...');
    const res = await apiPost('/api/llm/batch', { jobId });
    setStatus('LLM batch result: ' + JSON.stringify(res));
  };

  const runAdhoc = async () => {
    const promptValue = window.prompt('Enter prompt for ad-hoc review', 'Find any anomalies in email and phone');
    if (!promptValue) return;
    setStatus('Running ad-hoc prompt...');
    const res = await apiPost('/api/llm/adhoc', { jobId, prompt: promptValue, limit: 20 });
    setStatus('LLM ad-hoc result: ' + JSON.stringify(res));
  };

  const webEnrich = async () => {
    setStatus('Enriching with company websites...');
    const res = await apiPost('/api/web/company/bulk', { jobId, limit: 50 });
    setStatus('Web enrichment result: ' + JSON.stringify(res));
  };

  const exportToBQ = async () => {
    const dataset = prompt('BigQuery dataset ID');
    if (!dataset) return;
    const table = prompt('BigQuery table ID');
    if (!table) return;
    setStatus('Exporting to BigQuery...');
    const res = await apiPost('/api/export/bq', { jobId, dataset, table });
    setStatus('Export to BQ result: ' + JSON.stringify(res));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <h1 className="text-3xl font-bold font-headline">Data Janitor Console</h1>

      <Card>
        <CardContent className="p-4 grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="jobId">Job ID</Label>
            <Input id="jobId" value={jobId} onChange={(e) => setJobId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ruleSetId">RuleSet ID</Label>
            <Input id="ruleSetId" value={ruleSetId} onChange={(e) => setRuleSetId(e.target.value)} />
          </div>
          <div className="md:col-span-3 p-2 rounded-md bg-muted text-muted-foreground text-sm font-mono h-12 overflow-auto">
            {status || 'Status messages will appear here.'}
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(value) => setTab(value as any)} className="w-full">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>File Upload &amp; Processing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 border rounded-lg">
                <Input ref={fileRef} type="file" className="max-w-xs" />
                <Button onClick={upload}>Upload &amp; Validate</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button variant="outline" onClick={runLLMBatch}>Run LLM Batch Review</Button>
                <Button variant="outline" onClick={runAdhoc}>Run Ad-hoc Prompt</Button>
                <Button variant="outline" onClick={webEnrich}>Enrich Company Websites</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <RuleBuilder ruleSetId={ruleSetId} />
        </TabsContent>

        <TabsContent value="issues" className="mt-4">
          <IssuesConsole jobId={jobId} />
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Export Cleaned Data</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Button onClick={exportToBQ}>Export to BigQuery</Button>
              <Button variant="outline" asChild>
                <a href={`https://console.cloud.google.com/storage/browser/_/exports/${jobId}`} target="_blank" rel="noopener noreferrer">
                  View in Cloud Storage
                </a>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
