
'use client';
import React, { useMemo, useState } from "react";

// ================================================
// Rules Builder — Non‑Tech Friendly (Batch 14)
// Drop this component on your Rules page.
// - Left: Rule Library with plain-English descriptions
// - Right: Your current Rule Set (live JSON preview)
// - Works with the processor you already have (types: required, email, phone, url, date, enum, regex)
// - Saves directly to Firestore: ruleSets/{ruleSetId}
// ================================================

// UI: Tailwind only. (shadcn/ui optional if available)

// Helpers -------------------------------------------------
const CANON_GENERAL = [
  "company_name",
  "contact_name",
  "email",
  "phone",
  "company_website",
  "website",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "zip",
  "country",
  "effective_date",
  "expiration_date",
  "gtm_traction",
  "ops_maturity",
  "decision_readiness",
  "growth_intent",
  "cash_runway",
];

// Default templates (non‑tech friendly presets) ----------
const TEMPLATES: Record<string, RuleSet> = {
  simple: {
    name: "default",
    version: 1,
    rules: [
      { ruleId: "required_company_name", type: "required", appliesTo: "company_name" },
      { ruleId: "email_valid", type: "email", appliesTo: ["email"], strategy: "auto_fix" },
      { ruleId: "phone_valid", type: "phone", appliesTo: ["phone"], strategy: "auto_fix" },
      { ruleId: "url_valid", type: "url", appliesTo: ["company_website", "website"], strategy: "auto_fix" },
      { ruleId: "date_effective_iso", type: "date", appliesTo: ["effective_date"], strategy: "auto_fix" },
      { ruleId: "date_expiration_iso", type: "date", appliesTo: ["expiration_date"], strategy: "auto_fix" },
      { ruleId: "no_double_spaces", type: "regex", appliesTo: ["company_name", "contact_name", "address_line1", "address_line2"], pattern: "^(?!.*\\\\s{2,}).*$" },
    ],
    dictionaries: {},
    pii: { fields: ["email", "phone", "address_line1", "address_line2"] },
  },
  crm: {
    name: "leads",
    version: 1,
    rules: [
      { ruleId: "required_company_name", type: "required", appliesTo: "company_name" },
      { ruleId: "email_valid", type: "email", appliesTo: ["email"], strategy: "auto_fix" },
      { ruleId: "phone_valid", type: "phone", appliesTo: ["phone"], strategy: "auto_fix" },
      { ruleId: "gtm_traction", type: "enum", appliesTo: "gtm_traction", strategy: "auto_fix", enum: ["Strong","Mixed","Weak"], synonyms: { strong: "Strong", mixed: "Mixed", weak: "Weak" } },
      { ruleId: "ops_maturity", type: "enum", appliesTo: "ops_maturity", strategy: "auto_fix", enum: ["High","Partial","Ad-hoc"], synonyms: { high: "High", partial: "Partial", "ad hoc": "Ad-hoc", "ad-hoc": "Ad-hoc", adhoc: "Ad-hoc" } },
      { ruleId: "decision_readiness", type: "enum", appliesTo: "decision_readiness", strategy: "auto_fix", enum: ["Decision Maker engaged","Influencer engaged","No clarity"], synonyms: { "decision maker engaged": "Decision Maker engaged", "influencer engaged": "Influencer engaged", "no clarity": "No clarity" } },
      { ruleId: "growth_intent", type: "enum", appliesTo: "growth_intent", strategy: "auto_fix", enum: ["Clear intent","Exploring","No plan"], synonyms: { "clear intent": "Clear intent", exploring: "Exploring", "no plan": "No plan" } },
      { ruleId: "cash_runway", type: "enum", appliesTo: "cash_runway", strategy: "auto_fix", enum: ["Positive","Break-even","Negative"], synonyms: { positive: "Positive", "break even": "Break-even", breakeven: "Break-even", "break-even": "Break-even", negative: "Negative" } },
    ],
    dictionaries: {},
    pii: { fields: ["email","phone"] },
  },
};

