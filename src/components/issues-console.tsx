
'use client';
import React, { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from './ui/scroll-area';

export function IssuesConsole({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [filters, setFilters] = useState<{ ruleId?: string; field?: string; severity?: string; source?: string; status?: string }>({ status: 'open' });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const { toast } = useToast();

  const refresh = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams(filters as any);
      const arr = await apiGet<any[]>(`/api/issues?jobId=${jobId}&${params.toString()}`);
      setRows(arr);
      setChecked({});
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: `Failed to load issues: ${e.message}` });
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [jobId, filters]);

  const selectedIds = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);

  const handleBulkAction = async (path: string, payload: any, successMsg: string) => {
    if (selectedIds.length === 0 && !payload.minConfidence) {
        toast({ title: 'No issues selected', description: 'Please select one or more issues to apply this action.'});
        return;
    }
    setLoading(true);
    try {
      const res = await apiPost(path, payload);
      toast({ title: 'Success', description: `${successMsg}: ${JSON.stringify(res)}` });
      await refresh();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Action Failed', description: e.message });
    }
    setLoading(false);
  };
  
  const accept = () => handleBulkAction('/api/issues/apply', { jobId, issueIds: selectedIds }, 'Applied fixes');
  const reject = () => handleBulkAction('/api/issues/reject', { jobId, issueIds: selectedIds }, 'Rejected fixes');
  const acceptSafe = () => handleBulkAction('/api/issues/apply-safe', { jobId, minConfidence: 0.9 }, 'Applied safe fixes');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Issues Console</CardTitle>
        <CardDescription>Review and manage data quality issues for job: <code className='font-bold'>{jobId}</code></CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
            <Select value={filters.status || ''} onValueChange={(v) => setFilters(f => ({ ...f, status: v || undefined }))}>
                <SelectTrigger className='w-32'><SelectValue placeholder="Status..." /></SelectTrigger>
                <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent>
            </Select>
            <Select value={filters.source || ''} onValueChange={(v) => setFilters(f => ({ ...f, source: v || undefined }))}>
                <SelectTrigger className='w-32'><SelectValue placeholder="Source..." /></SelectTrigger>
                <SelectContent><SelectItem value="deterministic">Deterministic</SelectItem><SelectItem value="llm">LLM</SelectItem><SelectItem value="web">Web</SelectItem></SelectContent>
            </Select>
            <Button variant="outline" onClick={refresh} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</Button>
            <div className='flex-grow'/>
            <Button variant="outline" onClick={acceptSafe} disabled={loading}>Apply Safe Fixes (≥0.9)</Button>
            <Button onClick={accept} disabled={loading || selectedIds.length === 0}>Accept ({selectedIds.length})</Button>
            <Button variant="destructive" onClick={reject} disabled={loading || selectedIds.length === 0}>Reject ({selectedIds.length})</Button>
        </div>
        <ScrollArea className="h-[60vh] border rounded-md">
            <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                <TableHead className='w-12'><Checkbox checked={selectedIds.length > 0 && selectedIds.length === rows.length} onCheckedChange={(c) => setChecked(c ? Object.fromEntries(rows.map(r => [r.id, true])) : {})}/></TableHead>
                <TableHead>Row</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Suggestion</TableHead>
                <TableHead>Conf.</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((r) => (
                <TableRow key={r.id}>
                    <TableCell><Checkbox checked={!!checked[r.id]} onCheckedChange={(c) => setChecked(prev => ({ ...prev, [r.id]: !!c }))} /></TableCell>
                    <TableCell className="font-mono text-xs">{r.rowId}</TableCell>
                    <TableCell>{r.field}</TableCell>
                    <TableCell>{r.problem}</TableCell>
                    <TableCell><pre className="whitespace-pre-wrap text-xs font-code">{typeof r.suggestion === 'object' ? JSON.stringify(r.suggestion) : String(r.suggestion||'')}</pre></TableCell>
                    <TableCell className="text-center">{r.confidence?.toFixed?.(2) ?? ''}</TableCell>
                    <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                    <TableCell><Badge variant={r.status === 'open' ? 'secondary' : r.status === 'accepted' ? 'default' : 'destructive'}>{r.status}</Badge></TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
