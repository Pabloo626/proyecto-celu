import { useEffect, useMemo, useRef, useState } from "react";

/* =========================================================
   1) CONFIG / CONSTANTES
   ========================================================= */
const APP = {
  title: "Gastos Pareja",
  subtitle: "Minimal · Mobile-first",
  locale: "es-CL",
};

const STORAGE = {
  expensesKey: "gastos_pareja_v1",
  themeKey: "gastos_theme_v1",
  profileKey: "gastos_profile_v1",
};

const VIEWS = {
  PROFILE: "profile",
  ADD: "add",
  HISTORY: "history",
  DEBUG: "debug",
  MONTHS: "months",
};

const ENTRY_TYPES = {
  EXPENSE: "expense",
  INCOME: "income",
};

const UX = {
  defaultView: VIEWS.PROFILE,
  defaultTheme: "light",
  defaultProfileId: "pablo",
  noteLocalOnly: "* Guardado local por ahora (en este dispositivo/navegador).",
};

const PROFILES = [
  { id: "pablo", name: "Pablo" },
  { id: "maria_ignacia", name: "Maria Ignacia" },
];

const OPTIONS = {
  categories: ["Comida", "Transporte", "Casa", "Salud", "Panorama", "Otros"],
  incomeCategories: ["Sueldo", "Transferencia", "Reembolso", "Regalo", "Venta", "Otros"],
};

/**
 * Presupuesto de ejemplo (temporal).
 * % se calcula contra INGRESOS del mes de cada perfil.
 */
const BUDGET_RULES = {
  pablo: {
    Casa: 0.25,
    Comida: 0.15,
    Transporte: 0.08,
    Salud: 0.06,
    Panorama: 0.10,
    Otros: 0.05,
  },
  maria_ignacia: {
    Casa: 0.30,
    Comida: 0.12,
    Transporte: 0.06,
    Salud: 0.06,
    Panorama: 0.08,
    Otros: 0.05,
  },
};

const LABELS = {
  bottomNav: {
    menu: "Opciones",
    add: "Agregar",
    profile: "Perfil",
  },
  menu: {
    months: "Meses pasados",
    history: "Historial",
    debug: "Debug",
  },
  views: {
    profileTitle: "Perfil",
    addTitle: "Agregar",
    historyTitle: "Historial",
    debugTitle: "Debug / Admin",
    monthsTitle: "Meses pasados",
  },
  buttons: {
    saveExpense: "Guardar gasto",
    saveIncome: "Guardar ingreso",
    delete: "Eliminar",
    copyJson: "Copiar JSON (movimientos)",
    loadJson: "Cargar JSON",
    reload: "Recargar",
    clearAll: "Borrar todos los datos",
    back: "Volver",
  },
};

/* =========================================================
   2) HELPERS
   ========================================================= */
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

// IMPORTANTE: usamos fecha LOCAL (no UTC) para evitar que se muestre “mañana” por desfase horario.
function todayISODate() {
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
  return Number(n || 0).toLocaleString(APP.locale);
}

function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
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

/* =========================================================
   3) STORAGE + MIGRACIÓN
   ========================================================= */
function normalizeEntry(raw) {
  // Migración antigua: paidBy -> profile
  let profile = raw?.profile;
  if (!profile) {
    if (raw?.paidBy === "yo") profile = "pablo";
    else if (raw?.paidBy === "pareja") profile = "maria_ignacia";
    else profile = UX.defaultProfileId;
  }

  let type = raw?.type;
  if (type !== ENTRY_TYPES.INCOME && type !== ENTRY_TYPES.EXPENSE) type = ENTRY_TYPES.EXPENSE;

  const amount = Number(raw?.amount || 0);

  const validCats = type === ENTRY_TYPES.INCOME ? OPTIONS.incomeCategories : OPTIONS.categories;
  const category = validCats.includes(raw?.category) ? raw.category : "Otros";

  const date =
    typeof raw?.date === "string" && raw.date.length >= 10 ? raw.date.slice(0, 10) : todayISODate();

  return {
    id: raw?.id || uid(),
    type,
    amount: Number.isFinite(amount) ? amount : 0,
    category,
    profile,
    date,
    note: String(raw?.note || "").trim(),
    split: type === ENTRY_TYPES.EXPENSE ? raw?.split || "50_50" : null,
    createdAt: raw?.createdAt || new Date().toISOString(),
  };
}

