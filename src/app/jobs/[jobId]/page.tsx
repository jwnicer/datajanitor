import { JobDetailsClient } from '@/components/job-details-client';
import type { Job, Issue } from '@/lib/types';
import { add, sub } from 'date-fns';

const mockJob: Job = {
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
};

const mockIssues: Issue[] = [
    { id: 'issue_1', rowId: '15', field: 'email', value: 'john.doe@acme', problem: 'Invalid email format', severity: 'error', source: 'deterministic', status: 'open', ruleId: 'email', createdAt: new Date() },
    { id: 'issue_2', rowId: '23', field: 'country', value: 'USA', problem: 'Mismatched country code', suggestion: 'US', confidence: 0.95, severity: 'warning', source: 'deterministic', status: 'open', ruleId: 'country', createdAt: sub(new Date(), { minutes: 1 }) },
    { id: 'issue_3', rowId: '42', field: 'company_name', value: 'Stripe Inc', problem: 'Potential better website available.', suggestion: 'https://stripe.com', confidence: 0.88, severity: 'info', source: 'web', status: 'open', ruleId: 'site', createdAt: sub(new Date(), { minutes: 2 }) },
    { id: 'issue_4', rowId: '55', field: 'notes', value: 'client is v. important!! call asap', problem: 'Unprofessional tone detected.', suggestion: 'Client is very important. Follow up soon.', confidence: 0.7, severity: 'info', source: 'llm', status: 'open', ruleId: 'llm', createdAt: sub(new Date(), { minutes: 3 }) },
    { id: 'issue_5', rowId: '101', field: 'phone', value: '555-123-4567', problem: 'Number not in E.164 format.', suggestion: '+15551234567', confidence: 1.0, severity: 'warning', source: 'deterministic', status: 'accepted', ruleId: 'phone', createdAt: sub(new Date(), { minutes: 5 }) },
    { id: 'issue_6', rowId: '112', field: 'email', value: 'jane.doe@web.com', problem: 'Invalid email format', severity: 'error', source: 'deterministic', status: 'rejected', ruleId: 'email', createdAt: sub(new Date(), { minutes: 10 }) },
];

const mockDataPreview = [
    { id: '15', first_name: 'John', last_name: 'Doe', email: 'john.doe@acme', country: 'US', company_name: 'Acme Corp' },
    { id: '23', first_name: 'Peter', last_name: 'Jones', email: 'pjones@example.com', country: 'USA', company_name: 'Example Inc' },
    { id: '42', first_name: 'Mary', last_name: 'Jane', email: 'mj@stripe.com', country: 'US', company_name: 'Stripe Inc' },
    { id: '55', first_name: 'Sam', last_name: 'Smith', email: 'sam.smith@gmail.com', country: 'GB', company_name: 'Google', notes: 'client is v. important!! call asap' },
    { id: '101', first_name: 'Lisa', last_name: 'Ray', email: 'lisa.r@yahoo.com', country: 'CA', company_name: 'Shopify', phone: '555-123-4567' },
    { id: '112', first_name: 'Jane', last_name: 'Doe', email: 'jane.doe@web.com', country: 'US', company_name: 'Web Co' },
];


export default function JobDetailsPage({ params }: { params: { jobId: string } }) {
  // In a real app, you'd fetch the job and issues using params.jobId
  return <JobDetailsClient job={mockJob} issues={mockIssues} dataPreview={mockDataPreview} />;
}
