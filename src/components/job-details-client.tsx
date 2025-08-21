'use client';

import { useState } from 'react';
import type { Job, Issue } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IssuesTable } from '@/components/issues-table';
import { AdhocPrompt } from '@/components/adhoc-prompt';
import { DataPreviewTable } from '@/components/data-preview-table';
import { ArrowLeft, CheckCircle, Clock, Cpu, FileDown, Search, XCircle } from 'lucide-react';
import Link from 'next/link';

type JobDetailsClientProps = {
    job: Job;
    issues: Issue[];
    dataPreview: any[];
}

export function JobDetailsClient({ job, issues, dataPreview }: JobDetailsClientProps) {
    const [currentIssues, setCurrentIssues] = useState<Issue[]>(issues);

    const openIssues = currentIssues.filter(i => i.status === 'open').length;
    const acceptedIssues = currentIssues.filter(i => i.status === 'accepted').length;

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <Button variant="outline" size="sm" asChild className="mb-2">
                        <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link>
                    </Button>
                    <h1 className="text-3xl font-headline font-bold">{job.filename}</h1>
                    <p className="text-muted-foreground">Job ID: {job.id}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline">
                        Job Report
                    </Button>
                    <Button disabled={job.status !== 'exported'}>
                        <FileDown className="mr-2" />
                        Export Cleaned Data
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Issues</CardTitle>
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{currentIssues.length.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">{openIssues} open</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Accepted Fixes</CardTitle>
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{acceptedIssues.toLocaleString()}</div>
                         <p className="text-xs text-muted-foreground">out of {currentIssues.length} total issues</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">LLM Calls</CardTitle>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{job.metrics.llmCalls}</div>
                        <p className="text-xs text-muted-foreground">{job.metrics.llmIssues} issues found by AI</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Processing Time</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{(job.metrics.durationMs / 1000).toFixed(2)}s</div>
                        <p className="text-xs text-muted-foreground">for {job.rowCount.toLocaleString()} rows</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="issues">
                <TabsList className="grid w-full grid-cols-3 md:w-[400px]">
                    <TabsTrigger value="issues">Issues</TabsTrigger>
                    <TabsTrigger value="data-preview">Data Preview</TabsTrigger>
                    <TabsTrigger value="adhoc-prompt">Ad-hoc Prompt</TabsTrigger>
                </TabsList>
                <TabsContent value="issues">
                    <Card>
                        <CardHeader>
                            <CardTitle>Issues Log</CardTitle>
                            <CardDescription>Review, accept, or reject suggested data fixes.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <IssuesTable issues={currentIssues} setIssues={setCurrentIssues} />
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="data-preview">
                     <Card>
                        <CardHeader>
                            <CardTitle>Data Preview</CardTitle>
                            <CardDescription>A preview of the first few rows of your data, with issues highlighted.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <DataPreviewTable data={dataPreview} issues={currentIssues} />
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="adhoc-prompt">
                    <AdhocPrompt />
                </TabsContent>
            </Tabs>
        </div>
    );
}
