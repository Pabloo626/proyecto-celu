const API_URL = import.meta.env.VITE_API_URL;
const TOKEN = import.meta.env.VITE_API_TOKEN;

function assertEnv() {
  if (!API_URL || !TOKEN) {
    throw new Error("Falta VITE_API_URL o VITE_API_TOKEN en .env.local");
  }
}

async function readJson(res) {
  const txt = await res.text();

  let data;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch (e) {
    // Si Apps Script devuelve HTML (login/error), lo mostramos para depurar
    throw new Error("Respuesta no-JSON desde API: " + (txt?.slice(0, 200) || "(vacía)"));
  }

  if (!data || typeof data !== "object") {
    throw new Error("Respuesta inválida desde API");
  }
  if (!data.ok) throw new Error(data.error || "Error API");
  return data;
}

export async function getConfig() {
  assertEnv();
  const url = new URL(API_URL);
  url.searchParams.set("path", "getConfig");
  url.searchParams.set("token", TOKEN);

  const res = await fetch(url.toString());
  const data = await readJson(res);
  return data.config;
}

// Asigna este deviceId a un perfil en Config.devices
export async function registerDeviceProfile({ deviceId, profile }) {
  assertEnv();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ path: "registerDevice", token: TOKEN, deviceId, profile }),
  });
  return readJson(res);
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
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ path: "addExpense", token: TOKEN, ...entry }),
  });
  const data = await readJson(res);
  return data.id;
}

export async function deleteEntry(id) {
  assertEnv();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ path: "deleteEntry", token: TOKEN, id }),
  });
  await readJson(res);
  return true;
}

export async function replaceAll(items) {
  assertEnv();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ path: "replaceAll", token: TOKEN, items }),
  });
  const data = await readJson(res);
  return data.count || 0;
}

export async function setConfig(config) {
  assertEnv();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ path: "setConfig", token: TOKEN, config }),
  });
  return readJson(res);
}
