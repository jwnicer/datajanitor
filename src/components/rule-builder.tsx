
'use client';
import React, { useEffect, useMemo, useRef, useState } from "react";

// ================================================
// Rule Set Builder — Pro UI (v2)
// - No extra installs; Tailwind only
// - Left: searchable Rule Library (plain-English)
// - Right: Editable Rule Set with live JSON preview
// - Chips multi-select for fields; helpful defaults
// - Inline validations + reordering
// - Local draft autosave + Save to Firestore (compat)
// ================================================

// ---- Types shared with your backend processor ----
type RuleType = "required" | "email" | "phone" | "url" | "date" | "enum" | "regex";

type Rule = {
  ruleId: string;
  type: RuleType;
  appliesTo?: string | string[];
  strategy?: "auto_fix" | "suggest_only" | "none";
  pattern?: string; // regex
  enum?: string[];
  synonyms?: Record<string, string>;
};

type RuleSet = {
  name: string;
  version: number;
  rules: Rule[];
  dictionaries?: Record<string, any>;
  pii?: { fields: string[] };
};

// ---- Canonical fields (for non‑tech suggestions) ----
const CANON_GENERAL = [
  "company_name","contact_name","first_name","last_name","email","phone","company_website","website","address_line1","address_line2","city","state","zip","country","effective_date","expiration_date","gtm_traction","ops_maturity","decision_readiness","growth_intent","cash_runway","policy_number","policy_type","premium","naic","vin"
];

// ---- Starter templates ----
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
      { ruleId: "no_double_spaces", type: "regex", appliesTo: ["company_name", "contact_name", "address_line1", "address_line2"], pattern: "^(?!.*\\\s{2,}).*$" }
    ],
    dictionaries: {},
    pii: { fields: ["email", "phone", "address_line1", "address_line2"] }
  },
  crm: {
    name: "leads",
    version: 1,
    rules: [
      { ruleId: "required_company_name", type: "required", appliesTo: "company_name" },
      { ruleId: "email_valid", type: "email", appliesTo: ["email"], strategy: "auto_fix" },
      { ruleId: "phone_valid", type: "phone", appliesTo: ["phone"], strategy: "auto_fix" },
      { ruleId: "gtm_traction", type: "enum", appliesTo: "gtm_traction", strategy: "auto_fix", enum: ["Strong","Mixed","Weak"], synonyms: { strong: "Strong", mixed: "Mixed", weak: "Weak", s: "Strong", w: "Weak" } },
      { ruleId: "ops_maturity", type: "enum", appliesTo: "ops_maturity", strategy: "auto_fix", enum: ["High","Partial","Ad-hoc"], synonyms: { high: "High", partial: "Partial", "ad hoc": "Ad-hoc", "ad-hoc": "Ad-hoc", adhoc: "Ad-hoc" } },
      { ruleId: "decision_readiness", type: "enum", appliesTo: "decision_readiness", strategy: "auto_fix", enum: ["Decision Maker engaged","Influencer engaged","No clarity"], synonyms: { "decision maker engaged": "Decision Maker engaged", "influencer engaged": "Influencer engaged", "no clarity": "No clarity" } },
      { ruleId: "growth_intent", type: "enum", appliesTo: "growth_intent", strategy: "auto_fix", enum: ["Clear intent","Exploring","No plan"], synonyms: { "clear intent": "Clear intent", exploring: "Exploring", "no plan": "No plan" } },
      { ruleId: "cash_runway", type: "enum", appliesTo: "cash_runway", strategy: "auto_fix", enum: ["Positive","Break-even","Negative"], synonyms: { positive: "Positive", "break even": "Break-even", breakeven: "Break-even", "break-even": "Break-even", negative: "Negative" } }
    ],
    dictionaries: {},
    pii: { fields: ["email","phone"] }
  }
};

const slug = (f: string[]) => f.join("_").replace(/\W+/g, "_");

