export type JobStatus = 'queued' | 'parsing' | 'validating' | 'llm' | 'enriching' | 'review' | 'exported' | 'error';
export type FileType = 'csv' | 'xlsx' | 'tsv' | 'jsonl';
export type Severity = 'info'|'warning'|'error';
export type IssueSource = 'deterministic'|'llm'|'web';
export type IssueStatus = 'open'|'accepted'|'rejected';
export type FixStrategy = 'auto_fix'|'suggest_only'|'llm_suggest'|'none';

export interface Job {
  id: string;
  status: JobStatus;
  filename: string;
  fileType: FileType;
  rowCount: number;
  createdAt: Date;
  createdBy?: string;
  ruleSetId?: string;
  metrics: {
    durationMs: number;
    llmCalls: number;
    deterministicIssues: number;
    llmIssues: number;
  };
}

export interface Issue {
  id: string;
  rowId: string;
  field: string;
  value: any;
  problem: string;
  suggestion?: any;
  confidence?: number;
  severity: Severity;
  source: IssueSource;
  status: IssueStatus;
  ruleId: string;
  createdAt: Date;
}

export interface Rule {
  id: string;
  label: string;
  appliesTo: string[]; // fields
  validator: string;
  params?: Record<string, any>;
  fix?: { strategy: FixStrategy };
  severity?: Severity;
  enabled: boolean;
}

export interface RuleSet {
  id: string;
  name: string;
  version: number;
  createdBy?: string;
  rules: Rule[];
  dictionaries?: { [name:string]: object };
  pii?: { fields: string[] };
}
