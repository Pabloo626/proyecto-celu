const API_URL = import.meta.env.VITE_API_URL;
const TOKEN = import.meta.env.VITE_API_TOKEN;

function assertEnv() {
  if (!API_URL || !TOKEN) {
    throw new Error("Falta VITE_API_URL o VITE_API_TOKEN en .env.local");
  }
}

async function readJson(res) {
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error API");
  return data;
}

export async function listEntries(month = "") {
  assertEnv();
  const url = new URL(API_URL);
  url.searchParams.set("path", "listExpenses");
  url.searchParams.set("token", TOKEN);
  if (month) url.searchParams.set("month", month);

  const res = await fetch(url.toString());
  const data = await readJson(res);
  return data.items || [];
}

export async function listMonths() {
  assertEnv();
  const url = new URL(API_URL);
  url.searchParams.set("path", "listMonths");
  url.searchParams.set("token", TOKEN);

  const res = await fetch(url.toString());
  const data = await readJson(res);
  return data.months || [];
}

export async function addEntry(entry) {
  assertEnv();
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ path: "addExpense", token: TOKEN, ...entry }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error addEntry");
  return data.id;
}

export async function deleteEntry(id) {
  assertEnv();
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ path: "deleteEntry", token: TOKEN, id }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error deleteEntry");
  return true;
}

export async function replaceAll(items) {
  assertEnv();
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ path: "replaceAll", token: TOKEN, items }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error replaceAll");
  return data.count || 0;
}