'use server';
/**
 * @fileOverview An LLM-assisted data review flow for identifying and correcting data quality issues.
 *
 * - llmAssistedDataReview - A function that handles the data review process using an LLM.
 * - LLMAssistedDataReviewInput - The input type for the llmAssistedDataReview function.
 * - LLMAssistedDataReviewOutput - The return type for the llmAssistedDataReview function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const LLMAssistedDataReviewInputSchema = z.object({
  rules: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      appliesTo: z.array(z.string()),
      validator: z.string(),
      params: z.record(z.any()).optional(),
      fix: z
        .object({
          strategy: z.enum(['auto_fix', 'suggest_only', 'llm_suggest', 'none']),
        })
        .optional(),
      severity: z.enum(['info', 'warning', 'error']).optional(),
      enabled: z.boolean(),
    })
  ),
  rows: z.array(
    z.object({
      rowId: z.string(),
      data: z.record(z.any()),
    })
  ),
});
export type LLMAssistedDataReviewInput = z.infer<typeof LLMAssistedDataReviewInputSchema>;

const LLMAssistedDataReviewOutputSchema = z.object({
  issues: z.array(
    z.object({
      rowId: z.string(),
      field: z.string(),
      ruleId: z.string(),
      problem: z.string(),
      suggestion: z.any().nullable(),
      confidence: z.number().min(0).max(1),
    })
  ),
});
export type LLMAssistedDataReviewOutput = z.infer<typeof LLMAssistedDataReviewOutputSchema>;

export async function llmAssistedDataReview(input: LLMAssistedDataReviewInput): Promise<LLMAssistedDataReviewOutput> {
  return llmAssistedDataReviewFlow(input);
}

const prompt = ai.definePrompt({
  name: 'llmAssistedDataReviewPrompt',
  input: {schema: LLMAssistedDataReviewInputSchema},
  output: {schema: LLMAssistedDataReviewOutputSchema},
  prompt: `You are a data quality assistant. Apply the provided checklist of rules and normalization dictionaries to the provided rows. Return JSON with an array of issues. Each issue should contain the rowId, field, ruleId, problem, suggestion, and a confidence score between 0 and 1. Only propose safe, reversible fixes. If not confident, say so.

Rules: {{{JSON.stringify rules}}}
Rows: {{{JSON.stringify rows}}}

Output Schema: { issues: [{ rowId: string, field: string, ruleId: string, problem: string, suggestion: any, confidence: number }] }`,
});

const llmAssistedDataReviewFlow = ai.defineFlow(
  {
    name: 'llmAssistedDataReviewFlow',
    inputSchema: LLMAssistedDataReviewInputSchema,
    outputSchema: LLMAssistedDataReviewOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
