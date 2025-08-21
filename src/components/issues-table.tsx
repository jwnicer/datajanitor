'use client';

import * as React from 'react';
import type { Issue, IssueStatus } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, ThumbsDown, ThumbsUp, X, Cpu, Search, Workflow } from 'lucide-react';

type IssuesTableProps = {
  issues: Issue[];
  setIssues: React.Dispatch<React.SetStateAction<Issue[]>>;
};

const severityColors: { [key in Issue['severity']]: string } = {
  info: 'bg-blue-500 hover:bg-blue-500',
  warning: 'bg-yellow-500 hover:bg-yellow-500 text-yellow-900',
  error: 'bg-red-600 hover:bg-red-600',
};
const sourceIcons: { [key in Issue['source']]: React.ReactNode } = {
    deterministic: <Workflow className="h-4 w-4" />,
    llm: <Cpu className="h-4 w-4" />,
    web: <Search className="h-4 w-4" />,
};

export function IssuesTable({ issues, setIssues }: IssuesTableProps) {
    const [selectedRowIds, setSelectedRowIds] = React.useState<string[]>([]);

    const handleSelectAll = (checked: boolean) => {
        if(checked) {
            setSelectedRowIds(issues.filter(i => i.status === 'open').map(i => i.id));
        } else {
            setSelectedRowIds([]);
        }
    }

    const handleSelectRow = (issueId: string, checked: boolean) => {
        if(checked) {
            setSelectedRowIds(prev => [...prev, issueId]);
        } else {
            setSelectedRowIds(prev => prev.filter(id => id !== issueId));
        }
    }
    
    const updateIssueStatus = (issueIds: string[], status: IssueStatus) => {
        setIssues(prev =>
            prev.map(issue =>
                issueIds.includes(issue.id) ? { ...issue, status } : issue
            )
        );
        setSelectedRowIds([]);
    }

    const isAllSelected = selectedRowIds.length > 0 && selectedRowIds.length === issues.filter(i => i.status === 'open').length;

    return (
        <div className="space-y-4">
            {selectedRowIds.length > 0 && (
                <div className="flex items-center gap-4 bg-muted p-2 rounded-lg">
                    <p className="text-sm font-medium">{selectedRowIds.length} selected</p>
                    <Button size="sm" onClick={() => updateIssueStatus(selectedRowIds, 'accepted')}><ThumbsUp className="mr-2 h-4 w-4" />Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => updateIssueStatus(selectedRowIds, 'rejected')}><ThumbsDown className="mr-2 h-4 w-4" />Reject</Button>
                </div>
            )}
            <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12">
                            <Checkbox 
                                checked={isAllSelected}
                                onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                                aria-label="Select all"
                            />
                        </TableHead>
                        <TableHead>Field</TableHead>
                        <TableHead>Problem</TableHead>
                        <TableHead>Suggestion</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {issues.map((issue) => (
                        <TableRow key={issue.id} data-state={selectedRowIds.includes(issue.id) ? 'selected' : undefined}>
                            <TableCell>
                                {issue.status === 'open' && (
                                    <Checkbox
                                        checked={selectedRowIds.includes(issue.id)}
                                        onCheckedChange={(checked) => handleSelectRow(issue.id, Boolean(checked))}
                                        aria-label="Select row"
                                    />
                                )}
                            </TableCell>
                            <TableCell className="font-medium">{issue.field}<br/><span className="text-xs text-muted-foreground">Row: {issue.rowId}</span></TableCell>
                            <TableCell>{issue.problem}</TableCell>
                            <TableCell>
                                {issue.suggestion ? (
                                    <code className="font-code text-sm">{String(issue.suggestion)}</code>
                                ) : (
                                    <span className="text-muted-foreground">-</span>
                                )}
                            </TableCell>
                            <TableCell>
                                <Badge className={`${severityColors[issue.severity]} text-primary-foreground`}>{issue.severity}</Badge>
                            </TableCell>
                             <TableCell>
                                <Badge variant="outline" className="gap-1.5">{sourceIcons[issue.source]} {issue.source}</Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={issue.status === 'open' ? 'secondary' : issue.status === 'accepted' ? 'default' : 'destructive'}>{issue.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                {issue.status === 'open' && (
                                     <div className="flex gap-2 justify-end">
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-600 hover:bg-green-500/10" onClick={() => updateIssueStatus([issue.id], 'accepted')}><ThumbsUp className="h-4 w-4"/></Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-600 hover:bg-red-500/10" onClick={() => updateIssueStatus([issue.id], 'rejected')}><ThumbsDown className="h-4 w-4"/></Button>
                                     </div>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            </div>
        </div>
    );
}
