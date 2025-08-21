
'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function UploadPanel({ jobId, ruleSetId, onStatus }:{ jobId:string; ruleSetId:string; onStatus:(s:string)=>void }){
  const [file, setFile] = React.useState<File|null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const upload = async () => {
    if (!file) { toast.error('Choose a file'); return; }
    try {
      setUploading(true); setProgress(15);
      const res = await fetch(`/api/upload?jobId=${encodeURIComponent(jobId)}&ruleSetId=${encodeURIComponent(ruleSetId)}` ,{
        method: 'POST',
        headers: {
          'x-file-name': file.name,
          // Force binary so the function treats body as raw bytes
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      });

      setProgress(70);
      const raw = await res.text();
      let payload: any = null;
      try { payload = JSON.parse(raw); } catch { payload = { body: raw }; }

      if (!res.ok || payload?.error) {
        const msg = payload?.error || payload?.body || `Upload failed (HTTP ${res.status})`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }

      setProgress(100);
      onStatus(JSON.stringify(payload));
      toast.success('Upload complete');
    } catch (e: any) {
      toast.error('Upload failed', { description: String(e?.message || e) });
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Upload & Start</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div
          onDrop={onDrop}
          onDragOver={(e)=>e.preventDefault()}
          className="rounded-2xl border border-dashed p-8 text-center bg-muted/30"
        >
          <div className="text-sm text-muted-foreground">Drag & drop CSV/XLSX here</div>
          <div className="my-2">or</div>
          <Input type="file" onChange={(e)=>setFile(e.target.files?.[0]||null)} accept=".csv,.tsv,.xlsx,.xls,.jsonl,.ndjson" />
          {file && <div className="mt-2 text-xs text-muted-foreground">{file.name} • {(file.size/1024/1024).toFixed(2)} MB</div>}
          {uploading && <Progress className="mt-3" value={progress} />}
          <div className="mt-4 flex gap-2 justify-center">
            <Button onClick={upload} disabled={!file || uploading}>Upload</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
