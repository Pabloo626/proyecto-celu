import { useEffect, useMemo, useRef, useState } from "react";
import { addEntry, deleteEntry, listEntries, listMonths, replaceAll } from "./api";

/* =========================================================
   1) CONFIG
   ========================================================= */
const VIEWS = { PROFILE: "profile", ADD: "add", HISTORY: "history", MONTHS: "months", DEBUG: "debug" };
const ENTRY_TYPES = { EXPENSE: "expense", INCOME: "income" };

const PROFILES = [
  { id: "pablo", name: "Pablo" },
  { id: "maria_ignacia", name: "Maria Ignacia" },
];

const OPTIONS = {
  categories: ["Comida", "Transporte", "Casa", "Salud", "Panorama", "Otros"],
  incomeCategories: ["Sueldo", "Transferencia", "Reembolso", "Regalo", "Venta", "Otros"],
};

// Preferencias locales (no son “la BD”; la BD es Google Sheets)
const STORAGE = {
  themeKey: "gp_theme_v1",
  profileKey: "gp_profile_v1",
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

// Fecha LOCAL (no UTC) para evitar “mañana” por desfase horario
function todayISODateLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKeyFromISODate(iso) {
  return String(iso || "").slice(0, 7);
}

function monthStartISO(monthKey) {
  return `${monthKey}-01`;
}

function isBeforeMonth(isoDate, monthKey) {
  // Comparación segura con strings YYYY-MM-DD (ISO)
  return String(isoDate || "") < monthStartISO(monthKey);
}

function formatCLP(n) {
  return Number(n || 0).toLocaleString("es-CL");
}

function parseAmount(input) {
  const n = Number(String(input || "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function profileName(profileId) {
  return PROFILES.find((p) => p.id === profileId)?.name || "—";
}

function sumAmounts(items) {
  return items.reduce((acc, e) => acc + Number(e.amount || 0), 0);
}

function loadTheme() {
  const t = localStorage.getItem(STORAGE.themeKey);
  return t === "dark" || t === "light" ? t : "light";
}

function saveTheme(t) {
  localStorage.setItem(STORAGE.themeKey, t);
}

function loadProfile() {
  const p = localStorage.getItem(STORAGE.profileKey);
  return PROFILES.some((x) => x.id === p) ? p : "pablo";
}

function saveProfile(p) {
  localStorage.setItem(STORAGE.profileKey, p);
}

/* =========================================================
   2) Normalización (para importar JSON y legacy)
   ========================================================= */
function normalizeEntry(raw) {
  // Migración antigua: paidBy -> profile (yo/ella/pareja)
  let profile = raw?.profile;
  if (!profile) {
    const pb = String(raw?.paidBy || "").toLowerCase();
    if (pb === "yo") profile = "pablo";
    else if (pb === "pareja" || pb === "ella" || pb === "maria" || pb === "maria_ignacia") profile = "maria_ignacia";
    else profile = "pablo";
  }

  let type = raw?.type;
  if (type !== ENTRY_TYPES.INCOME && type !== ENTRY_TYPES.EXPENSE) type = ENTRY_TYPES.EXPENSE;

  const validCats = type === ENTRY_TYPES.INCOME ? OPTIONS.incomeCategories : OPTIONS.categories;
  const category = validCats.includes(raw?.category) ? raw.category : "Otros";

  const amount = Number(raw?.amount || 0);

  const date =
    typeof raw?.date === "string" && raw.date.length >= 10 ? raw.date.slice(0, 10) : todayISODateLocal();

  return {
    id: raw?.id || uid(),
    type,
    amount: Number.isFinite(amount) ? Math.round(amount) : 0,
    category,
    profile,
    date,
    note: String(raw?.note || "").trim(),
    split: type === ENTRY_TYPES.EXPENSE ? raw?.split || "50_50" : null,
    createdAt: raw?.createdAt || new Date().toISOString(),
  };
}

/* =========================================================
   3) UI Components
   ========================================================= */
function CategoryBars({ rows, maxValue }) {
  return (
    <div>
      {rows.map((r) => {
        const pct = maxValue > 0 ? Math.round((r.value / maxValue) * 100) : 0;
        return (
          <div className="barRow" key={r.label}>
            <div className="barLabel" title={r.label}>
              {r.label}
            </div>
            <div className="barTrack">
              <div className="barFill" style={{ width: `${pct}%` }} />
            </div>
            <div className="barValue">${formatCLP(r.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

function MonthCard({ month, income, expense, onPick, isActive }) {
  const net = Number(income || 0) - Number(expense || 0);
  const netLabel = net >= 0 ? `+$${formatCLP(net)}` : `-$${formatCLP(Math.abs(net))}`;
  return (
    <button type="button" className={`rowCard monthBtn ${isActive ? "isActive" : ""}`} onClick={onPick}>
      <div className="rowTop">
        <div className="money">{month}</div>
        <div className="meta">{netLabel}</div>
      </div>
      <div className="meta">Ingresos: +${formatCLP(income)} · Gastos: -${formatCLP(expense)}</div>
    </button>
  );
}

function SegmentedType({ value, onChange }) {
  return (
    <div className="segmented" role="tablist" aria-label="Tipo de movimiento">
      <button
        type="button"
        role="tab"
        aria-selected={value === ENTRY_TYPES.EXPENSE}
        className={`segBtn ${value === ENTRY_TYPES.EXPENSE ? "isActive" : ""}`}
        onClick={() => onChange(ENTRY_TYPES.EXPENSE)}
      >
        💸 Gasto
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === ENTRY_TYPES.INCOME}
        className={`segBtn ${value === ENTRY_TYPES.INCOME ? "isActive" : ""}`}
        onClick={() => onChange(ENTRY_TYPES.INCOME)}
      >
        ✨ Ingreso
      </button>
    </div>
  );
}

/* =========================================================
   4) APP
   ========================================================= */
export default function App() {
  const today = todayISODateLocal();
  const currentMonth = monthKeyFromISODate(today);

  const [view, setView] = useState(VIEWS.PROFILE);

  // Preferencias locales
  const [theme, setTheme] = useState(loadTheme);
  const [profileId, setProfileId] = useState(loadProfile);

  // Nube
  const [allEntries, setAllEntries] = useState([]);
  const [monthsFromCloud, setMonthsFromCloud] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");

  // Form (por defecto: gasto + fecha hoy)
  const [entryType, setEntryType] = useState(ENTRY_TYPES.EXPENSE);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(OPTIONS.categories[0]);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");

  // Menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Debug: cargar JSON desde archivo para REEMPLAZAR nube
  const fileInputRef = useRef(null);

  // Evitar doble fetch en dev (StrictMode)
  const didInitRef = useRef(false);

  /* ---------- Effects ---------- */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveProfile(profileId);
  }, [profileId]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Asegurar categoría válida cuando cambia tipo
  useEffect(() => {
    const list = entryType === ENTRY_TYPES.INCOME ? OPTIONS.incomeCategories : OPTIONS.categories;
    if (!list.includes(category)) setCategory(list[0] || "Otros");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryType]);

  /* ---------- Cloud ---------- */
  async function refreshAll() {
    setLoading(true);
    setErr("");
    try {
      const [items, ms] = await Promise.all([listEntries(""), listMonths()]);
      setAllEntries(items);
      setMonthsFromCloud(ms);
      // Asegurar que el mes seleccionado exista en el listado visual (aunque no haya datos)
      const combined = new Set([currentMonth, ...ms]);
      if (!combined.has(selectedMonth)) setSelectedMonth(currentMonth);
      setLastSyncAt(new Date().toISOString());
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function go(to) {
    setView(to);
    setMenuOpen(false);

    if (to === VIEWS.ADD) {
      // defaults solicitados: gasto + hoy
      setEntryType(ENTRY_TYPES.EXPENSE);
      setDate(todayISODateLocal());
      setAmount("");
      setNote("");
      setCategory(OPTIONS.categories[0]);
    }
  }

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
    setMenuOpen(false);
  }

  /* ---------- Derivados (mes seleccionado) ---------- */
  const entriesMonth = useMemo(
    () => allEntries.filter((e) => monthKeyFromISODate(e.date) === selectedMonth),
    [allEntries, selectedMonth]
  );

  const myEntriesMonth = useMemo(
    () => entriesMonth.filter((e) => e.profile === profileId),
    [entriesMonth, profileId]
  );

  const myExpensesMonth = useMemo(
    () => myEntriesMonth.filter((e) => e.type === ENTRY_TYPES.EXPENSE),
    [myEntriesMonth]
  );

  const myIncomesMonth = useMemo(
    () => myEntriesMonth.filter((e) => e.type === ENTRY_TYPES.INCOME),
    [myEntriesMonth]
  );

  const myIncomeTotal = useMemo(() => sumAmounts(myIncomesMonth), [myIncomesMonth]);
  const myExpenseTotal = useMemo(() => sumAmounts(myExpensesMonth), [myExpensesMonth]);
  const myNet = useMemo(() => myIncomeTotal - myExpenseTotal, [myIncomeTotal, myExpenseTotal]);

  const myTopExpenseCategories = useMemo(() => {
    const map = new Map();
    for (const e of myExpensesMonth) {
      const k = e.category || "Otros";
      map.set(k, (map.get(k) || 0) + Number(e.amount || 0));
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [myExpensesMonth]);

  const myMaxCat = useMemo(() => Math.max(0, ...myTopExpenseCategories.map((x) => x.value)), [myTopExpenseCategories]);

  // Presupuestos de ejemplo (% del ingreso del mes por perfil)
  const budgetPercents = useMemo(() => {
    if (profileId === "pablo") return { Casa: 0.35, Comida: 0.18, Transporte: 0.08, Panorama: 0.05, Salud: 0.03, Otros: 0.06 };
    return { Casa: 0.30, Comida: 0.20, Transporte: 0.08, Panorama: 0.06, Salud: 0.03, Otros: 0.06 };
  }, [profileId]);

  const spendByCat = useMemo(() => {
    const m = {};
    for (const e of myExpensesMonth) {
      const c = e.category || "Otros";
      m[c] = (m[c] || 0) + Number(e.amount || 0);
    }
    return m;
  }, [myExpensesMonth]);

  const budgetRows = useMemo(() => {
    const rows = [];
    const income = myIncomeTotal;
    for (const cat in budgetPercents) {
      const pct = budgetPercents[cat] || 0;
      const target = Math.round(income * pct);
      const spent = Math.round(spendByCat[cat] || 0);
      const delta = spent - target; // +: se pasó / -: falta
      rows.push({ cat, pct, target, spent, delta });
    }
    rows.sort((a, b) => b.pct - a.pct);
    return rows;
  }, [budgetPercents, myIncomeTotal, spendByCat]);

  // Deudas/aportes del pasado (placeholder): neto acumulado antes del mes seleccionado
  const pastNet = useMemo(() => {
    const past = allEntries
      .filter((e) => e.profile === profileId)
      .filter((e) => isBeforeMonth(e.date, selectedMonth));

    const pastIncome = sumAmounts(past.filter((e) => e.type === ENTRY_TYPES.INCOME));
    const pastExpense = sumAmounts(past.filter((e) => e.type === ENTRY_TYPES.EXPENSE));
    return {
      count: past.length,
      income: pastIncome,
      expense: pastExpense,
      net: pastIncome - pastExpense,
    };
  }, [allEntries, profileId, selectedMonth]);

  const myNetLabel = myNet >= 0 ? `+$${formatCLP(myNet)}` : `-$${formatCLP(Math.abs(myNet))}`;
  const pastNetLabel = pastNet.net >= 0 ? `+$${formatCLP(pastNet.net)}` : `-$${formatCLP(Math.abs(pastNet.net))}`;

  /* ---------- Meses pasados (con preview tipo Appold) ---------- */
  const availableMonths = useMemo(() => {
    const set = new Set([currentMonth, ...monthsFromCloud]);
    return [...set].filter(Boolean).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  }, [monthsFromCloud, currentMonth]);

  const monthSnapshot = useMemo(() => {
    const out = new Map();
    for (const m of availableMonths) out.set(m, { income: 0, expense: 0 });

    for (const e of allEntries) {
      if (e.profile !== profileId) continue;
      const m = monthKeyFromISODate(e.date);
      if (!out.has(m)) out.set(m, { income: 0, expense: 0 });
      const bucket = out.get(m);
      if (e.type === ENTRY_TYPES.INCOME) bucket.income += Number(e.amount || 0);
      else bucket.expense += Number(e.amount || 0);
    }
    return out;
  }, [allEntries, profileId, availableMonths]);

  /* ---------- Historial ---------- */
  const allSorted = useMemo(() => {
    const copy = [...allEntries];
    copy.sort(
      (a, b) =>
        (b.date || "").localeCompare(a.date || "") ||
        (b.createdAt || "").localeCompare(a.createdAt || "")
    );
    return copy;
  }, [allEntries]);

  /* ---------- Actions ---------- */
  async function onSubmit(e) {
    e.preventDefault();
    const n = parseAmount(amount);
    if (n === null) return alert("Monto inválido (>0).");

    const validCats = entryType === ENTRY_TYPES.INCOME ? OPTIONS.incomeCategories : OPTIONS.categories;
    if (!validCats.includes(category)) return alert("Categoría inválida.");

    const entry = {
      id: uid(),
      type: entryType,
      amount: n,
      category,
      profile: profileId,
      date,
      note: note.trim(),
      split: entryType === ENTRY_TYPES.EXPENSE ? "50_50" : null,
      createdAt: new Date().toISOString(),
    };

    setLoading(true);
    setErr("");
    try {
      await addEntry(entry);
      await refreshAll();
      setSelectedMonth(monthKeyFromISODate(entry.date));
      go(VIEWS.PROFILE);
    } catch (e2) {
      setErr(e2?.message || String(e2));
      alert("Error guardando en nube: " + (e2?.message || String(e2)));
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id) {
    if (!confirm("¿Eliminar este movimiento?")) return;
    setLoading(true);
    setErr("");
    try {
      await deleteEntry(id);
      await refreshAll();
    } catch (e) {
      setErr(e?.message || String(e));
      alert("Error eliminando: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copiado ✅");
    } catch {
      alert("No se pudo copiar.");
    }
  }

  async function onJsonFileSelected(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;

    let txt = "";
    try {
      txt = await file.text();
    } catch {
      return alert("No se pudo leer el archivo.");
    }

    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch {
      return alert("JSON inválido.");
    }

    let items = parsed;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      items = parsed.items || parsed.entries || parsed.movements || parsed.data || [];
    }
    if (!Array.isArray(items)) return alert("El JSON debe ser un array o { items:[...] }.");

    // Normaliza para soportar legacy y asegurar estructura
    const normalized = items.map(normalizeEntry);

    if (!confirm("Esto REEMPLAZARÁ la nube (Google Sheet). ¿Continuar?")) return;

    setLoading(true);
    setErr("");
    try {
      await replaceAll(normalized);
      await refreshAll();
      alert("Nube reemplazada ✅");
      go(VIEWS.PROFILE);
    } catch (e) {
      setErr(e?.message || String(e));
      alert("Error importando: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  const catList = entryType === ENTRY_TYPES.INCOME ? OPTIONS.incomeCategories : OPTIONS.categories;

  return (
    <>
      <div className="appHeader">
        <div className="appHeaderInner">
          <div className="topBar" />
        </div>
      </div>

      <div className="container">
        {/* Header nube */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="chartTitleRow">
            <div>
              <div className="kpiBig">Nube (Google Sheets)</div>
              <div className="kpiSmall">
                Mes: <b>{selectedMonth}</b> · Perfil: <b>{profileName(profileId)}</b> · Tema: <b>{theme}</b>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <button className="secondaryBtn" onClick={refreshAll} disabled={loading}>
                {loading ? "Sincronizando..." : "Sincronizar"}
              </button>
              <div className="small" style={{ marginTop: 6 }}>
                {err ? `Error: ${err}` : lastSyncAt ? `Última sync: ${new Date(lastSyncAt).toLocaleString()}` : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* PERFIL */}
        {view === VIEWS.PROFILE && (
          <div className="grid">
            <div className="card grid">
              <div className="chartTitleRow">
                <div>
                  <div className="kpiBig">Perfil · {selectedMonth}</div>
                  <div className="kpiSmall">Vista personal</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="kpiBig">+${formatCLP(myIncomeTotal)}</div>
                  <div className="kpiSmall">Ingresos</div>
                  <div style={{ height: 6 }} />
                  <div className="kpiBig">-${formatCLP(myExpenseTotal)}</div>
                  <div className="kpiSmall">Gastos</div>
                </div>
              </div>

              <div className="card">
                <div className="kpiBig">Neto del mes (tú)</div>
                <div className="meta" style={{ marginTop: 6 }}>
                  {myNetLabel}
                </div>
                <div className="small" style={{ marginTop: 6 }}>(Ingresos - Gastos)</div>
              </div>

              <div className="barsWrap">
                <div className="kpiSmall">Tus gastos por categoría</div>
                {myTopExpenseCategories.length === 0 ? (
                  <div className="kpiSmall" style={{ marginTop: 10 }}>
                    Sin gastos este mes.
                  </div>
                ) : (
                  <CategoryBars rows={myTopExpenseCategories} maxValue={myMaxCat} />
                )}
              </div>

              <div className="card">
                <div className="kpiBig">Presupuesto por % (ejemplo)</div>
                <div className="meta" style={{ marginTop: 6 }}>
                  Meta = (tus ingresos del mes) × %
                </div>

                <div style={{ marginTop: 12 }} className="grid">
                  {budgetRows.map((r) => {
                    const deltaLabel =
                      r.delta > 0 ? `Te pasaste por $${formatCLP(r.delta)}` : `Te faltan $${formatCLP(Math.abs(r.delta))}`;
                    return (
                      <div key={r.cat} className="rowCard">
                        <div className="rowTop">
                          <div className="money">{r.cat}</div>
                          <div className="meta">{Math.round(r.pct * 100)}%</div>
                        </div>
                        <div className="meta">
                          Gastado: <b>${formatCLP(r.spent)}</b> · Meta: <b>${formatCLP(r.target)}</b>
                        </div>
                        <div className="meta">{deltaLabel}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card">
                <div className="kpiBig">Deudas / aportes del pasado</div>
                <div className="meta" style={{ marginTop: 6 }}>
                  Placeholder (lo configuraremos mejor después). Por ahora: neto acumulado antes de {selectedMonth}.
                </div>
                <div className="meta" style={{ marginTop: 10 }}>
                  Neto histórico: <b>{pastNetLabel}</b>
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  Movimientos anteriores: {pastNet.count} · Ingresos: +${formatCLP(pastNet.income)} · Gastos: -${formatCLP(pastNet.expense)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ADD */}
        {view === VIEWS.ADD && (
          <div className="grid">
            <div className="card grid">
              <div className="kpiBig">{entryType === "income" ? "Agregar ingreso" : "Agregar gasto"}</div>
              <SegmentedType value={entryType} onChange={setEntryType} />
              <div className="meta">
                Se guardará en: <b>{profileName(profileId)}</b>
              </div>

              <form onSubmit={onSubmit} className="formGrid" style={{ marginTop: 10 }}>
                <label className="label span2">
                  Monto (CLP) *
                  <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>

                <label className="label">
                  Categoría
                  <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {catList.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="label">
                  Fecha
                  <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>

                <label className="label span2">
                  Nota (opcional)
                  <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>

                <div className="span2">
                  <button className="primary" type="submit" disabled={loading}>
                    {loading ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* HISTORY */}
        {view === VIEWS.HISTORY && (
          <div className="grid">
            <div className="card">
              <div className="kpiBig">Historial</div>
              <div className="meta">Todo lo guardado en la nube.</div>
            </div>

            {allSorted.length === 0 ? (
              <div className="card">No hay movimientos todavía.</div>
            ) : (
              allSorted.map((e) => (
                <div key={e.id} className="rowCard">
                  <div className="rowTop">
                    <div className="money">{e.type === "income" ? "+" : "-"}${formatCLP(e.amount)}</div>
                    <div className="meta">{e.date}</div>
                  </div>
                  <div className="meta">
                    {e.type === "income" ? "Ingreso" : "Gasto"} · {e.category} · {profileName(e.profile)}
                  </div>
                  {e.note ? <div className="meta">{e.note}</div> : null}
                  <button className="danger" onClick={() => onDelete(e.id)} disabled={loading}>
                    Eliminar
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* MONTHS */}
        {view === VIEWS.MONTHS && (
          <div className="grid">
            <div className="card">
              <div className="kpiBig">Meses pasados</div>
              <div className="meta">
                Elige un mes para ver el análisis de <b>{profileName(profileId)}</b>.
              </div>
            </div>

            {availableMonths.map((m) => {
              const snap = monthSnapshot.get(m) || { income: 0, expense: 0 };
              return (
                <MonthCard
                  key={m}
                  month={m}
                  income={snap.income}
                  expense={snap.expense}
                  isActive={m === selectedMonth}
                  onPick={() => {
                    setSelectedMonth(m);
                    go(VIEWS.PROFILE);
                  }}
                />
              );
            })}
          </div>
        )}

        {/* DEBUG */}
        {view === VIEWS.DEBUG && (
          <div className="grid">
            <div className="card">
              <div className="money">Debug</div>
              <div className="meta">Cambiar perfil + importar JSON a la nube.</div>

              <div style={{ marginTop: 12 }}>
                <div className="kpiSmall">Perfil actual</div>
                <select className="select" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  {PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="adminActions">
                <button className="secondaryBtn" onClick={() => copyToClipboard(JSON.stringify(allEntries, null, 2))}>
                  Copiar JSON
                </button>
                <button className="secondaryBtn" onClick={refreshAll} disabled={loading}>
                  {loading ? "..." : "Recargar nube"}
                </button>
                <button className="secondaryBtn" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                  Cargar JSON → Reemplazar nube
                </button>
                <button className="secondaryBtn" onClick={toggleTheme}>
                  Cambiar tema ({theme === "light" ? "🌙" : "☀️"})
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  style={{ display: "none" }}
                  onChange={onJsonFileSelected}
                />
              </div>
            </div>

            <div className="card">
              <div className="kpiBig">JSON (vista)</div>
              <textarea className="monoArea" value={JSON.stringify(allEntries, null, 2)} readOnly />
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="bottomNav" ref={menuRef}>
        {menuOpen && (
          <div className="navMenuBox" role="menu">
            <button className="navMenuItem" onClick={() => go(VIEWS.HISTORY)} role="menuitem">
              Historial
            </button>
            <button className="navMenuItem" onClick={() => go(VIEWS.MONTHS)} role="menuitem">
              Meses pasados
            </button>
            <button className="navMenuItem" onClick={() => go(VIEWS.DEBUG)} role="menuitem">
              Debug
            </button>
            <button className="navMenuItem" onClick={toggleTheme} role="menuitem">
              Cambiar tema ({theme === "light" ? "🌙" : "☀️"})
            </button>
          </div>
        )}

        <div className="bottomNavInner">
          <button className="navBtn" onClick={() => setMenuOpen((s) => !s)} aria-label="Opciones">
            ☰
          </button>
          <button className="navBtn navBtnPrimary" onClick={() => go(VIEWS.ADD)} aria-label="Agregar">
            +
          </button>
          <button className={`navBtn ${view === VIEWS.PROFILE ? "isActive" : ""}`} onClick={() => go(VIEWS.PROFILE)} aria-label="Perfil">
            👤
          </button>
        </div>
      </div>
    </>
  );
}
