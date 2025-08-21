
export async function apiPost<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
