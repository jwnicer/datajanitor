import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const ruleSet = JSON.parse(fs.readFileSync(new URL('../../rulesets/insurance-default.json', import.meta.url)));
await db.collection('ruleSets').doc('insurance-default').set(ruleSet);

console.log('Seeded insurance-default ruleset to Firestore.');
