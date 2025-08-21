'use server';

/**
 * @fileOverview A flow that enriches company data by automatically finding official websites/domains based on company names and locations.
 *
 * - enrichCompanyWebsite - A function that handles the company website enrichment process.
 * - EnrichCompanyWebsiteInput - The input type for the enrichCompanyWebsite function.
 * - EnrichCompanyWebsiteOutput - The return type for the enrichCompanyWebsite function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EnrichCompanyWebsiteInputSchema = z.object({
  companyName: z.string().describe('The name of the company.'),
  location: z.string().optional().describe('The location of the company.'),
});
export type EnrichCompanyWebsiteInput = z.infer<typeof EnrichCompanyWebsiteInputSchema>;

const EnrichCompanyWebsiteOutputSchema = z.object({
  website: z.string().optional().describe('The official website of the company.'),
  confidence: z.number().optional().describe('The confidence score of the website being the correct one (0-1).'),
  evidence: z.array(z.string()).optional().describe('Top URLs/snippets used to determine the website.'),
});
export type EnrichCompanyWebsiteOutput = z.infer<typeof EnrichCompanyWebsiteOutputSchema>;

export async function enrichCompanyWebsite(input: EnrichCompanyWebsiteInput): Promise<EnrichCompanyWebsiteOutput> {
  return enrichCompanyWebsiteFlow(input);
}

const prompt = ai.definePrompt({
  name: 'enrichCompanyWebsitePrompt',
  input: {schema: EnrichCompanyWebsiteInputSchema},
  output: {schema: EnrichCompanyWebsiteOutputSchema},
  prompt: `You are an expert data quality assistant.
  Your task is to find the official website for a given company name and location, if provided.
  Return a JSON object with the website, a confidence score (0-1) indicating the likelihood of the website being the correct one, and an array of top URLs/snippets used as evidence.

  Company Name: {{{companyName}}}
  Location: {{{location}}}
  {
    "website": "",
    "confidence": 0.0,
    "evidence": []
  }`,
});

const enrichCompanyWebsiteFlow = ai.defineFlow(
  {
    name: 'enrichCompanyWebsiteFlow',
    inputSchema: EnrichCompanyWebsiteInputSchema,
    outputSchema: EnrichCompanyWebsiteOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
