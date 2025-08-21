'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function UploadPanel({ user, jobId, ruleSetId, onStatus }:{ user:any; jobId:string; ruleSetId:string; onStatus:(s:string)=>void }){
  const [file, setFile] = React.useState<File|null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const upload = async () => {
    if (!file) return toast.error('Choose a file');
    try {
      setUploading(true); setProgress(10);
      const token = await user.getIdToken();
      const res = await fetch(`/api/upload?jobId=${encodeURIComponent(jobId)}&ruleSetId=${encodeURIComponent(ruleSetId)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-file-name': file.name, 'Content-Type': file.type }, body: file,
      });
      setProgress(70);
      const j = await res.json();
      setProgress(100);
      onStatus(JSON.stringify(j));
      toast.success('Upload complete');
    } catch (e: any) {
      toast.error('Upload failed', { description: String(e?.message || e) });
    } finally {
      setUploading(false);
      setTimeout(()=>setProgress(0), 800);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload & Start</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDrop={onDrop}
          onDragOver={(e)=>e.preventDefault()}
          className="rounded-2xl border border-dashed p-8 text-center bg-muted/30"
        >
          <div className="text-sm text-muted-foreground">Drag & drop CSV/XLSX here</div>
          <div className="my-2">or</div>
          <Input type="file" onChange={(e)=>setFile(e.target.files?.[0]||null)} />
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