// Library -------------------------------------------------
export type RuleType = "required"|"email"|"phone"|"url"|"date"|"enum"|"regex";
export type Rule = {
  ruleId: string;
  type: RuleType;
  appliesTo?: string|string[];
  strategy?: "auto_fix"|"suggest_only"|"none";
  pattern?: string;
  enum?: string[];
  synonyms?: Record<string,string>;
};
export type RuleSet = {
  name: string;
  version: number;
  rules: Rule[];
  dictionaries?: Record<string, any>;
  pii?: { fields: string[] };
};

const LIBRARY: Array<{key:string; title:string; desc:string; example?:string; make:(fields:string[])=>Rule}> = [
  {
    key: "required",
    title: "Required Field",
    desc: "Field must not be empty.",
    make: (f)=>({ ruleId: `required_${f[0]||"field"}`, type: "required", appliesTo: f[0]||"" })
  },
  {
    key: "email",
    title: "Valid Email (auto-fix)",
    desc: "Lowercases and validates email format.",
    example: "John@Acme.com → john@acme.com",
    make: (f)=>({ ruleId: `email_valid_${f.join("_")}`, type: "email", appliesTo: f, strategy: "auto_fix" })
  },
  {
    key: "phone",
    title: "Valid Phone (auto-fix)",
    desc: "Keeps digits/plus only.",
    example: "(415) 555-0199 → +14155550199",
    make: (f)=>({ ruleId: `phone_valid_${f.join("_")}`, type: "phone", appliesTo: f, strategy: "auto_fix" })
  },
  {
    key: "url",
    title: "Valid URL (auto-fix)",
    desc: "Ensures https:// and basic URL shape.",
    example: "acme.com → https://acme.com",
    make: (f)=>({ ruleId: `url_valid_${f.join("_")}`, type: "url", appliesTo: f, strategy: "auto_fix" })
  },
  {
    key: "date",
    title: "Valid Date (auto-fix to YYYY-MM-DD)",
    desc: "Parses common dates into ISO format.",
    example: "3/1/24 → 2024-03-01",
    make: (f)=>({ ruleId: `date_valid_${f.join("_")}`, type: "date", appliesTo: f, strategy: "auto_fix" })
  },
  {
    key: "bool_yesno",
    title: "Yes/No Standardizer (enum)",
    desc: "Maps Y/Yes/True/1 ↔ N/No/False/0.",
    make: (f)=>({ ruleId: `bool_yes_no_${f.join("_")}`, type: "enum", appliesTo: f, strategy: "auto_fix", enum:["Yes","No"], synonyms:{ y:"Yes", yes:"Yes", true:"Yes", "1":"Yes", n:"No", no:"No", false:"No", "0":"No" } })
  },
  {
    key: "regex",
    title: "Custom Pattern (regex)",
    desc: "Flag values that do not match your pattern.",
    example: "ZIP: ^\\\\d{5}(-\\\\d{4})?$",
    make: (f)=>({ ruleId: `regex_${f[0]||"field"}`, type: "regex", appliesTo: f[0]||"", pattern: "" })
  },
  {
    key: "company_chars",
    title: "Company Name — Allowed Characters",
    desc: "Letters, numbers, common punctuation only.",
    make: ()=>({ ruleId: "company_chars", type:"regex", appliesTo:"company_name", pattern: "^[A-Za-z0-9&'()\\\\-.,/ ]+$" })
  },
  {
    key: "name_chars",
    title: "Person Name — Allowed Characters",
    desc: "Letters and apostrophes/hyphens only.",
    make: ()=>({ ruleId: "name_chars", type:"regex", appliesTo:"contact_name", pattern: "^[A-Za-z ,.'\\\\-]+$" })
  },
  {
    key: "no_double_spaces",
    title: "No Double Spaces",
    desc: "Flags text containing 2+ consecutive spaces.",
    make: ()=>({ ruleId:"no_double_spaces", type:"regex", appliesTo:["company_name","contact_name","address_line1","address_line2"], pattern:"^(?!.*\\\\s{2,}).*$" })
  },
  {
    key: "gtm_traction",
    title: "GTM Traction (enum)",
    desc: "Strong / Mixed / Weak with synonyms.",
    make: ()=>({ ruleId:"gtm_traction", type:"enum", appliesTo:"gtm_traction", strategy:"auto_fix", enum:["Strong","Mixed","Weak"], synonyms:{ strong:"Strong", mixed:"Mixed", weak:"Weak", s:"Strong", w:"Weak" } })
  },
  {
    key: "ops_maturity",
    title: "Ops Maturity (enum)",
    desc: "High / Partial / Ad‑hoc with synonyms.",
    make: ()=>({ ruleId:"ops_maturity", type:"enum", appliesTo:"ops_maturity", strategy:"auto_fix", enum:["High","Partial","Ad-hoc"], synonyms:{ high:"High", partial:"Partial", "ad hoc":"Ad-hoc", "ad-hoc":"Ad-hoc", adhoc:"Ad-hoc" } })
  },
  {
    key: "decision_readiness",
    title: "Decision Readiness (enum)",
    desc: "Decision Maker / Influencer / No clarity.",
    make: ()=>({ ruleId:"decision_readiness", type:"enum", appliesTo:"decision_readiness", strategy:"auto_fix", enum:["Decision Maker engaged","Influencer engaged","No clarity"], synonyms:{ "decision maker engaged":"Decision Maker engaged", "influencer engaged":"Influencer engaged", "no clarity":"No clarity" } })
  },
  {
    key: "growth_intent",
    title: "Growth Intent (enum)",
    desc: "Clear intent / Exploring / No plan.",
    make: ()=>({ ruleId:"growth_intent", type:"enum", appliesTo:"growth_intent", strategy:"auto_fix", enum:["Clear intent","Exploring","No plan"], synonyms:{ "clear intent":"Clear intent", exploring:"Exploring", "no plan":"No plan" } })
  },
  {
    key: "cash_runway",
    title: "Cash‑Flow / Runway (enum)",
    desc: "Positive / Break‑even / Negative.",
    make: ()=>({ ruleId:"cash_runway", type:"enum", appliesTo:"cash_runway", strategy:"auto_fix", enum:["Positive","Break-even","Negative"], synonyms:{ positive:"Positive", "break even":"Break-even", breakeven:"Break-even", "break-even":"Break-even", negative:"Negative" } })
  },
];

