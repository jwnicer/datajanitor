'use client';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cpu, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function AdhocPrompt() {
    const [prompt, setPrompt] = useState("Find what's wrong here.");
    const [scope, setScope] = useState("all");
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setResult("");
        // In a real app, you would call a server action here:
        // const response = await runAdHocPrompt({ prompt, scope, sample: "..." });
        // For now, simulate a delay and a mock response.
        await new Promise(resolve => setTimeout(resolve, 1500));
        setResult(`Based on your prompt, I've scanned the '${scope}' scope. I noticed several inconsistencies in the 'country' column where 'USA' and 'United States' are used interchangeably. I suggest standardizing to 'US'. Additionally, the 'revenue' column contains non-numeric characters (e.g., '$', ',') which should be stripped for proper numeric analysis.`);
        setIsLoading(false);
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Ad-hoc LLM Prompting</CardTitle>
                <CardDescription>
                    Ask Gemini to inspect your data with a free-form prompt for insights beyond your rule set.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                         <div className="md:col-span-3 space-y-2">
                             <label htmlFor="prompt" className="text-sm font-medium">Your Prompt</label>
                            <Textarea
                                id="prompt"
                                placeholder="e.g., Scan column X for any anomalies..."
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="min-h-[100px] font-code"
                                required
                            />
                        </div>
                         <div className="space-y-2">
                            <label htmlFor="scope" className="text-sm font-medium">Scope</label>
                            <Select value={scope} onValueChange={setScope}>
                                <SelectTrigger id="scope">
                                    <SelectValue placeholder="Select scope..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Entire Dataset</SelectItem>
                                    <SelectItem value="company_name">company_name</SelectItem>
                                    <SelectItem value="email">email</SelectItem>
                                    <SelectItem value="country">country</SelectItem>
                                    <SelectItem value="notes">notes</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                   
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? (
                            <Cpu className="mr-2 animate-spin" />
                        ) : (
                            <Sparkles className="mr-2" />
                        )}
                        Run AI Analysis
                    </Button>
                </form>

                {isLoading && (
                     <Alert className="mt-4">
                        <Cpu className="h-4 w-4" />
                        <AlertTitle>Thinking...</AlertTitle>
                        <AlertDescription>
                          Gemini is analyzing your data. This may take a moment.
                        </AlertDescription>
                    </Alert>
                )}

                {result && !isLoading && (
                    <Alert variant="default" className="mt-4 bg-primary/5 border-primary/20">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <AlertTitle className="text-primary font-headline">AI Analysis Complete</AlertTitle>
                        <AlertDescription className="prose prose-sm max-w-none text-foreground">
                            <p>{result}</p>
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
}