function loadEntries() {
  const raw = localStorage.getItem(STORAGE.expensesKey) || "[]";
  const arr = safeParseJSON(raw, []);
  const normalized = Array.isArray(arr) ? arr.map(normalizeEntry) : [];
  localStorage.setItem(STORAGE.expensesKey, JSON.stringify(normalized));
  return normalized;
}

function saveEntries(items) {
  localStorage.setItem(STORAGE.expensesKey, JSON.stringify(items));
}

function loadTheme() {
  const t = localStorage.getItem(STORAGE.themeKey);
  return t === "dark" || t === "light" ? t : UX.defaultTheme;
}

function saveTheme(theme) {
  localStorage.setItem(STORAGE.themeKey, theme);
}

function loadProfile() {
  const p = localStorage.getItem(STORAGE.profileKey);
  return PROFILES.some((x) => x.id === p) ? p : UX.defaultProfileId;
}

function saveProfile(id) {
  localStorage.setItem(STORAGE.profileKey, id);
}

/* =========================================================
   4) UI COMPONENTS
   ========================================================= */
function CategoryBars({ rows, maxValue, formatValue }) {
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
            <div className="barValue">{formatValue(r.value)}</div>
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

/* =========================================================
   5) APP
   ========================================================= */
export default function App() {
  const today = todayISODate();
  const currentMonth = monthKeyFromISODate(today);

  /* ---------- State ---------- */
  const [view, setView] = useState(UX.defaultView);
  const [theme, setTheme] = useState(loadTheme);
  const [profileId, setProfileId] = useState(loadProfile);
  const [entries, setEntries] = useState(loadEntries);

  // Mes seleccionado para análisis (por defecto: mes actual)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // Form (por defecto: gasto, fecha hoy)
  const [entryType, setEntryType] = useState(ENTRY_TYPES.EXPENSE);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(OPTIONS.categories[0]);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");

  // Menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Debug: cargar JSON desde archivo
  const jsonFileRef = useRef(null);

  /* ---------- Effects ---------- */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveProfile(profileId);
  }, [profileId]);

  useEffect(() => {
    saveEntries(entries);
  }, [entries]);

  // Asegurar categoría válida cuando cambia tipo
  useEffect(() => {
    const list = entryType === ENTRY_TYPES.INCOME ? OPTIONS.incomeCategories : OPTIONS.categories;
    if (!list.includes(category)) setCategory(list[0] || "Otros");
  }, [entryType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cerrar menú al click fuera / Escape
  useEffect(() => {
    if (!menuOpen) return;

    function onDown(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
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

  /* ---------- Navigation helpers ---------- */
  function go(to) {
    setView(to);
    setMenuOpen(false);
  }

  function openAdd() {
    // Reglas solicitadas:
    // 1) fecha por defecto hoy
    // 2) modo por defecto gasto
    setEntryType(ENTRY_TYPES.EXPENSE);
    setDate(todayISODate());
    setCategory(OPTIONS.categories[0]);
    setAmount("");
    setNote("");
    go(VIEWS.ADD);
  }

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  /* ---------- Derivados (mes seleccionado) ---------- */
  const entriesSelectedMonth = useMemo(
    () => entries.filter((e) => monthKeyFromISODate(e.date) === selectedMonth),
    [entries, selectedMonth]
  );

  const myMonthEntries = useMemo(
    () => entriesSelectedMonth.filter((e) => e.profile === profileId),
    [entriesSelectedMonth, profileId]
  );

  const myExpensesMonth = useMemo(
    () => myMonthEntries.filter((e) => e.type === ENTRY_TYPES.EXPENSE),
    [myMonthEntries]
  );

  const myIncomesMonth = useMemo(
    () => myMonthEntries.filter((e) => e.type === ENTRY_TYPES.INCOME),
    [myMonthEntries]
  );

  const myExpenseTotal = useMemo(() => sumAmounts(myExpensesMonth), [myExpensesMonth]);
  const myIncomeTotal = useMemo(() => sumAmounts(myIncomesMonth), [myIncomesMonth]);
  const myNet = useMemo(() => myIncomeTotal - myExpenseTotal, [myIncomeTotal, myExpenseTotal]);

  const myTopExpenseCategories = useMemo(() => {
    const map = new Map();
    for (const e of myExpensesMonth) {
      const k = e.category || "Otros";
      map.set(k, (map.get(k) || 0) + Number(e.amount || 0));
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [myExpensesMonth]);

  const myMaxCat = useMemo(() => Math.max(0, ...myTopExpenseCategories.map((x) => x.value)), [myTopExpenseCategories]);

  const myBudgetRows = useMemo(() => {
    const rules = BUDGET_RULES[profileId] || {};
    const income = myIncomeTotal;

    // Pre-calc gasto por categoría
    const spentByCat = new Map();
    for (const e of myExpensesMonth) {
      const k = e.category || "Otros";
      spentByCat.set(k, (spentByCat.get(k) || 0) + Number(e.amount || 0));
    }

    return Object.entries(rules).map(([cat, pct]) => {
      const target = Math.round(income * pct);
      const actual = Math.round(spentByCat.get(cat) || 0);
      const diff = target - actual; // + => falta / - => excedido
      return {
        category: cat,
        pct,
        income,
        target,
        actual,
        diff,
      };
    });
  }, [profileId, myIncomeTotal, myExpensesMonth]);

  // “Deudas / aportes del pasado” (placeholder basado en historial):
  // neto acumulado ANTES del mes seleccionado (ingresos - gastos).
  const pastNet = useMemo(() => {
    const past = entries
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
  }, [entries, profileId, selectedMonth]);

  /* ---------- Meses disponibles ---------- */
  const availableMonths = useMemo(() => {
    const set = new Set([currentMonth]);
    for (const e of entries) set.add(monthKeyFromISODate(e.date));
    return [...set].filter(Boolean).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  }, [entries, currentMonth]);

  const monthSnapshot = useMemo(() => {
    // Map month -> { income, expense } para ESTE perfil
    const out = new Map();
    for (const m of availableMonths) out.set(m, { income: 0, expense: 0 });

    for (const e of entries) {
      if (e.profile !== profileId) continue;
      const m = monthKeyFromISODate(e.date);
      if (!out.has(m)) out.set(m, { income: 0, expense: 0 });
      const bucket = out.get(m);
      if (e.type === ENTRY_TYPES.INCOME) bucket.income += Number(e.amount || 0);
      else bucket.expense += Number(e.amount || 0);
    }
    return out;
  }, [entries, profileId, availableMonths]);

  /* ---------- Derivados (debug) ---------- */
  const rawJSON = useMemo(() => {
    try {
      return JSON.stringify(entries, null, 2);
    } catch {
      return "No se pudo serializar los datos.";
    }
  }, [entries]);

  /* ---------- Handlers ---------- */
  function addEntry(e) {
    e.preventDefault();

    const n = parseAmount(amount);
    if (n === null) {
      alert("Monto inválido. Debe ser un número > 0.");
      return;
    }

    const validCats = entryType === ENTRY_TYPES.INCOME ? OPTIONS.incomeCategories : OPTIONS.categories;
    if (!validCats.includes(category)) {
      alert("Categoría inválida.");
      return;
    }

    const item = {
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

    setEntries([item, ...entries]);

    // Reset form a defaults solicitados
    setEntryType(ENTRY_TYPES.EXPENSE);
    setDate(todayISODate());
    setCategory(OPTIONS.categories[0]);
    setAmount("");
    setNote("");

    go(VIEWS.PROFILE);
  }

  function removeEntry(id) {
    const found = entries.find((x) => x.id === id);
    const msg = found?.type === ENTRY_TYPES.INCOME ? "¿Eliminar este ingreso?" : "¿Eliminar este gasto?";
    if (!confirm(msg)) return;
    setEntries(entries.filter((x) => x.id !== id));
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copiado al portapapeles ✅");
    } catch {
      alert("No se pudo copiar.");
    }
  }

  async function handleLoadJsonFile(ev) {
    const file = ev?.target?.files?.[0];
    // Permite volver a cargar el mismo archivo
    if (ev?.target) ev.target.value = "";
    if (!file) return;

    let text;
    try {
      text = await file.text();
    } catch {
      alert("No se pudo leer el archivo.");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      alert("El archivo no es un JSON válido.");
      return;
    }

    // Acepta: array directo, o { items: [...] }, { entries: [...] }, etc.
    let arr = parsed;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const candidates = [parsed.items, parsed.entries, parsed.movements, parsed.data];
      arr = candidates.find(Array.isArray);
    }

    if (!Array.isArray(arr)) {
      alert("El JSON debe ser un array de movimientos (o un objeto con items/entries). ");
      return;
    }

    const normalized = arr.map(normalizeEntry);

    if (entries.length > 0) {
      const ok = confirm("Esto reemplazará tus datos actuales en este navegador. ¿Continuar?");
      if (!ok) return;
    }

    setEntries(normalized);

    // Ajustar selectedMonth si el actual ya no existe
    const months = normalized.map((x) => monthKeyFromISODate(x.date)).filter(Boolean);
    const setMonths = new Set(months);
    const defaultMonth = monthKeyFromISODate(todayISODate());
    const fallback = months.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))[0] || defaultMonth;
    setSelectedMonth(setMonths.has(selectedMonth) ? selectedMonth : setMonths.has(defaultMonth) ? defaultMonth : fallback);

    alert("JSON cargado ✅");
  }

  function reloadFromStorage() {
    setEntries(loadEntries());
    alert("Recargado desde storage ✅");
  }

  function clearAll() {
    if (!confirm("¿Borrar todos los datos (gastos + ingresos) en este navegador?")) return;
    localStorage.removeItem(STORAGE.expensesKey);
    localStorage.removeItem(STORAGE.profileKey);
    setEntries([]);
    setProfileId(UX.defaultProfileId);
    setSelectedMonth(currentMonth);
    alert("Datos borrados.");
    go(VIEWS.PROFILE);
  }

  const addTitle = entryType === ENTRY_TYPES.INCOME ? "Agregar ingreso" : "Agregar gasto";
  const addButtonLabel = entryType === ENTRY_TYPES.INCOME ? LABELS.buttons.saveIncome : LABELS.buttons.saveExpense;
  const catList = entryType === ENTRY_TYPES.INCOME ? OPTIONS.incomeCategories : OPTIONS.categories;

  const signedMoney = (entry) => {
    const sign = entry?.type === ENTRY_TYPES.INCOME ? "+" : "-";
    return `${sign}$${formatCLP(entry.amount)}`;
  };

  const myNetLabel = myNet >= 0 ? `+$${formatCLP(myNet)}` : `-$${formatCLP(Math.abs(myNet))}`;
  const pastNetLabel = pastNet.net >= 0 ? `+$${formatCLP(pastNet.net)}` : `-$${formatCLP(Math.abs(pastNet.net))}`;

  return (
    <>
      {/* ====== HEADER (barra simple) ====== */}
      <div className="appHeader">
        <div className="appHeaderInner">
          <div className="topBar" />
        </div>
      </div>

      {/* ====== MAIN ====== */}
      <div className="container">
        {/* ====== VIEW: PERFIL (personal-first) ====== */}
        {view === VIEWS.PROFILE && (
          <div className="grid">
            <div className="card grid">
              <div className="chartTitleRow">
                <div>
                  <div className="kpiBig">{LABELS.views.profileTitle}</div>
                  <div className="kpiSmall">
                    {profileName(profileId)} · Mes: <b>{selectedMonth}</b>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div className="kpiBig">+${formatCLP(myIncomeTotal)}</div>
                  <div className="kpiSmall">Ingresos (tú)</div>
                  <div style={{ height: 6 }} />
                  <div className="kpiBig">-${formatCLP(myExpenseTotal)}</div>
                  <div className="kpiSmall">Gastos (tú)</div>
                </div>
              </div>

              {/* 3a) Primero: categorías de gastos del mes personal */}
              <div className="barsWrap">
                <div className="kpiSmall">Tus gastos por categoría · {selectedMonth}</div>
                {myTopExpenseCategories.length === 0 ? (
                  <div className="kpiSmall" style={{ marginTop: 10 }}>
                    Sin gastos registrados este mes.
                  </div>
                ) : (
                  <CategoryBars rows={myTopExpenseCategories} maxValue={myMaxCat} formatValue={(v) => `$${formatCLP(v)}`} />
                )}
              </div>

              {/* Resumen neto */}
              <div className="card">
                <div className="kpiBig">Neto del mes (tú)</div>
                <div className="meta" style={{ marginTop: 6 }}>
                  {myNetLabel}
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  (Ingresos - Gastos)
                </div>
              </div>

              {/* 3b) Presupuesto por % del sueldo (porcentajes de ejemplo) */}
              <div className="card">
                <div className="kpiBig">Presupuesto por categoría (porcentaje de ejemplo)</div>
                <div className="meta" style={{ marginTop: 6 }}>
                  Los % son temporales. La meta se calcula automáticamente: <b>ingreso del mes × %</b>.
                </div>

                {myIncomeTotal <= 0 ? (
                  <div className="kpiSmall" style={{ marginTop: 10 }}>
                    No hay ingresos registrados este mes para calcular porcentajes.
                  </div>
                ) : (
                  <div className="budgetList" style={{ marginTop: 10 }}>
                    {myBudgetRows.map((r) => {
                      const diffText =
                        r.diff >= 0
                          ? `Falta: $${formatCLP(r.diff)}`
                          : `Te pasaste: $${formatCLP(Math.abs(r.diff))}`;
                      return (
                        <div className="budgetRow" key={r.category}>
                          <div className="budgetCat" title={r.category}>
                            {r.category} <span className="meta">({Math.round(r.pct * 100)}%)</span>
                          </div>
                          <div className="budgetNums">
                            <div className="meta">
                              Gastado: <b>${formatCLP(r.actual)}</b>
                            </div>
                            <div className="meta">
                              Meta: <b>${formatCLP(r.target)}</b>
                            </div>
                          </div>
                          <div className={`budgetDiff ${r.diff < 0 ? "isOver" : "isOk"}`}>{diffText}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3f) Deudas / aportes del pasado (placeholder basado en historial) */}
              <div className="card">
                <div className="kpiBig">Deudas / aportes del pasado</div>
                <div className="meta" style={{ marginTop: 6 }}>
                  Placeholder (lo configuraremos mejor después). Por ahora: neto acumulado antes de {selectedMonth}.
                </div>
                <div className="meta" style={{ marginTop: 10 }}>
                  Neto histórico: <b>{pastNetLabel}</b>
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  Movimientos anteriores: {pastNet.count} · Ingresos: +${formatCLP(pastNet.income)} · Gastos: -$
                  {formatCLP(pastNet.expense)}
                </div>
              </div>

              <div className="meta">
                Tip: en el menú (☰) puedes ir a <b>Meses pasados</b> para ver este mismo análisis en otros meses.
              </div>
            </div>
          </div>
        )}

        {/* ====== VIEW: MONTHS ====== */}
        {view === VIEWS.MONTHS && (
          <div className="grid">
            <div className="card">
              <div className="kpiBig">{LABELS.views.monthsTitle}</div>
              <div className="meta">
                Elige un mes para ver el análisis personal de <b>{profileName(profileId)}</b>.
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                (Puedes cambiar el perfil “actual” desde Debug.)
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

            <div className="card">
              <button className="secondaryBtn" onClick={() => go(VIEWS.PROFILE)}>
                {LABELS.buttons.back}
              </button>
            </div>
          </div>
        )}

        {/* ====== VIEW: ADD ====== */}
        {view === VIEWS.ADD && (
          <div className="grid">
            <div className="card grid">
              <div className="kpiBig">{addTitle}</div>

              {/* Por defecto: Gasto (y fecha hoy se setea al abrir) */}
              <div className="segmented" role="tablist" aria-label="Tipo de movimiento">
                <button
                  type="button"
                  role="tab"
                  aria-selected={entryType === ENTRY_TYPES.EXPENSE}
                  className={`segBtn ${entryType === ENTRY_TYPES.EXPENSE ? "isActive" : ""}`}
                  onClick={() => setEntryType(ENTRY_TYPES.EXPENSE)}
                >
                  💸 Gasto
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={entryType === ENTRY_TYPES.INCOME}
                  className={`segBtn ${entryType === ENTRY_TYPES.INCOME ? "isActive" : ""}`}
                  onClick={() => setEntryType(ENTRY_TYPES.INCOME)}
                >
                  ✨ Ingreso
                </button>
              </div>

              <div className="meta">
                Se guardará en el perfil: <b>{profileName(profileId)}</b> (cambia en Debug).
              </div>

              <form onSubmit={addEntry} className="formGrid" style={{ marginTop: 10 }}>
                <label className="label span2">
                  Monto (CLP) *
                  <input
                    className="input"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Ej: 12000"
                  />
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
                  <button className="primary" type="submit">
                    {addButtonLabel}
                  </button>
                  <div className="small" style={{ marginTop: 8 }}>
                    {UX.noteLocalOnly}
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ====== VIEW: HISTORY ====== */}
        {view === VIEWS.HISTORY && (
          <div className="grid">
            <div className="card">
              <div className="kpiBig">{LABELS.views.historyTitle}</div>
              <div className="meta">Lista textual de gastos e ingresos.</div>
            </div>

            {entries.length === 0 ? (
              <div className="card">No hay movimientos todavía.</div>
            ) : (
              entries.map((e) => (
                <div key={e.id} className="rowCard">
                  <div className="rowTop">
                    <div className="money">{signedMoney(e)}</div>
                    <div className="meta">{e.date}</div>
                  </div>

                  <div className="meta">
                    {e.type === ENTRY_TYPES.INCOME ? "Ingreso" : "Gasto"} · {e.category} · perfil:{" "}
                    {profileName(e.profile)}
                  </div>

                  {e.note ? <div className="meta">{e.note}</div> : null}

                  <div>
                    <button className="danger" onClick={() => removeEntry(e.id)}>
                      {LABELS.buttons.delete}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ====== VIEW: DEBUG ====== */}
        {view === VIEWS.DEBUG && (
          <div className="grid">
            <div className="card">
              <div className="money">{LABELS.views.debugTitle}</div>
              <div className="meta">Cambiar perfil actual + ver JSON crudo.</div>

              <div style={{ marginTop: 12 }}>
                <div className="kpiSmall">Perfil actual (para agregar + ver perfil)</div>
                <select className="select" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  {PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <div className="small" style={{ marginTop: 8 }}>
                  El análisis de Perfil y los nuevos movimientos se asignarán a: <b>{profileName(profileId)}</b>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="kpiBig">JSON crudo</div>
              <textarea className="monoArea" value={rawJSON} readOnly />

              <div className="adminActions">
                <button className="secondaryBtn" onClick={() => copyToClipboard(rawJSON)}>
                  {LABELS.buttons.copyJson}
                </button>

                <button
                  className="secondaryBtn"
                  onClick={() => jsonFileRef.current?.click()}
                  type="button"
                >
                  {LABELS.buttons.loadJson}
                </button>
                <input
                  ref={jsonFileRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={handleLoadJsonFile}
                />

                <button className="secondaryBtn" onClick={reloadFromStorage}>
                  {LABELS.buttons.reload}
                </button>
                <button className="danger" onClick={clearAll}>
                  {LABELS.buttons.clearAll}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====== BOTTOM NAV ====== */}
      <div className="bottomNav" ref={menuRef}>
        {menuOpen && (
          <div className="navMenuBox" role="menu" aria-label="Opciones">
            <button className="navMenuItem" onClick={() => go(VIEWS.MONTHS)} role="menuitem">
              {LABELS.menu.months}
            </button>
            <button className="navMenuItem" onClick={() => go(VIEWS.HISTORY)} role="menuitem">
              {LABELS.menu.history}
            </button>
            <button className="navMenuItem" onClick={() => go(VIEWS.DEBUG)} role="menuitem">
              {LABELS.menu.debug}
            </button>
            <button
              className="navMenuItem"
              onClick={() => {
                toggleTheme();
                setMenuOpen(false);
              }}
              role="menuitem"
            >
              Cambiar tema ({theme === "light" ? "🌙" : "☀️"})
            </button>
          </div>
        )}

        <div className="bottomNavInner">
          <button
            className="navBtn"
            onClick={() => setMenuOpen((s) => !s)}
            aria-label={LABELS.bottomNav.menu}
            aria-expanded={menuOpen}
          >
            ☰
          </button>

          <button className="navBtn navBtnPrimary" onClick={openAdd} aria-label={LABELS.bottomNav.add}>
            +
          </button>

          <button
            className={`navBtn ${view === VIEWS.PROFILE ? "isActive" : ""}`}
            onClick={() => go(VIEWS.PROFILE)}
            aria-label={LABELS.bottomNav.profile}
          >
            👤
          </button>
        </div>
      </div>
    </>
  );
}
