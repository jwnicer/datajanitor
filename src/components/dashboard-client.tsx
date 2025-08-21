'use client';
import Link from 'next/link';
import type { Job } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileUp, MoreVertical, Eye, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type DashboardClientProps = {
  jobs: Job[];
};

const statusColors: { [key in Job['status']]: string } = {
  queued: 'bg-gray-500 hover:bg-gray-500',
  parsing: 'bg-blue-500 hover:bg-blue-500',
  validating: 'bg-blue-600 hover:bg-blue-600',
  llm: 'bg-indigo-500 hover:bg-indigo-500',
  enriching: 'bg-purple-500 hover:bg-purple-500',
  review: 'bg-yellow-500 hover:bg-yellow-500 text-yellow-900',
  exported: 'bg-green-500 hover:bg-green-500',
  error: 'bg-red-600 hover:bg-red-600',
};

export function DashboardClient({ jobs }: DashboardClientProps) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your data validation jobs.
          </p>
        </div>
        <Button asChild>
          <Link href="/upload">
            <FileUp className="mr-2" />
            New Job
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filename</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.filename}</TableCell>
                  <TableCell>
                    <Badge
                      className={`${statusColors[job.status]} text-primary-foreground`}
                    >
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{job.rowCount.toLocaleString()}</TableCell>
                  <TableCell>
                    {formatDistanceToNow(job.createdAt, { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/jobs/${job.id}`}>
                            <Eye className="mr-2" />
                            View Job
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                          <Trash2 className="mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
