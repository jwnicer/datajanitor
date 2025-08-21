
'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api';


export function RuleBuilder({ ruleSetId }: { ruleSetId: string }) {
  const [json, setJson] = useState<string>('');
  const [status, setStatus] = useState<string>('Loading...');
  const { toast } = useToast();

  useEffect(() => {
    if (!ruleSetId) return;
    setStatus('Loading rule set...');
    apiGet(`/api/rules?id=${ruleSetId}`).then(v => {
      setJson(JSON.stringify(v, null, 2));
      setStatus('Loaded rule set: ' + ruleSetId);
    }).catch(e => {
        const defaultRuleSet = { name: ruleSetId, version: 1, rules: [], dictionaries: {}, pii: { fields: [] } };
        setJson(JSON.stringify(defaultRuleSet, null, 2));
        setStatus(`Rule set '${ruleSetId}' not found. Showing default template.`);
    });
  }, [ruleSetId]);

  const save = async () => {
    try {
      const parsed = JSON.parse(json);
      await apiPost('/api/rules', { id: ruleSetId, ruleSet: parsed });
      toast({ title: 'Success', description: `Rule set '${ruleSetId}' saved.` });
      setStatus('Saved at ' + new Date().toLocaleTimeString());
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save: ' + e.message });
      setStatus('Error: ' + e.message);
    }
  };

  const addRule = () => {
    try {
      const current = JSON.parse(json);
      current.rules = current.rules || [];
      current.rules.push({ id: 'new-rule-' + current.rules.length, label: 'New Rule', appliesTo: ['field'], validator: 'regex', params: { pattern: '.*' }, enabled: true, severity: 'warning', fix: { strategy: 'suggest_only' } });
      setJson(JSON.stringify(current, null, 2));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'JSON Error', description: 'Please fix JSON errors before adding a new rule.' });
    }
  };

  return (
    <Card>
        <CardHeader>
            <CardTitle>Rule Set Editor</CardTitle>
            <CardDescription>Define validation and normalization rules for your data jobs. Current set: <code className='font-bold'>{ruleSetId}</code></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
             <div className="flex gap-2 items-center">
                <Button onClick={addRule}>+ Add Rule</Button>
                <Button onClick={save}>Save Rule Set</Button>
                <p className="text-sm text-muted-foreground">{status}</p>
            </div>
            <Textarea
                value={json}
                onChange={(e) => setJson(e.target.value)}
                className="w-full h-[60vh] font-code text-xs"
                placeholder="Enter or load a RuleSet JSON..."
            />
             <p className="text-xs text-muted-foreground">
                Use validators like: required, regex, enum, range, date_format, email, phone, url, country, state.
            </p>
        </CardContent>
    </Card>
  );
}