// ---- Library (cards shown on the left) ----
const LIBRARY: Array<{key:string; title:string; desc:string; example?:string; make:(fields:string[])=>Rule}> = [
  { key: "required", title: "Required Field", desc: "Field must not be empty.", make: f => ({ ruleId:`required_${(f[0]||"field").replace(/\W+/g,'_')}`, type:"required", appliesTo:f[0]||"" }) },
  { key: "email", title: "Valid Email (auto-fix)", desc: "Lowercases and validates email format.", example: "John@Acme.com → john@acme.com", make: f => ({ ruleId:`email_valid_${slug(f)}`, type:"email", appliesTo:f, strategy:"auto_fix" }) },
  { key: "phone", title: "Valid Phone (auto-fix)", desc: "Keeps digits/plus only.", example: "(415) 555‑0199 → +14155550199", make: f => ({ ruleId:`phone_valid_${slug(f)}`, type:"phone", appliesTo:f, strategy:"auto_fix" }) },
  { key: "url", title: "Valid URL (auto-fix)", desc: "Ensures https:// and basic URL shape.", example: "acme.com → https://acme.com", make: f => ({ ruleId:`url_valid_${slug(f)}`, type:"url", appliesTo:f, strategy:"auto_fix" }) },
  { key: "date", title: "Valid Date (auto-fix)", desc: "Parses common dates to YYYY‑MM‑DD.", example: "3/1/24 → 2024‑03‑01", make: f => ({ ruleId:`date_valid_${slug(f)}`, type:"date", appliesTo:f, strategy:"auto_fix" }) },
  { key: "bool_yesno", title: "Yes/No Standardizer", desc: "Maps Y/Yes/True/1 ↔ N/No/False/0.", make: f => ({ ruleId:`bool_yes_no_${slug(f)}`, type:"enum", appliesTo:f, strategy:"auto_fix", enum:["Yes","No"], synonyms:{ y:"Yes", yes:"Yes", 'true':"Yes", '1':"Yes", n:"No", no:"No", 'false':"No", '0':"No" } }) },
  { key: "regex", title: "Custom Pattern", desc: "Flag values that do not match your regex pattern.", example:"ZIP: ^\\d{5}(-\\d{4})?$", make: f => ({ ruleId:`regex_${(f[0]||"field").replace(/\W+/g,'_')}`, type:"regex", appliesTo:f[0]||"", pattern:"" }) },
  { key: "company_chars", title: "Company Name — allowed chars", desc: "Letters, numbers, common punctuation only.", make: () => ({ ruleId:"company_chars", type:"regex", appliesTo:"company_name", pattern:"^[A-Za-z0-9&'()\\-.,/ ]+$" }) },
  { key: "name_chars", title: "Person Name — allowed chars", desc: "Letters and apostrophes/hyphens only.", make: () => ({ ruleId:"name_chars", type:"regex", appliesTo:"contact_name", pattern:"^[A-Za-z ,.'\\-]+$" }) },
  { key: "no_double_spaces", title: "No double spaces", desc: "Flags text containing 2+ consecutive spaces.", make: () => ({ ruleId:"no_double_spaces", type:"regex", appliesTo:["company_name","contact_name","address_line1","address_line2"], pattern:"^(?!.*\\s{2,}).*$" }) },
  { key: "gtm_traction", title:"GTM Traction (enum)", desc:"Strong / Mixed / Weak with synonyms.", make: () => ({ ruleId:"gtm_traction", type:"enum", appliesTo:"gtm_traction", strategy:"auto_fix", enum:["Strong","Mixed","Weak"], synonyms:{strong:"Strong",mixed:"Mixed",weak:"Weak",s:"Strong",w:"Weak"} }) },
  { key: "ops_maturity", title:"Ops Maturity (enum)", desc:"High / Partial / Ad‑hoc with synonyms.", make: () => ({ ruleId:"ops_maturity", type:"enum", appliesTo:"ops_maturity", strategy:"auto_fix", enum:["High","Partial","Ad-hoc"], synonyms:{high:"High",partial:"Partial","ad hoc":"Ad-hoc","ad-hoc":"Ad-hoc",adhoc:"Ad-hoc"} }) },
  { key: "decision_readiness", title:"Decision Readiness (enum)", desc:"Decision Maker / Influencer / No clarity.", make: () => ({ ruleId:"decision_readiness", type:"enum", appliesTo:"decision_readiness", strategy:"auto_fix", enum:["Decision Maker engaged","Influencer engaged","No clarity"], synonyms:{"decision maker engaged":"Decision Maker engaged","influencer engaged":"Influencer engaged","no clarity":"No clarity"} }) },
  { key: "growth_intent", title:"Growth Intent (enum)", desc:"Clear intent / Exploring / No plan.", make: () => ({ ruleId:"growth_intent", type:"enum", appliesTo:"growth_intent", strategy:"auto_fix", enum:["Clear intent","Exploring","No plan"], synonyms:{"clear intent":"Clear intent",exploring:"Exploring","no plan":"No plan"} }) },
  { key: "cash_runway", title:"Cash‑Flow / Runway (enum)", desc:"Positive / Break‑even / Negative.", make: () => ({ ruleId:"cash_runway", type:"enum", appliesTo:"cash_runway", strategy:"auto_fix", enum:["Positive","Break-even","Negative"], synonyms:{positive:"Positive","break even":"Break-even",breakeven:"Break-even","break-even":"Break-even",negative:"Negative"} }) }
];

