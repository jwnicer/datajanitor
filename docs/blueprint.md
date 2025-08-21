# **App Name**: DataMaestro

## Core Features:

- File Upload & Parsing: Allow users to upload data files in formats like CSV, Excel, TSV, and JSONL, supporting file sizes up to 500MB. This feature will handle chunked processing for large files.
- Rule Checklist Configuration: Enable users to configure validation and normalization rules through a no-code builder, with a JSON rule DSL for advanced configurations.
- LLM-Assisted Data Review: Use Gemini 2.5 to provide batch assistance, reviewing ambiguous or erroneous rows and suggesting fixes with confidence scores.
- Ad-Hoc LLM Prompting: Allow users to enter prompts such as “LLM, scan column X for any anomalies we missed”, where the Gemini 2.5 model will reason and apply a tool which scans the designated column of data
- Company Website Enrichment: Implement web search to enrich company data by automatically finding official websites/domains based on company names and locations, using the Gemini with Google Search Grounding tool
- Issues and Fixes Interface: Provide a detailed 'Issues' interface that highlights data quality issues, including severity, rule violations, and suggested fixes, with an option for users to approve or reject each fix.
- Data Export: Enable users to export the cleaned dataset, including applied fixes, into formats compatible with other systems.

## Style Guidelines:

- Primary color: Deep violet (#673AB7) to evoke the sense of organization, accuracy, and power of modern AI; violet connects to data, wisdom, and thoughtful consideration. 
- Background color: Very light violet (#F3E5F5). Keeping it pale retains a sense of data precision while allowing other design elements to stand out.
- Accent color: Indigo (#3F51B5) to provide clear contrast and signal important interactions.
- Body and headline font: 'Inter' (sans-serif) for a clean, readable, and modern appearance suitable for data-heavy interfaces.
- Code font: 'Source Code Pro' (monospace) for displaying rule configurations and code snippets.
- Use simple, geometric icons that visually communicate data processing stages and issue types, maintaining consistency with the modern aesthetic.
- Employ subtle transitions and loading animations to enhance user experience during data processing and rule application, providing feedback without being intrusive.