// Component ------------------------------------------------
export default function RulesBuilder() {
  const [ruleSetId, setRuleSetId] = useState("default");
  const [name, setName] = useState("default");
  const [version, setVersion] = useState(1);
  const [rules, setRules] = useState<Rule[]>([]);
  const [pii, setPii] = useState<string[]>(["email","phone"]);
  const [dictionaries, setDictionaries] = useState<Record<string, any>>({});

  // quick-add fields (non‑tech friendly selector)
  const [fieldInput, setFieldInput] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  function addField(tag: string){
    const t = tag.trim();
    if (!t) return;
    if (!selectedFields.includes(t)) setSelectedFields(prev => [...prev, t]);
    setFieldInput("");
  }
  function removeField(tag: string){ setSelectedFields(prev => prev.filter(x => x !== tag)); }

  function addRuleFromLib(key: string){
    const item = LIBRARY.find(i => i.key === key);
    if (!item) return;
    // for one-field rules like required/regex, take first selection; for multi, pass all
    const fields = selectedFields.length ? selectedFields : [""];
    const rule = item.make(fields);
    setRules(prev => [...prev, rule]);
  }

  function removeRule(idx: number){ setRules(prev => prev.filter((_,i)=>i!==idx)); }

  function moveRule(idx: number, dir: -1|1){
    setRules(prev => {
      const arr = [...prev];
      const j = idx + dir; if (j < 0 || j >= arr.length) return prev;
      const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp; return arr;
    });
  }

  const jsonPreview: RuleSet = useMemo(()=>({ name, version, rules, dictionaries, pii: { fields: pii } }), [name, version, rules, dictionaries, pii]);

  async function saveToFirestore(){
    try{
      // @ts-ignore — using Firebase compat if available globally
      const db = window.firebase?.firestore?.();
      if (!db) throw new Error("Firebase not found. Open Settings and sign in first.");
      await db.collection("ruleSets").doc(ruleSetId || name || "default").set(jsonPreview, { merge: true });
      alert("Saved rule set: " + (ruleSetId||name));
    }catch(e:any){ alert(e.message || String(e)); }
  }

  function loadTemplate(t: keyof typeof TEMPLATES){
    const tpl = TEMPLATES[t];
    setName(tpl.name); setVersion(tpl.version); setRules(tpl.rules); setDictionaries(tpl.dictionaries||{}); setPii(tpl.pii?.fields||[]);
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left: Library */}
      <div className="col-span-12 lg:col-span-5">
        <div className="border rounded-xl bg-white">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-semibold">Rule Library</div>
            <div className="text-xs text-slate-500">Click a rule to add</div>
          </div>

          {/* Fields picker */}
          <div className="px-4 py-3 border-b">
            <div className="text-sm font-medium mb-2">Fields to apply to</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedFields.map(tag => (
                <span key={tag} className="px-2 py-1 rounded-full text-xs bg-slate-100 border flex items-center gap-2">
                  {tag}
                  <button className="text-slate-500" onClick={()=>removeField(tag)}>✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="Type a field (e.g., email) and press Add" value={fieldInput} onChange={e=>setFieldInput(e.target.value)} />
              <button className="px-3 py-1 rounded border text-sm" onClick={()=>addField(fieldInput)}>Add</button>
              <div className="text-xs text-slate-500 ml-2 hidden md:block">Suggestions: {CANON_GENERAL.slice(0,6).join(", ")}…</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-xs">
              {CANON_GENERAL.map(f => (
                <button key={f} className="px-2 py-0.5 rounded border bg-slate-50 hover:bg-slate-100" onClick={()=>addField(f)}>{f}</button>
              ))}
            </div>
          </div>

          {/* Library list */}
          <div className="max-h-[60vh] overflow-auto divide-y">
            {LIBRARY.map(item => (
              <div key={item.key} className="p-4 hover:bg-slate-50">
                <div className="flex items-start gap-3">
                  <div className="grow">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-sm text-slate-600">{item.desc}</div>
                    {item.example && <div className="text-xs text-slate-500 mt-1">Example: {item.example}</div>}
                  </div>
                  <button className="px-3 py-1 rounded border text-sm" onClick={()=>addRuleFromLib(item.key)}>Add</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Templates */}
        <div className="border rounded-xl bg-white mt-4 p-4">
          <div className="font-semibold mb-2">Templates</div>
          <div className="flex gap-2">
            <button className="px-3 py-1 rounded border text-sm" onClick={()=>loadTemplate("simple")}>Simple Cleanup</button>
            <button className="px-3 py-1 rounded border text-sm" onClick={()=>loadTemplate("crm")}>CRM / Leads</button>
          </div>
          <div className="text-xs text-slate-500 mt-2">Templates pre-fill sensible rules you can still edit.</div>
        </div>
      </div>

      {/* Right: Current Rule Set */}
      <div className="col-span-12 lg:col-span-7">
        <div className="border rounded-xl bg-white">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-semibold">Your Rule Set</div>
            <div className="flex items-center gap-2 text-sm">
              <input className="border rounded px-2 py-1" placeholder="RuleSet ID (doc id)" value={ruleSetId} onChange={e=>setRuleSetId(e.target.value)} />
              <button className="px-3 py-1 rounded border" onClick={saveToFirestore}>Save</button>
            </div>
          </div>

          {/* Header config */}
          <div className="p-4 border-b grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Display name</label>
              <input className="border rounded px-2 py-1 w-full" value={name} onChange={e=>setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Version</label>
              <input type="number" className="border rounded px-2 py-1 w-full" value={version} onChange={e=>setVersion(parseInt(e.target.value||"1"))} />
            </div>
          </div>

          {/* Rules table */}
          <div className="p-4">
            {rules.length === 0 && (
              <div className="text-sm text-slate-500">No rules yet. Add from the library on the left.</div>
            )}
            {rules.length > 0 && (
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Rule</th>
                    <th className="p-2 text-left">Fields</th>
                    <th className="p-2 text-left">Options</th>
                    <th className="p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 align-top">{i+1}</td>
                      <td className="p-2 align-top">
                        <div className="font-medium">{labelForRule(r)}</div>
                        <div className="text-xs text-slate-500">{r.ruleId}</div>
                      </td>
                      <td className="p-2 align-top">
                        <FieldBadges value={r.appliesTo} onChange={(v)=>updateRule(i, { appliesTo: v })} />
                      </td>
                      <td className="p-2 align-top">
                        <OptionsEditor rule={r} onChange={(chg)=>updateRule(i, chg)} />
                      </td>
                      <td className="p-2 align-top whitespace-nowrap">
                        <div className="flex gap-2">
                          <button className="px-2 py-1 rounded border" onClick={()=>moveRule(i,-1)}>↑</button>
                          <button className="px-2 py-1 rounded border" onClick={()=>moveRule(i, 1)}>↓</button>
                          <button className="px-2 py-1 rounded border" onClick={()=>removeRule(i)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* PII & Dictionaries */}
          <div className="px-4 pb-4 border-t">
            <div className="font-medium mb-1">PII fields</div>
            <FieldBadges value={pii} onChange={setPii} />
            <div className="mt-3 text-xs text-slate-500">PII fields may be hidden from prompts when LLMs are used.</div>
          </div>

          {/* JSON Preview */}
          <div className="px-4 py-3 border-t bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="font-medium">JSON Preview</div>
              <div className="flex gap-2">
                <button className="px-2 py-1 rounded border text-sm" onClick={()=>navigator.clipboard.writeText(JSON.stringify(jsonPreview, null, 2))}>Copy</button>
                <button className="px-2 py-1 rounded border text-sm" onClick={saveToFirestore}>Save</button>
              </div>
            </div>
            <pre className="text-xs mt-2 p-2 bg-white border rounded overflow-auto max-h-72">{JSON.stringify(jsonPreview, null, 2)}</pre>
          </div>
        </div>
      </div>
    </div>
  );

  function updateRule(index: number, changes: Partial<Rule>){
    setRules(prev => prev.map((r,i)=> i===index ? { ...r, ...changes } : r));
  }
}

// ---------- Small subcomponents ----------
function FieldBadges({ value, onChange }:{ value: string|string[]|undefined; onChange:(v:string[])=>void }){
  const v = Array.isArray(value) ? value : (value ? [value] : []);
  const [input, setInput] = useState("");
  function add(){ const t=input.trim(); if(!t) return; if(!v.includes(t)) onChange([...v, t]); setInput(""); }
  function remove(tag:string){ onChange(v.filter(x=>x!==tag)); }
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {v.map(tag => (
          <span key={tag} className="px-2 py-1 rounded-full text-xs bg-slate-100 border flex items-center gap-2">
            {tag}
            <button className="text-slate-500" onClick={()=>remove(tag)}>✕</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="Add field (e.g., email)" value={input} onChange={e=>setInput(e.target.value)} />
        <button className="px-3 py-1 rounded border text-sm" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function OptionsEditor({ rule, onChange }:{ rule: Rule; onChange:(c:Partial<Rule>)=>void }){
  if (rule.type === "enum"){
    const [val, setVal] = useState("");
    const [synKey, setSynKey] = useState("");
    const [synVal, setSynVal] = useState("");
    const enums = rule.enum || [];
    const syn = rule.synonyms || {};
    function addEnum(){ const t=val.trim(); if(!t) return; onChange({ enum:[...enums, t] }); setVal(""); }
    function removeEnum(x:string){ onChange({ enum: enums.filter(e=>e!==x) }); }
    function addSyn(){ const k=synKey.trim(); const v=synVal.trim(); if(!k||!v) return; onChange({ synonyms: { ...(rule.synonyms||{}), [k]: v } }); setSynKey(""); setSynVal(""); }
    function removeSyn(k:string){ const n={...(rule.synonyms||{})}; delete n[k]; onChange({ synonyms:n }); }
    return (
      <div className="space-y-2">
        <div className="text-xs">Strategy</div>
        <select className="border rounded px-2 py-1 text-sm" value={rule.strategy||"auto_fix"} onChange={e=>onChange({ strategy:e.target.value as any })}>
          <option value="auto_fix">Auto‑fix to closest value</option>
          <option value="suggest_only">Only suggest fixes</option>
          <option value="none">Just flag issues</option>
        </select>
        <div className="text-xs mt-2">Allowed values</div>
        <div className="flex flex-wrap gap-2">
          {enums.map(e => (
            <span key={e} className="px-2 py-1 rounded-full text-xs bg-slate-100 border flex items-center gap-2">{e}<button className="text-slate-500" onClick={()=>removeEnum(e)}>✕</button></span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="Add allowed value" value={val} onChange={e=>setVal(e.target.value)} />
          <button className="px-3 py-1 rounded border text-sm" onClick={addEnum}>Add</button>
        </div>
        <div className="text-xs mt-2">Synonyms (map → value)</div>
        <div className="flex gap-2 items-center">
          <input className="border rounded px-2 py-1 text-sm" placeholder="variant (e.g., yes)" value={synKey} onChange={e=>setSynKey(e.target.value)} />
          <span className="text-xs">→</span>
          <input className="border rounded px-2 py-1 text-sm" placeholder="canonical (e.g., Yes)" value={synVal} onChange={e=>setSynVal(e.target.value)} />
          <button className="px-3 py-1 rounded border text-sm" onClick={addSyn}>Add</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-1">
          {Object.entries(syn).map(([k,v]) => (
            <span key={k} className="px-2 py-1 rounded-full text-xs bg-slate-100 border flex items-center gap-2">{k} → {v}<button className="text-slate-500" onClick={()=>removeSyn(k)}>✕</button></span>
          ))}
        </div>
      </div>
    );
  }
  if (rule.type === "regex"){
    const pat = rule.pattern || "";
    return (
      <div className="space-y-2">
        <div className="text-xs">Pattern (regex)</div>
        <input className="border rounded px-2 py-1 text-sm w-full" placeholder="e.g., ^\\\d{5}(-\\\d{4})?$" value={pat} onChange={e=>onChange({ pattern:e.target.value })} />
        <div className="text-xs">Strategy</div>
        <select className="border rounded px-2 py-1 text-sm" value={rule.strategy||"suggest_only"} onChange={e=>onChange({ strategy:e.target.value as any })}>
          <option value="suggest_only">Only suggest fix</option>
          <option value="none">Just flag issues</option>
        </select>
      </div>
    );
  }
  if (["email","phone","url","date"].includes(rule.type)){
    return (
      <div className="space-y-2">
        <div className="text-xs">Strategy</div>
        <select className="border rounded px-2 py-1 text-sm" value={rule.strategy||"auto_fix"} onChange={e=>onChange({ strategy:e.target.value as any })}>
          <option value="auto_fix">Auto‑fix (safe)</option>
          <option value="suggest_only">Only suggest</option>
          <option value="none">Just flag</option>
        </select>
      </div>
    );
  }
  return <div className="text-xs text-slate-500">No options</div>;
}

function labelForRule(r: Rule){
  switch (r.type){
    case "required": return "Required field";
    case "email": return "Valid email";
    case "phone": return "Valid phone";
    case "url": return "Valid URL";
    case "date": return "Valid date (ISO)";
    case "enum": return "Standardize values (enum)";
    case "regex": return "Custom pattern (regex)";
    default: return r.type;
  }
}
