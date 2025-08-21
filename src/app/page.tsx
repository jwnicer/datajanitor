import { DashboardClient } from '@/components/dashboard-client';
import type { Job } from '@/lib/types';
import { add } from 'date-fns';

const mockJobs: Job[] = [
  {
    id: 'job_2a3f8b',
    filename: 'Q3_Sales_Leads_Raw.csv',
    fileType: 'csv',
    status: 'exported',
    rowCount: 87432,
    createdAt: add(new Date(), { days: -1, hours: -4 }),
    metrics: {
      durationMs: 245102,
      llmCalls: 45,
      deterministicIssues: 1204,
      llmIssues: 89,
    },
  },
  {
    id: 'job_9c1d5e',
    filename: 'marketing_contacts_europe.xlsx',
    fileType: 'xlsx',
    status: 'review',
    rowCount: 15200,
    createdAt: add(new Date(), { hours: -2 }),
    metrics: {
      durationMs: 98345,
      llmCalls: 12,
      deterministicIssues: 450,
      llmIssues: 33,
    },
  },
  {
    id: 'job_7b5h2k',
    filename: 'product_catalog_updates.jsonl',
    fileType: 'jsonl',
    status: 'enriching',
    rowCount: 5000,
    createdAt: add(new Date(), { minutes: -15 }),
    metrics: {
      durationMs: 45012,
      llmCalls: 0,
      deterministicIssues: 150,
      llmIssues: 0,
    },
  },
  {
    id: 'job_4m6n9p',
    filename: 'customer_support_tickets_archive.tsv',
    fileType: 'tsv',
    status: 'validating',
    rowCount: 120540,
    createdAt: add(new Date(), { minutes: -5 }),
    metrics: {
      durationMs: 12345,
      llmCalls: 0,
      deterministicIssues: 0,
      llmIssues: 0,
    },
  },
  {
    id: 'job_1x8y3z',
    filename: 'fy2024_prospects.csv',
    fileType: 'csv',
    status: 'error',
    rowCount: 25000,
    createdAt: add(new Date(), { days: -3 }),
    metrics: {
      durationMs: 5000,
      llmCalls: 0,
      deterministicIssues: 0,
      llmIssues: 0,
    },
  },
];

export default function Home() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <DashboardClient jobs={mockJobs} />
    </div>
  );
}
