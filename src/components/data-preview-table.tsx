'use client'

import type { Issue } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DataPreviewTableProps = {
    data: any[];
    issues: Issue[];
}

export function DataPreviewTable({ data, issues }: DataPreviewTableProps) {
    if (!data || data.length === 0) {
        return <p className="text-muted-foreground">No data to display.</p>;
    }

    const headers = Object.keys(data[0]);
    const issuesMap = new Map<string, Issue[]>();
    issues.forEach(issue => {
        const key = `${issue.rowId}-${issue.field}`;
        if (!issuesMap.has(key)) {
            issuesMap.set(key, []);
        }
        issuesMap.get(key)!.push(issue);
    });

    return (
        <TooltipProvider>
            <div className="relative w-full overflow-auto rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {headers.map(header => <TableHead key={header}>{header}</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((row, rowIndex) => (
                            <TableRow key={row.id || rowIndex}>
                                {headers.map(header => {
                                    const cellKey = `${row.id}-${header}`;
                                    const cellIssues = issuesMap.get(cellKey);
                                    const hasIssue = cellIssues && cellIssues.length > 0;
                                    const isError = hasIssue && cellIssues.some(i => i.severity === 'error');
                                    const isWarning = hasIssue && cellIssues.some(i => i.severity === 'warning');
                                    
                                    const cellContent = (
                                        <TableCell
                                            key={header}
                                            className={cn(
                                                "whitespace-nowrap",
                                                hasIssue && "relative",
                                                isError ? "bg-red-500/10 text-red-900 dark:text-red-200" :
                                                isWarning ? "bg-yellow-500/10 text-yellow-900 dark:text-yellow-200" :
                                                hasIssue ? "bg-blue-500/10 text-blue-900 dark:text-blue-200" : ""
                                            )}
                                        >
                                            {hasIssue && <div className={cn("absolute top-0 left-0 h-full w-1", isError ? "bg-red-500" : isWarning ? "bg-yellow-500" : "bg-blue-500")} />}
                                            {String(row[header])}
                                        </TableCell>
                                    );

                                    if (hasIssue) {
                                        return (
                                            <Tooltip key={header} delayDuration={100}>
                                                <TooltipTrigger asChild>
                                                    {cellContent}
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <div className="p-1">
                                                        <h4 className="font-bold mb-1">Issues Found:</h4>
                                                        <ul className="list-disc list-inside space-y-1">
                                                            {cellIssues.map(issue => (
                                                                <li key={issue.id}>{issue.problem}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        );
                                    }

                                    return cellContent;
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </TooltipProvider>
    );
}
