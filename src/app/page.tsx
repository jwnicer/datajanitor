
'use client';

import React from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, Settings, Sparkles, Bug, Upload, TableProperties, Database, LogOut, Play, Wand2, Globe2, CheckCircle2, XCircle, Moon, Sun, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { UploadPanel } from '@/components/UploadPanel';
import { IssuesTable } from '@/components/IssuesTable';
import { RuleEditorPanel } from '@/components/RuleEditorPanel';
import { ExportPanel } from '@/components/ExportPanel';
import { ThemeToggle } from '@/components/ThemeToggle';
import { apiPost } from '@/lib/api';

// Firebase config via Vite env (as in previous batches)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [ruleSetId, setRuleSetId] = React.useState('default');
  const [tab, setTab] = React.useState<'upload' | 'issues' | 'rules' | 'export' | 'mapping'>('upload');
  const [statusText, setStatusText] = React.useState('');
  const [mapping, setMapping] = React.useState<any>(null);
  
  React.useEffect(() => {
    // Initialize with a default job ID on mount
    setJobId('job-' + Math.random().toString(36).slice(2, 8));
  }, [])


  const runLLMBatch = async () => {
    if (!jobId) return toast.error("Job ID is not set.");
    const res = await apiPost('/api/llm/batch', { jobId });
    toast.success('LLM batch complete', { description: JSON.stringify(res) });
  };

  const runAdhoc = async () => {
    if (!jobId) return toast.error("Job ID is not set.");
    const promptValue = window.prompt('Ad-hoc prompt (e.g., "Find anomalies in email/phone")');
    if (!promptValue) return;
    const res = await apiPost('/api/llm/adhoc', { jobId, prompt: promptValue, limit: 20 });
    toast.success('Ad-hoc review complete', { description: JSON.stringify(res) });
  };

  const webEnrich = async () => {
    if (!jobId) return toast.error("Job ID is not set.");
    const res = await apiPost('/api/web/company/bulk', { jobId, limit: 50 });
    toast.success('Web enrichment queued', { description: JSON.stringify(res) });
  };
  
  const onUploadComplete = (payload: any) => {
    setMapping(payload);
    setTab('mapping');
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar
        jobId={jobId || ''}
        setJobId={setJobId}
        ruleSetId={ruleSetId}
        setRuleSetId={setRuleSetId}
        onRunLLM={runLLMBatch}
        onAdhoc={runAdhoc}
        onWeb={webEnrich}
        onSignOut={() => auth.signOut()}
      />

      <div className="mx-auto max-w-7xl grid grid-cols-12 gap-6 p-4 md:p-6">
        <Sidebar tab={tab} setTab={setTab} />

        <main className="col-span-12 lg:col-span-9 space-y-6">
          <AnimatePresence mode="wait">
            {tab === 'upload' && jobId && (
              <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Stepper current={1} />
                <UploadPanel jobId={jobId} ruleSetId={ruleSetId} onStatus={setStatusText} onComplete={onUploadComplete} />
                <HintCard title="Tip" text="After upload, check the Issues tab to review and apply fixes. Then run LLM Batch for tricky items." icon={<Sparkles className="h-5 w-5" />} />
              </motion.div>
            )}
            {tab === 'mapping' && (
              <motion.div key="mapping" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Stepper current={1} />
                <Card>
                    <CardHeader><CardTitle>Field Mapping</CardTitle></CardHeader>
                    <CardContent>
                        <p>Detected {mapping?.headers?.length} columns in {mapping?.filename}.</p>
                        <ul className='grid grid-cols-3 gap-2 p-4'>
                            {mapping?.headers?.map((h:string, i:number) => <li className='text-sm' key={i}>{h}</li>)}
                        </ul>
                        <Button onClick={() => setTab('issues')}>Continue to Issues</Button>
                    </CardContent>
                </Card>
              </motion.div>
            )}
            {tab === 'issues' && jobId && (
              <motion.div key="issues" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Stepper current={2} />
                <IssuesTable jobId={jobId} />
              </motion.div>
            )}
            {tab === 'rules' && (
              <motion.div key="rules" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Stepper current={0} />
                <RuleEditorPanel ruleSetId={ruleSetId} />
              </motion.div>
            )}
            {tab === 'export' && jobId && (
              <motion.div key="export" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Stepper current={3} />
                <ExportPanel jobId={jobId} />
                <HintCard title="Heads up" text="Your cleaned NDJSON is also available in Cloud Storage under exports/<jobId>/normalized.ndjson." icon={<Database className="h-5 w-5" />} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function Topbar({ jobId, setJobId, ruleSetId, setRuleSetId, onRunLLM, onAdhoc, onWeb, onSignOut }:
  { jobId: string; setJobId: (s: string) => void; ruleSetId: string; setRuleSetId: (s: string) => void; onRunLLM: () => void; onAdhoc: () => void; onWeb: () => void; onSignOut: () => void; }) {
  return (
    <div className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto max-w-7xl px-4 md:px-6 py-3 flex items-center gap-3">
        <div className="font-semibold tracking-tight flex items-center gap-2"><FileUp className="h-5 w-5" /> Data Janitor</div>
        <Separator orientation="vertical" className="mx-2" />
        <div className="hidden md:flex items-center gap-2">
          <Badge variant="outline">Job</Badge>
          <Input value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-44" />
          <Badge variant="outline">RuleSet</Badge>
          <Input value={ruleSetId} onChange={(e) => setRuleSetId(e.target.value)} className="w-44" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={onWeb}><Globe2 className="h-4 w-4 mr-2" /> Enrich</Button>
          <Button variant="outline" onClick={onAdhoc}><Wand2 className="h-4 w-4 mr-2" /> Ad‑hoc</Button>
          <Button onClick={onRunLLM}><Play className="h-4 w-4 mr-2" /> LLM Batch</Button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function Sidebar({ tab, setTab }: { tab: 'upload'|'issues'|'rules'|'export'|'mapping'; setTab: (t: any) => void }) {
  return (
    <aside className="col-span-12 lg:col-span-3">
      <Card>
        <CardContent className="p-2">
          <div className="grid gap-1">
            <Button variant={tab==='upload' || tab === 'mapping' ? 'secondary':'ghost'} className="justify-start" onClick={() => setTab('upload')}>
              <Upload className="h-4 w-4 mr-2" /> Upload & Run
            </Button>
            <Button variant={tab==='issues'? 'secondary':'ghost'} className="justify-start" onClick={() => setTab('issues')}>
              <TableProperties className="h-4 w-4 mr-2" /> Issues Review
            </Button>
            <Button variant={tab==='rules'? 'secondary':'ghost'} className="justify-start" onClick={() => setTab('rules')}>
              <Settings className="h-4 w-4 mr-2" /> Rules
            </Button>
            <Button variant={tab==='export'? 'secondary':'ghost'} className="justify-start" onClick={() => setTab('export')}>
              <Database className="h-4 w-4 mr-2" /> Export
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="mt-4">
        <HintCard title="Workflow" text="1) Upload → 2) Review Issues → 3) Apply Safe Fixes → 4) LLM Batch → 5) Export" icon={<Sparkles className="h-5 w-5" />} />
      </div>
    </aside>
  );
}

function Stepper({ current }: { current: 0 | 1 | 2 | 3 }) {
  const steps = [
    { label: 'Rules' },
    { label: 'Upload' },
    { label: 'Review' },
    { label: 'Export' },
  ];
  return (
    <div className="flex items-center gap-2 text-sm mb-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center">
          <Badge variant={i===current?'default':'outline'} className="mr-2">{i+1}</Badge> {s.label}
          {i < steps.length - 1 && <Separator orientation="vertical" className="mx-3 h-6" />}
        </div>
      ))}
    </div>
  );
}

function HintCard({ title, text, icon }: { title: string; text: string; icon: React.ReactNode }) {
  return (
    <Card className="mt-4">
      <CardContent className="p-4 flex items-start gap-3 text-sm text-muted-foreground">
        <div className="mt-0.5">{icon}</div>
        <div>
          <div className="font-medium text-foreground">{title}</div>
          <div>{text}</div>
        </div>
      </CardContent>
    </Card>
  );
}

    