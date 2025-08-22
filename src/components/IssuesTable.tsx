
'use client';
import React from 'react';
import { getFirestore, collection, query, where, orderBy, limit as qlimit, onSnapshot, Query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { CheckCircle2, XCircle } from 'lucide-react';
import { apiPost } from '@/lib/api';

export function IssuesTable({ jobId }: { jobId: string }) {
  const db = React.useMemo(()=>getFirestore(), []);
  const [rows, setRows] = React.useState<any[]>([]);
  const [filters, setFilters] = React.useState({
    status: 'open', source: '', severity: '', q: '', minConf: '',
  });
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!jobId) return;
    
    let q: Query = collection(db, 'jobs', jobId, 'issues');
    
    if (filters.status) {
        q = query(q, where('status','==', filters.status));
    }
    if (filters.source) {
        q = query(q, where('source','==', filters.source));
    }
    if (filters.severity) {
        q = query(q, where('severity','==', filters.severity));
    }
    
    q = query(q, orderBy('createdAt','desc'), qlimit(500));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRows(data);
      setChecked({});
    }, (err) => {
        toast.error("Failed to load issues", { description: err.message });
        console.error("Firestore snapshot error:", err);
    });

    return () => unsub();
  }, [db, jobId, filters.status, filters.source, filters.severity]);

  const ids = Object.entries(checked).filter(([,v])=>v).map(([k])=>k);

  const applySelected = async () => {
    if (ids.length===0) return toast('Nothing selected');
    const res = await apiPost('/api/issues/apply', { jobId, issueIds: ids });
    toast.success('Applied', { description: JSON.stringify(await res) });
  };

  const rejectSelected = async () => {
    if (ids.length===0) return toast('Nothing selected');
    const res = await apiPost('/api/issues/reject', { jobId, issueIds: ids });
    toast('Rejected', { description: JSON.stringify(await res) });
  };

  const applySafe = async () => {
    const minConfidence = Number(filters.minConf || 0.9);
    const res = await apiPost('/api/issues/apply-safe', { jobId, minConfidence });
    toast.success('Applied safe fixes', { description: JSON.stringify(await res) });
  };

  const filtered = rows.filter(r => {
    const q = filters.q.toLowerCase();
    const okQ = !q || JSON.stringify(r).toLowerCase().includes(q);
    const okConf = !filters.minConf || (Number(r.confidence||0) >= Number(filters.minConf));
    return okQ && okConf;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Issues Review</CardTitle>
        <div className="flex gap-2">
          <Input placeholder="Search..." value={filters.q} onChange={(e)=>setFilters(f=>({...f,q:e.target.value}))} className="w-40" />
          <Input placeholder="Min Conf (e.g., 0.9)" value={filters.minConf} onChange={(e)=>setFilters(f=>({...f,minConf:e.target.value}))} className="w-36" />
          <select className="border rounded px-2 py-1" value={filters.source} onChange={(e)=>setFilters(f=>({...f,source:e.target.value}))}>
            <option value="">source</option>
            <option value="deterministic">deterministic</option>
            <option value="llm">llm</option>
            <option value="web">web</option>
          </select>
          <select className="border rounded px-2 py-1" value={filters.severity} onChange={(e)=>setFilters(f=>({...f,severity:e.target.value}))}>
            <option value="">severity</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </select>
          <select className="border rounded px-2 py-1" value={filters.status} onChange={(e)=>setFilters(f=>({...f,status:e.target.value}))}>
            <option value="open">open</option>
            <option value="accepted">accepted</option>
            <option value="rejected">rejected</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-2">
          <Button variant="outline" onClick={applySafe}><CheckCircle2 className="h-4 w-4 mr-2"/>Apply Safe</Button>
          <Button variant="outline" onClick={applySelected}><CheckCircle2 className="h-4 w-4 mr-2"/>Accept Selected</Button>
          <Button variant="ghost" onClick={rejectSelected}><XCircle className="h-4 w-4 mr-2"/>Reject Selected</Button>
          <div className="ml-auto text-sm text-muted-foreground">{filtered.length} issues</div>
        </div>
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-left">✓</th>
                <th className="p-2 text-left">Row</th>
                <th className="p-2 text-left">Field</th>
                <th className="p-2 text-left">Rule</th>
                <th className="p-2 text-left">Problem</th>
                <th className="p-2 text-left">Suggestion</th>
                <th className="p-2 text-left">Conf</th>
                <th className="p-2 text-left">Source</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-2"><Checkbox checked={!!checked[r.id]} onCheckedChange={(v)=>setChecked(c=>({...c,[r.id]: !!v}))} /></td>
                  <td className="p-2 font-mono text-xs">{r.rowId}</td>
                  <td className="p-2">{r.field}</td>
                  <td className="p-2">{r.ruleId}</td>
                  <td className="p-2">{r.problem}</td>
                  <td className="p-2 text-xs"><pre className="whitespace-pre-wrap">{typeof r.suggestion==='object'? JSON.stringify(r.suggestion,null,0): String(r.suggestion||'')}</pre></td>
                  <td className="p-2">{r.confidence?.toFixed?.(2) || ''}</td>
                  <td className="p-2"><Badge variant="outline">{r.source}</Badge></td>
                  <td className="p-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

    