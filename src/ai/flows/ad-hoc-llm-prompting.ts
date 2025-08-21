'use server';
/**
 * @fileOverview A flow for ad-hoc LLM prompting on data.
 *
 * - adHocLlmPrompt - A function that handles the ad-hoc LLM prompting process.
 * - AdHocLlmPromptInput - The input type for the adHocLlmPrompt function.
 * - AdHocLlmPromptOutput - The return type for the adHocLlmPrompt function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AdHocLlmPromptInputSchema = z.object({
  prompt: z.string().describe('The ad-hoc prompt to be used for data analysis.'),
  sample: z.string().describe('A sample of the data to be analyzed, in JSON format.'),
  rules: z.string().optional().describe('Optional rules to guide the analysis, in JSON format.'),
});
export type AdHocLlmPromptInput = z.infer<typeof AdHocLlmPromptInputSchema>;

const AdHocLlmPromptOutputSchema = z.string().describe('The LLM-generated analysis results.');
export type AdHocLlmPromptOutput = z.infer<typeof AdHocLlmPromptOutputSchema>;

export async function adHocLlmPrompt(input: AdHocLlmPromptInput): Promise<AdHocLlmPromptOutput> {
  return adHocLlmPromptFlow(input);
}

const prompt = ai.definePrompt({
  name: 'adHocLlmPromptPrompt',
  input: {schema: AdHocLlmPromptInputSchema},
  output: {schema: AdHocLlmPromptOutputSchema},
  prompt: `You are a rigorous data QA auditor. Use the rules if provided. Analyze the data sample provided, following the instructions in the prompt. Return your analysis.

Prompt: {{{prompt}}}
Sample Data: {{{sample}}}
Rules (if any): {{{rules}}}`, // Corrected Handlebars syntax
});

const adHocLlmPromptFlow = ai.defineFlow(
  {
    name: 'adHocLlmPromptFlow',
    inputSchema: AdHocLlmPromptInputSchema,
    outputSchema: AdHocLlmPromptOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