function RulesBuilder() {
  const [ruleSetId, setRuleSetId] = useState("default");
  const [name, setName] = useState("default");
  const [version, setVersion] = useState(1);
  const [rules, setRules] = useState<Rule[]>([]);
  const [pii, setPii] = useState<string[]>(["email","phone"]);
  const [search, setSearch] = useState("");
  const [showJSON, setShowJSON] = useState(true);

  // field chip input
  const [fieldText, setFieldText] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const sugg = useMemo(()=> CANON_GENERAL.filter(f => f.includes(fieldText.toLowerCase()) && !fields.includes(f)).slice(0,6), [fieldText, fields]);

  // local draft autosave
  const draftKey = `rules_draft_${ruleSetId}`;
  useEffect(()=>{ const raw = localStorage.getItem(draftKey); if(raw){ try{ const j = JSON.parse(raw); hydrate(j); }catch{} } }, [ruleSetId]);
  useEffect(()=>{ const j = currentJSON(); localStorage.setItem(draftKey, JSON.stringify(j)); }, [name, version, rules, pii]);

  function hydrate(j: RuleSet){ setName(j.name||"default"); setVersion(j.version||1); setRules(j.rules||[]); setPii(j.pii?.fields||[]); }

  function addField(v:string){ const t=v.trim(); if(!t) return; if(!fields.includes(t)) setFields([...fields, t]); setFieldText(""); }
  function removeField(v:string){ setFields(fields.filter(x=>x!==v)); }

  function addRule(key:string){ const maker = LIBRARY.find(x=>x.key===key)?.make; if(!maker) return; const r = maker(fields.length?fields:[""]); setRules([...rules, r]); }
  function deleteRule(i:number){ setRules(rules.filter((_,idx)=> idx!==i)); }
  function moveRule(i:number, dir:-1|1){ const j=i+dir; if(j<0||j>=rules.length) return; const next=[...rules]; [next[i],next[j]]=[next[j],next[i]]; setRules(next); }
  function updateRule(i:number, chg:Partial<Rule>){ setRules(rules.map((r,idx)=> idx===i? { ...r, ...chg } : r)); }

  function loadTemplate(key: keyof typeof TEMPLATES){ hydrate(TEMPLATES[key]); }

  function currentJSON(): RuleSet { return { name, version, rules, dictionaries: {}, pii: { fields: pii } }; }

  async function saveToFirestore(){
    try{
      // @ts-ignore compat
      const db = window.firebase?.firestore?.();
      if(!db) throw new Error("Open Settings and sign in first.");
      await db.collection("ruleSets").doc(ruleSetId||name||"default").set(currentJSON(), { merge: true });
      alert("Saved rule set: "+(ruleSetId||name));
    }catch(e:any){ alert(e.message||String(e)); }
  }

  const filteredLib = LIBRARY.filter(i => (i.title+" "+i.desc).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Library */}
      <aside className="col-span-12 lg:col-span-5">
        <div className="border rounded-xl bg-white overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2">
            <div className="font-semibold">Rule Library</div>
            <input value={search} onChange={e=>setSearch(e.target.value)} className="ml-auto border rounded px-2 py-1 text-sm w-48" placeholder="Search…" />
          </div>

          <div className="p-4 border-b">
            <div className="text-sm font-medium mb-2">Fields to apply to</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {fields.map(f => (
                <span key={f} className="px-2 py-1 rounded-full text-xs bg-slate-100 border flex items-center gap-2">
                  {f}
                  <button className="text-slate-500" onClick={()=>removeField(f)}>✕</button>
                </span>
              ))}
              <input value={fieldText} onChange={e=>setFieldText(e.target.value)} onKeyDown={e=> e.key==='Enter' && addField(fieldText)} className="border rounded px-2 py-1 text-sm" placeholder="Type a field and Enter" />
              <button className="px-2 py-1 rounded border text-sm" onClick={()=>addField(fieldText)}>Add</button>
            </div>
            {sugg.length>0 && (
              <div className="text-xs text-slate-500 mb-1">Suggestions</div>
            )}
            <div className="flex flex-wrap gap-1">
              {sugg.map(s => (
                <button key={s} className="px-2 py-0.5 rounded border text-xs bg-slate-50 hover:bg-slate-100" onClick={()=>addField(s)}>{s}</button>
              ))}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto divide-y">
            {filteredLib.map(card => (
              <div key={card.key} className="p-4 hover:bg-slate-50 flex items-start gap-3">
                <div className="grow">
                  <div className="font-medium">{card.title}</div>
                  <div className="text-sm text-slate-600">{card.desc}</div>
                  {card.example && <div className="text-xs text-slate-500 mt-1">Example: {card.example}</div>}
                </div>
                <button className="px-3 py-1 rounded border text-sm" onClick={()=>addRule(card.key)}>Add</button>
              </div>
            ))}
            {filteredLib.length===0 && (
              <div className="p-4 text-sm text-slate-500">No matches.</div>
            )}
          </div>

          <div className="p-4 border-t text-xs text-slate-500">Tip: pick fields above, then click a rule to add it pre‑configured.</div>
        </div>
      </aside>

      {/* Builder */}
      <section className="col-span-12 lg:col-span-7">
        <div className="border rounded-xl bg-white overflow-hidden">
          <div className="p-4 border-b grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">RuleSet ID (document id)</label>
              <input className="border rounded px-2 py-1 w-full" value={ruleSetId} onChange={e=>setRuleSetId(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Display name</label>
                <input className="border rounded px-2 py-1 w-full" value={name} onChange={e=>setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Version</label>
                <input type="number" className="border rounded px-2 py-1 w-full" value={version} onChange={e=>setVersion(parseInt(e.target.value||"1"))} />
              </div>
            </div>
          </div>

          <div className="p-4">
            {rules.length === 0 && (
              <div className="text-sm text-slate-500">No rules yet. Add from the library on the left.</div>
            )}

            {rules.length>0 && (
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-left">Fields</th>
                    <th className="p-2 text-left">Options</th>
                    <th className="p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r, i) => (
                    <tr key={i} className="border-t align-top">
                      <td className="p-2">{i+1}</td>
                      <td className="p-2">
                        <div className="font-medium">{labelForRule(r)}</div>
                        <div className="text-xs text-slate-500">{r.ruleId}</div>
                      </td>
                      <td className="p-2">
                        <FieldChips value={r.appliesTo} onChange={(v)=>updateRule(i,{ appliesTo:v })} />
                      </td>
                      <td className="p-2">
                        <RuleOptions rule={r} onChange={(chg)=>updateRule(i, chg)} />
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button className="px-2 py-1 rounded border" onClick={()=>moveRule(i,-1)}>↑</button>
                          <button className="px-2 py-1 rounded border" onClick={()=>moveRule(i, 1)}>↓</button>
                          <button className="px-2 py-1 rounded border" onClick={()=>deleteRule(i)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-4 pb-4 border-t">
            <div className="font-medium mb-1">PII fields</div>
            <FieldChips value={pii} onChange={setPii} />
            <div className="text-xs text-slate-500 mt-2">PII fields may be hidden in LLM prompts.</div>
          </div>

          <div className="px-4 py-3 border-t bg-slate-50 flex items-center gap-3">
            <button className="px-3 py-2 rounded border" onClick={()=>setShowJSON(!showJSON)}>{showJSON?"Hide JSON":"Show JSON"}</button>
            <div className="text-xs text-slate-500">Live preview of what gets saved.</div>
          </div>
          {showJSON && (
            <pre className="text-xs p-4 bg-white border-t max-h-72 overflow-auto">{JSON.stringify(currentJSON(), null, 2)}</pre>
          )}
        </div>
      </section>
    </div>
  );
}

function FieldChips({ value, onChange }:{ value:string|string[]|undefined; onChange:(v:string[])=>void }){
  const v = Array.isArray(value) ? value : (value ? [value] : []);
  const [input, setInput] = useState("");
  function add(){ const t=input.trim(); if(!t) return; if(!v.includes(t)) onChange([...v, t]); setInput(""); }
  function remove(tag:string){ onChange(v.filter(x=>x!==tag)); }
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1">
        {v.map(tag => (
          <span key={tag} className="px-2 py-1 rounded text-xs bg-slate-100 border flex items-center gap-2">
            {tag}
            <button className="text-slate-500" onClick={()=>remove(tag)}>✕</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="Add field..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} />
        <button className="px-2 py-1 rounded border text-sm" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function RuleOptions({ rule, onChange }:{ rule:Rule; onChange:(c:Partial<Rule>)=>void }){
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
        <div className="flex flex-wrap gap-1">
          {enums.map(e => (
            <span key={e} className="px-2 py-1 rounded text-xs bg-slate-100 border flex items-center gap-2">{e}<button className="text-slate-500" onClick={()=>removeEnum(e)}>✕</button></span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="Add allowed value" value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addEnum()} />
          <button className="px-2 py-1 rounded border text-sm" onClick={addEnum}>Add</button>
        </div>
        <div className="text-xs mt-2">Synonyms (map → value)</div>
        <div className="flex gap-2 items-center">
          <input className="border rounded px-2 py-1 text-sm" placeholder="variant (e.g., yes)" value={synKey} onChange={e=>setSynKey(e.target.value)} />
          <span className="text-xs">→</span>
          <input className="border rounded px-2 py-1 text-sm" placeholder="canonical (e.g., Yes)" value={synVal} onChange={e=>setSynVal(e.target.value)} />
          <button className="px-2 py-1 rounded border text-sm" onClick={addSyn}>Add</button>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(syn).map(([k,v]) => (
            <span key={k} className="px-2 py-1 rounded text-xs bg-slate-100 border flex items-center gap-2">{k} → {v}<button className="text-slate-500" onClick={()=>removeSyn(k)}>✕</button></span>
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
        <input className="border rounded px-2 py-1 text-sm w-full font-mono" placeholder="e.g., ^\\d{5}(-\\d{4})?$" value={pat} onChange={e=>onChange({ pattern:e.target.value })} />
        <div className="text-xs">Strategy</div>
        <select className="border rounded px-2 py-1 text-sm" value={rule.strategy||"none"} onChange={e=>onChange({ strategy:e.target.value as any })}>
          <option value="none">Just flag</option>
          <option value="suggest_only">Suggest fix</option>
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
    case "required": return "Required";
    case "email": return "Valid Email";
    case "phone": return "Valid Phone";
    case "url": return "Valid URL";
    case "date": return "Valid Date";
    case "enum": return "Enum";
    case "regex": return "Regex Pattern";
    default: return r.type;
  }
}