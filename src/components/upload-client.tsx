
'use client';
import React, { useMemo, useRef, useState } from 'react';

export function UploadClient() {
  const [jobId, setJobId] = useState<string>('job-' + Math.random().toString(36).slice(2, 8));
  const [ruleSetId, setRuleSetId] = useState<string>('default');
  const [status, setStatus] = useState<string>('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const upload = async () => {
      alert('Upload functionality not yet implemented in the UI.');
      setStatus('Upload functionality not yet implemented in the UI.');
  };

  const runLLMBatch = async () => {
    setStatus('LLM batch functionality not yet implemented in the UI.');
  };

  const runAdhoc = async () => {
    setStatus('Ad-hoc prompt functionality not yet implemented in the UI.');
  };

  const webEnrich = async () => {
    setStatus('Web enrich functionality not yet implemented in the UI.');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Data Normalization — MVP Console</h1>
      <div className="border rounded-2xl p-4">
        <label className="block font-medium">Job ID</label>
        <input className="border p-2 rounded w-full" value={jobId} onChange={(e)=>setJobId(e.target.value)} />
        <label className="block mt-2 font-medium">RuleSet ID</label>
        <input className="border p-2 rounded w-full" value={ruleSetId} onChange={(e)=>setRuleSetId(e.target.value)} />
        <div className="mt-4 flex items-center gap-3">
          <input ref={fileRef} type="file" className="border p-2" />
          <button onClick={upload} className="border rounded px-4 py-2">Upload</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button className="border rounded p-4" onClick={runLLMBatch}>Run LLM Batch</button>
        <button className="border rounded p-4" onClick={runAdhoc}>Ad-hoc Prompt</button>
        <button className="border rounded p-4" onClick={webEnrich}>Enrich Websites</button>
      </div>
      <div className="border rounded-2xl p-4">
        <div className="font-mono text-sm whitespace-pre-wrap">{status}</div>
      </div>
    </div>
  );
}
