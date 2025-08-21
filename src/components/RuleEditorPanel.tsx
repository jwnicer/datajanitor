
'use client';
import React from 'react';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api';
import defaultRules from '@/rulesets/default.json';


export function RuleEditorPanel({ ruleSetId }: { ruleSetId: string }) {
  const [json, setJson] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => { 
    if (!ruleSetId) return;
    (async () => {
    setLoading(true);
    try {
        const v = await apiGet(`/api/rules?id=${ruleSetId}`);
        setJson(JSON.stringify(v, null, 2));
    } catch (e) {
        let template = defaultRules;
        // If not the default, create a leaner template.
        if (ruleSetId !== 'default') {
            template = { name: ruleSetId, version: 1, rules: [], dictionaries: {}, pii: { fields: [] } } as any;
        }
        setJson(JSON.stringify(template, null, 2));
        toast.info(`Rule set '${ruleSetId}' not found. Created a new one.`)
    } finally {
        setLoading(false);
    }
  })(); }, [ruleSetId]);

  const save = async () => {
    try {
      const parsed = JSON.parse(json);
      await apiPost('/api/rules', { id: ruleSetId, ruleSet: parsed });
      toast.success('Rule set saved');
    } catch (e: any) {
      toast.error('Invalid JSON', { description: String(e?.message || e) });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Rule Set Editor</CardTitle>
        <Button onClick={save}>Save</Button>
      </CardHeader>
      <CardContent>
        <Textarea className="font-mono h-[60vh]" value={json} onChange={(e)=>setJson(e.target.value)} />
      </CardContent>
    </Card>
  );
}
