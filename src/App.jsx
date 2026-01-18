import { useEffect, useMemo, useRef, useState } from "react";
import { getConfig, registerDeviceProfile, addEntry, deleteEntry, listEntries, listMonths, replaceAll } from "./api";


/* =========================================================
   1) CONFIG
   ========================================================= */
const VIEWS = {
  SETUP: "setup",
  PROFILE: "profile",
  ADD: "add",
  SAVINGS: "savings",
  FIXED: "fixed",
  HISTORY: "history",
  MONTHS: "months",
  DEBUG: "debug",
};


const ENTRY_TYPES = { EXPENSE: "expense", INCOME: "income" };

const PROFILES = [
  { id: "pablo", name: "Pablo" },
  { id: "maria_ignacia", name: "Maria Ignacia" },
];

const OPTIONS = {
  // fallback local si Config aún no carga
  categories: ["Comida", "Casa", "Personal", "Citas", "Locomoción", "Familia", "Salud", "Otros"],
  incomeCategories: ["Sueldo", "Transferencia", "Reembolso", "Regalo", "Venta", "Otros"],
};


// Preferencias locales (no son “la BD”; la BD es Google Sheets)
const STORAGE = {
  themeKey: "gp_theme_v1",
  profileKey: "gp_profile_v1",
  deviceIdKey: "gp_device_id_v1",
  adminKey: "gp_admin_v1",
};


function uid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

function loadDeviceId() {
  let id = localStorage.getItem(STORAGE.deviceIdKey);
  if (id && id.length >= 8) return id;
  id = uid();
  localStorage.setItem(STORAGE.deviceIdKey, id);
  return id;
}

function shortId(id) {
  const s = String(id || "");
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function loadAdmin() {
  return localStorage.getItem(STORAGE.adminKey) === "1";
}

function saveAdmin(v) {
  localStorage.setItem(STORAGE.adminKey, v ? "1" : "0");
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

  // No bloqueamos por catálogo local (la fuente real es Config en la nube).
  // Si viene vacío, usamos "Otros".
  const category = String(raw?.category || "").trim() || "Otros";

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

  const [view, setView] = useState(VIEWS.SETUP);


  // Preferencias locales
  // Preferencias locales
  const [theme, setTheme] = useState(loadTheme);

  // Identidad del dispositivo (local) + admin local (solo para debug)
  const [deviceId] = useState(loadDeviceId);
  const [adminUnlocked, setAdminUnlocked] = useState(loadAdmin);

  // Perfil efectivo (se “bloquea” por dispositivo cuando existe en la nube)
  const [profileId, setProfileId] = useState(loadProfile);
  const [profileLocked, setProfileLocked] = useState(false);

  // Nube
  const [allEntries, setAllEntries] = useState([]);
  const [monthsFromCloud, setMonthsFromCloud] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(false);   // fase rápida (config + perfil)
  const [syncing, setSyncing] = useState(false);   // fase pesada (months + entries)
  const [err, setErr] = useState("");
    const [lastSyncAt, setLastSyncAt] = useState("");

  // Config desde la nube (Google Sheets / Config)
  const [config, setConfigState] = useState(null);


  // Form (por defecto: gasto + fecha hoy)
  const [entryType, setEntryType] = useState(ENTRY_TYPES.EXPENSE);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(OPTIONS.categories[0]);
  const [date, setDate] = useState(today);
    const [note, setNote] = useState("");


  // Etiquetado (equidad / privacidad)
  // scope: personal|shared => define si se ve en ambos y si entra al cálculo de equidad
  // account: personal|balance => desde dónde se pagó (aportes indirectos)
  // impactKey: clave normalizada para balance compartido por categoría/objetivo
  const [scopeSel, setScopeSel] = useState("personal");
  const [accountSel, setAccountSel] = useState("personal");
  const [impactKeySel, setImpactKeySel] = useState("");

  // Ahorro (Objetivos)
  const [savingGoalId, setSavingGoalId] = useState("");
  const [savingDir, setSavingDir] = useState("in"); // in | out
  const [savingAmount, setSavingAmount] = useState("");
  const [savingNote, setSavingNote] = useState("");

  // Gastos fijos (Config.fixedItems)
  const [fixedDraft, setFixedDraft] = useState({
    id: "",
    name: "",
    category: "Casa",
    amount: "",
    scope: "shared",        // shared | personal
    appliesTo: "both",      // pablo | maria_ignacia | both
    account: "balance",     // balance | personal | goal:<id>
    impactKey: "Casa",
  });
  const [editingFixedId, setEditingFixedId] = useState("");



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
    saveAdmin(adminUnlocked);
  }, [adminUnlocked]);

  // (eliminado: ya lo hace quickSync() abajo)


  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    quickSync();
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

  // (Se elimina este bloque duplicado)

  // Asegurar categoría válida cuando cambia tipo / perfil / config
  function getExpenseCats_(cfg) {
    const v2 = cfg?.expenseCategoriesV2;
    const v1 = cfg?.expenseCategories;
    const list =
      Array.isArray(v2) && v2.length ? v2 :
      Array.isArray(v1) && v1.length ? v1 :
      OPTIONS.categories;

    // asegurar "Otros"
    return list.includes("Otros") ? list : [...list, "Otros"];
  }

  function getIncomeCats_(cfg, pid) {
    const byProfile = cfg?.incomeCategoriesByProfile?.[pid];
    const v1 = cfg?.incomeCategories;
    const list =
      Array.isArray(byProfile) && byProfile.length ? byProfile :
      Array.isArray(v1) && v1.length ? v1 :
      OPTIONS.incomeCategories;

    // asegurar "Otros"
    return list.includes("Otros") ? list : [...list, "Otros"];
  }

  // Asegurar categoría válida cuando cambia tipo/config/perfil
  useEffect(() => {
    const expenseCats = getExpenseCats_(config);
    const incomeCats = getIncomeCats_(config, profileId);
    const list = entryType === ENTRY_TYPES.INCOME ? incomeCats : expenseCats;
    if (!list.includes(category)) setCategory(list[0] || "Otros");
  }, [entryType, config, category, profileId]);

  /* ---------- Cloud ---------- */

  // 1) Bootstrap: solo config + decidir perfil/bloqueo (rápido)
  async function bootstrap() {
    setErr("");
    setBooting(true);
    try {
      const cfg = await getConfig();
      setConfigState(cfg);

      const assigned = cfg?.devices?.[deviceId];

      if (assigned && PROFILES.some((p) => p.id === assigned)) {
        setProfileId(assigned);
        setProfileLocked(true);
        setView((v) => (v === VIEWS.SETUP ? VIEWS.PROFILE : v));
      } else {
        setProfileLocked(false);
        setView((v) => (v === VIEWS.DEBUG ? v : VIEWS.SETUP));
      }

      setLastSyncAt(new Date().toISOString());
      return cfg;
    } catch (e) {
      setErr(e?.message || String(e));
      return null;
    } finally {
      setBooting(false);
    }
  }

  // 2) Full sync: months + entries (pesado)
  async function fullSync() {
    setErr("");
    setSyncing(true);
    try {
      const [ms, items] = await Promise.all([listMonths(), listEntries("")]);
      setMonthsFromCloud(ms);
      setAllEntries(items);

      const combined = new Set([currentMonth, ...ms]);
      if (!combined.has(selectedMonth)) setSelectedMonth(currentMonth);

      setLastSyncAt(new Date().toISOString());
      return true;
    } catch (e) {
      setErr(e?.message || String(e));
      return false;
    } finally {
      setSyncing(false);
    }
  }

  // Quick sync: NO espera fullSync (para que aparezca el perfil rápido)
  async function quickSync() {
    setLoading(true);
    try {
      const cfg = await bootstrap();
      if (cfg) fullSync(); // background
    } finally {
      setLoading(false);
    }
  }

  // Sync completo: SÍ espera fullSync (para botón "Sincronizar" o después de guardar)
  async function syncAll() {
    setLoading(true);
    try {
      const cfg = await bootstrap();
      if (cfg) await fullSync();
    } finally {
      setLoading(false);
    }
  }

    function go(to) {
    // Si el dispositivo no está asignado, no dejamos usar la app (salvo Setup/Debug)
    if (!profileLocked && to !== VIEWS.SETUP && to !== VIEWS.DEBUG) {
      setView(VIEWS.SETUP);
      setMenuOpen(false);
      return;
    }

    setView(to);
    setMenuOpen(false);

    if (to === VIEWS.ADD) {
      // defaults solicitados: gasto + hoy
      setEntryType(ENTRY_TYPES.EXPENSE);
      setDate(todayISODateLocal());
      setAmount("");
      setNote("");
      setCategory(getExpenseCats_(config)[0] || "Otros");

      // defaults de etiquetado (modelo nuevo)
      setScopeSel("personal");
      setAccountSel("personal");
      const firstImpact = (config?.sharedImpactKeys?.[0]) || "Casa";
      setImpactKeySel(firstImpact);
    }

    if (to === VIEWS.SAVINGS) {
      setSavingDir("in");
      setSavingAmount("");
      setSavingNote("");
      const goals = config?.goalsByProfile?.[profileId] || [];
      setSavingGoalId(goals?.[0]?.id || "");
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

  const myGoals = useMemo(() => {
    const list = config?.goalsByProfile?.[profileId];
    return Array.isArray(list) ? list : [];
  }, [config, profileId]);

  const fixedItems = useMemo(() => {
    const list = config?.fixedItems;
    return Array.isArray(list) ? list : [];
  }, [config]);

  async function setConfigCloud(nextConfig) {
    await setConfig(nextConfig); // api.js: POST setConfig
    const fresh = await getConfig();
    setConfigState(fresh);
  }

  function impactKeyForGoal_(goal) {
    if (!goal || goal.scope !== "shared") return "";
    // alineado a tu config.sharedImpactKeys
    if (goal.id === "vacaciones") return "Vacaciones";
    if (goal.id === "delosdos") return "DeLosDos";
    // fallback razonable
    return String(goal.name || "");
  }

  async function refreshAll() {
    // ya tenemos config, así que solo refrescamos data pesada
    await fullSync();
  }

  const goalStats = useMemo(() => {

    const byId = new Map();

    for (const g of myGoals) {
      byId.set(g.id, {
        id: g.id,
        name: g.name,
        scope: g.scope,
        monthIn: 0,
        monthOut: 0,
        allIn: 0,
        allOut: 0,
      });
    }

    for (const e of allEntries) {
      // Privacidad: solo movimientos propios o compartidos
      if (e.profile !== profileId && String(e?.scope || "") !== "shared") continue;
      if (String(e?.nature || "") !== "saving") continue;

      const acc = String(e?.account || "");
      if (!acc.startsWith("goal:")) continue;

      const goalId = acc.slice("goal:".length);
      const st = byId.get(goalId);
      if (!st) continue;

      const amt = Number(e?.amount || 0);
      if (!Number.isFinite(amt) || amt <= 0) continue;

      const dir = String(e?.direction || "");
      const isIn = dir === "in" || e.type === "income";
      const isOut = dir === "out" || e.type === "expense";

      if (isIn) st.allIn += amt;
      if (isOut) st.allOut += amt;

      if (monthKeyFromISODate(e.date) === selectedMonth) {
        if (isIn) st.monthIn += amt;
        if (isOut) st.monthOut += amt;
      }
    }

    return [...byId.values()].map((s) => ({
      ...s,
      monthBalance: s.monthIn - s.monthOut,
      allBalance: s.allIn - s.allOut,
    }));
  }, [allEntries, myGoals, selectedMonth]);

  async function onSubmitSaving(ev) {
    ev.preventDefault();

    const goal = myGoals.find((g) => g.id === savingGoalId);
    if (!goal) return alert("Selecciona un objetivo.");

    const amt = parseAmount(savingAmount);
    if (!amt) return alert("Monto inválido.");

    const dir = savingDir === "out" ? "out" : "in";
    const type = dir === "in" ? ENTRY_TYPES.INCOME : ENTRY_TYPES.EXPENSE;

    const entry = {
      id: uid(),
      type,
      amount: amt,
      category: String(goal.name || "Ahorro"),
      profile: profileId,
      date: todayISODateLocal(),
      note: String(savingNote || "").trim(),
      split: null,
      createdAt: new Date().toISOString(),

      // NUEVO: esquema extendido
      nature: "saving",
      scope: goal.scope === "shared" ? "shared" : "personal",
      account: `goal:${goal.id}`,
      direction: dir,
      impactKey: impactKeyForGoal_(goal) || "",
      fixedId: "",
      meta: "",
    };

    setLoading(true);
    setErr("");
    try {
      await addEntry(debit);
      await addEntry(credit);
      await refreshAll();
      go(VIEWS.SAVINGS);
      setSavingAmount("");
      setSavingNote("");
    } catch (e) {
      setErr(e?.message || String(e));
      alert("Error guardando ahorro: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  function resetFixedDraft_() {
    setFixedDraft({
      id: "",
      name: "",
      category: "Casa",
      amount: "",
      scope: "shared",
      appliesTo: "both",
      account: "balance",
      impactKey: "Casa",
    });
    setEditingFixedId("");
  }

  async function onSaveFixedItem(ev) {
    ev.preventDefault();

    const id = String(fixedDraft.id || "").trim() || `fx_${uid().slice(0, 8)}`;
    const name = String(fixedDraft.name || "").trim();
    if (!name) return alert("Falta Descripción.");

    const amount = parseAmount(fixedDraft.amount);
    if (!amount) return alert("Monto inválido.");

    const category = String(fixedDraft.category || "Casa").trim() || "Casa";
    const scope = fixedDraft.scope === "personal" ? "personal" : "shared";
    const appliesTo = ["pablo", "maria_ignacia", "both"].includes(fixedDraft.appliesTo) ? fixedDraft.appliesTo : "both";
    const account = String(fixedDraft.account || "balance").trim() || "balance";
    const impactKey = scope === "shared" ? String(fixedDraft.impactKey || "").trim() : "";

    const next = {
      ...(config || {}),
      fixedItems: (Array.isArray(config?.fixedItems) ? config.fixedItems : []).filter((x) => String(x?.id) !== String(id)).concat([{
        id,
        name,
        category,
        amount,
        scope,
        appliesTo,
        account,
        impactKey,
      }]),
    };

    setLoading(true);
    try {
      await setConfigCloud(next);
      resetFixedDraft_();
      alert("Gasto fijo guardado.");
    } catch (e) {
      alert("Error guardando gasto fijo: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  function onEditFixedItem(item) {
    setEditingFixedId(String(item.id || ""));
    setFixedDraft({
      id: String(item.id || ""),
      name: String(item.name || ""),
      category: String(item.category || "Casa"),
      amount: String(item.amount || ""),
      scope: item.scope === "personal" ? "personal" : "shared",
      appliesTo: item.appliesTo || "both",
      account: String(item.account || "balance"),
      impactKey: String(item.impactKey || "Casa"),
    });
  }

  async function onDeleteFixedItem(id) {
    if (!confirm("¿Eliminar este gasto fijo?")) return;

    const next = {
      ...(config || {}),
      fixedItems: (Array.isArray(config?.fixedItems) ? config.fixedItems : []).filter((x) => String(x?.id) !== String(id)),
    };

    setLoading(true);
    try {
      await setConfigCloud(next);
      if (editingFixedId === id) resetFixedDraft_();
    } catch (e) {
      alert("Error eliminando gasto fijo: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  function entryKey_(e) {
    const scope = String(e?.scope || "") === "shared" ? "shared" : "personal";
    const p = scope === "shared" ? "*" : String(e?.profile || "");
    return `${p}|${e.date}|${e.fixedId}|${e.amount}|${e.category}|${e.nature}|${e.account}|${e.direction}`;
  }

  async function onGenerateFixedForMonth() {
    if (!selectedMonth) return;

    const month = selectedMonth;
    const targets = fixedItems || [];
    if (!targets.length) return alert("No hay gastos fijos configurados.");

    // evitar duplicados por fixedId + month (usamos meta.month)
    const existing = allEntries.filter((e) => String(e.fixedId || "") && (e.date || "").slice(0, 7) === month);
    const existingSet = new Set(existing.map(entryKey_));

    const today = todayISODateLocal();
    const date = `${month}-01`;

    const created = [];

    for (const fx of targets) {
      const applies = String(fx.appliesTo || "both");
      const scope = fx.scope === "personal" ? "personal" : "shared";

      // Para shared: una sola fila en Entries (se muestra en ambos por scope)
      // Para personal: respeta appliesTo (pablo/maria_ignacia/both)
      const profiles = scope === "shared"
        ? [(applies === "maria_ignacia") ? "maria_ignacia" : "pablo"]
        : (applies === "both" ? ["pablo", "maria_ignacia"] : [applies]);

      for (const pid of profiles) {
        const impactKey = scope === "shared" ? String(fx.impactKey || fx.category || "") : "";

        const entry = {
          id: uid(),
          type: ENTRY_TYPES.EXPENSE,
          amount: Number(fx.amount || 0),
          category: String(fx.category || "Casa"),
          profile: pid,
          date,
          note: `Gasto fijo: ${fx.name}`,
          split: null,
          createdAt: new Date().toISOString(),

          nature: "fixed",
          scope,
          account: String(fx.account || "balance"),
          direction: "out",
          impactKey,
          fixedId: String(fx.id || ""),
          meta: JSON.stringify({ month }),
        };

        if (!entry.amount || entry.amount <= 0) continue;

        const k = entryKey_(entry);
        if (existingSet.has(k)) continue;

        created.push(entry);
        existingSet.add(k);
      }
    }

    if (!created.length) return alert("No hay cargos nuevos para generar (ya estaban).");

    setLoading(true);
    try {
      for (const e of created) {
        await addEntry(e);
      }
      await syncAll();
      alert(`Generados: ${created.length} cargos fijos para ${month}.`);
    } catch (e) {
      alert("Error generando cargos: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function onMoveGoalToBalance(goalId) {
    const goal = myGoals.find((g) => g.id === goalId);
    if (!goal) return;

    const amt = parseAmount(prompt(`¿Cuánto mover desde "${goal.name}" a Balance General? (CLP)`));
    if (!amt) return;

    // Si el objetivo es personal, preguntamos si el movimiento debe considerarse compartido.
    // (Esto afecta la privacidad y el cálculo de equidad.)
    const creditScope = goal.scope === "shared"
      ? "shared"
      : (confirm("¿Este movimiento debe entrar al balance compartido (De los dos)?") ? "shared" : "personal");

    const now = new Date().toISOString();
    const today = todayISODateLocal();

    // 1) Débito desde el objetivo (mantiene el flujo interno del objetivo)
    const debit = {
      id: uid(),
      type: ENTRY_TYPES.EXPENSE,
      amount: amt,
      category: String(goal.name || "Ahorro"),
      profile: profileId,
      date: today,
      note: "Mover a Balance General (salida desde objetivo)",
      split: null,
      createdAt: now,

      nature: "saving",
      scope: goal.scope === "shared" ? "shared" : "personal",
      account: `goal:${goal.id}`,
      direction: "out",
      impactKey: (goal.scope === "shared") ? (impactKeyForGoal_(goal) || "") : "",
      fixedId: "",
      meta: JSON.stringify({ moveTo: "balance", kind: "debit" }),
    };

    // 2) Crédito al Balance General (solo si corresponde)
    // - Mantiene nature="saving" para no inflar ingresos
    // - scope compartido => visible en ambos y entra al cálculo de equidad
    const credit = {
      id: uid(),
      type: ENTRY_TYPES.INCOME,
      amount: amt,
      category: String(goal.name || "Ahorro"),
      profile: profileId,
      date: today,
      note: "Mover a Balance General (entrada a balance)",
      split: null,
      createdAt: now,

      nature: "saving",
      scope: creditScope,
      account: "balance",
      direction: "in",
      impactKey: creditScope === "shared" ? (impactKeyForGoal_(goal) || "") : "",
      fixedId: "",
      meta: JSON.stringify({ moveTo: "balance", kind: "credit" }),
    };

    setLoading(true);
    setErr("");
    try {
      await addEntry(debit);
      await addEntry(credit);
      await refreshAll();
      go(VIEWS.SAVINGS);
    } catch (e) {
      setErr(e?.message || String(e));
      alert("Error moviendo a balance: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  const myEntriesMonth = useMemo(
    () => entriesMonth.filter((e) => e.profile === profileId || String(e?.scope || "") === "shared"),
    [entriesMonth, profileId]
  );

  const myExpensesMonth = useMemo(
    () =>
      myEntriesMonth.filter((e) => {
        // mantener compatibilidad con legacy: si no hay nature, usar type
        const nature = String(e?.nature || "");
        if (nature) return nature === "expense" || nature === "fixed";
        return e.type === ENTRY_TYPES.EXPENSE;
      }),
    [myEntriesMonth]
  );

  const myIncomesMonth = useMemo(
    () =>
      myEntriesMonth.filter((e) => {
        const nature = String(e?.nature || "");
        if (nature) return nature === "income";
        return e.type === ENTRY_TYPES.INCOME;
      }),
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
    // Presupuestos desde la nube (config.budgets) en % 0..100 => fracción 0..1
  const budgetPercents = useMemo(() => {
    const fromCloud = config?.budgets?.[profileId];
    if (fromCloud && typeof fromCloud === "object") {
      const out = {};
      for (const k of Object.keys(fromCloud)) {
        const v = Number(fromCloud[k]);
        if (Number.isFinite(v) && v >= 0) out[k] = v / 100;
      }
      return out;
    }

    // fallback (por si config aún no llega)
    if (profileId === "pablo") return { Casa: 0.35, Comida: 0.18, Transporte: 0.08, Panorama: 0.05, Salud: 0.03, Otros: 0.06 };
    return { Casa: 0.30, Comida: 0.20, Transporte: 0.08, Panorama: 0.06, Salud: 0.03, Otros: 0.06 };
  }, [profileId, config]);


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
      const isShared = String(e?.scope || "") === "shared";
      if (e.profile !== profileId && !isShared) continue;

      const m = monthKeyFromISODate(e.date);
      if (!out.has(m)) out.set(m, { income: 0, expense: 0 });
      const bucket = out.get(m);

      const nature = String(e?.nature || "");
      if (nature) {
        if (nature === "income") bucket.income += Number(e.amount || 0);
        else if (nature === "expense" || nature === "fixed") bucket.expense += Number(e.amount || 0);
        // saving no entra en income/expense de snapshot
      } else {
        if (e.type === ENTRY_TYPES.INCOME) bucket.income += Number(e.amount || 0);
        else bucket.expense += Number(e.amount || 0);
      }
    }
    return out;
  }, [allEntries, profileId, availableMonths]);

  /* ---------- Historial ---------- */
  const allSorted = useMemo(() => {
    const copy = allEntries.filter((e) => e.profile === profileId || String(e?.scope || "") === "shared");
    copy.sort(
      (a, b) =>
        (b.date || "").localeCompare(a.date || "") ||
        (b.createdAt || "").localeCompare(a.createdAt || "")
    );
    return copy;
  }, [allEntries, profileId]);

  /* ---------- Actions ---------- */
  async function onSubmit(e) {
    e.preventDefault();
    const n = parseAmount(amount);
    if (n === null) return alert("Monto inválido (>0).");

    const validCats = entryType === ENTRY_TYPES.INCOME
      ? getIncomeCats_(config, profileId)
      : getExpenseCats_(config);

    if (!validCats.includes(category)) return alert("Categoría inválida.");



    const scope = scopeSel === "shared" ? "shared" : "personal";
    const account = String(accountSel || (entryType === ENTRY_TYPES.INCOME ? "personal" : "personal"));
    const direction = entryType === ENTRY_TYPES.INCOME ? "in" : "out";
    const nature = entryType === ENTRY_TYPES.INCOME ? "income" : "expense";

    // Regla: si es compartido, debe tener impactKey
    const impactKey = scope === "shared" ? String(impactKeySel || "").trim() : "";
    if (scope === "shared" && !impactKey) return alert("Falta Impacto (impactKey) para movimiento compartido.");

    const entry = {
      id: uid(),
      type: entryType,
      amount: n,
      category,
      profile: profileId,
      date,
      note: note.trim(),
      split: null, // el modelo nuevo no depende de split
      createdAt: new Date().toISOString(),

      // Nuevo etiquetado
      nature,
      scope,
      account,
      direction,
      impactKey,
      fixedId: "",
      meta: "",
    };

    setLoading(true);
    setErr("");
    try {
      await addEntry(entry);
      await syncAll();
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
      await syncAll();
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
      await syncAll();
      alert("Nube reemplazada ✅");
      go(VIEWS.PROFILE);
    } catch (e) {
      setErr(e?.message || String(e));
      alert("Error importando: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  const expenseCats = getExpenseCats_(config);
  const incomeCats = getIncomeCats_(config, profileId);
  const catList = entryType === ENTRY_TYPES.INCOME ? incomeCats : expenseCats;




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
                Mes: <b>{selectedMonth}</b> · Perfil: <b>{profileLocked ? profileName(profileId) : "Sin asignar"}</b>{profileLocked ? " 🔒" : ""} · Dispositivo: <b>{shortId(deviceId)}</b> · Tema: <b>{theme}</b>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <button className="secondaryBtn" onClick={syncAll} disabled={loading}>
                {loading ? "Sincronizando..." : "Sincronizar"}
              </button>
              <div className="small" style={{ marginTop: 6 }}>
                {err ? `Error: ${err}` : lastSyncAt ? `Última sync: ${new Date(lastSyncAt).toLocaleString()}` : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* SETUP (primer uso por dispositivo) */}
        {view === VIEWS.SETUP && (
          <div className="grid">
            <div className="card grid">
              <div className="kpiBig">Configurar este celular</div>
              <div className="meta" style={{ marginTop: 6 }}>
                Este dispositivo aún no tiene perfil asignado en la nube.
              </div>
              <div className="small" style={{ marginTop: 8 }}>
                DeviceId:{" "}
                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {shortId(deviceId)}
                </span>
              </div>

              <div className="adminActions" style={{ marginTop: 14 }}>
                <button
                  className="primary"
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await registerDeviceProfile({ deviceId, profile: "pablo" });
                      await syncAll();
                    } catch (e) {
                      alert("Error asignando dispositivo: " + (e?.message || String(e)));
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Soy Pablo
                </button>

                <button
                  className="primary"
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await registerDeviceProfile({ deviceId, profile: "maria_ignacia" });
                      await syncAll();
                    } catch (e) {
                      alert("Error asignando dispositivo: " + (e?.message || String(e)));
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Soy Maria Ignacia
                </button>

                <button className="secondaryBtn" type="button" onClick={bootstrap} disabled={booting}>
                  {booting ? "..." : "Reintentar (rápido)"}
                </button>

                <button className="secondaryBtn" type="button" onClick={() => go(VIEWS.DEBUG)}>
                  Debug
                </button>
              </div>

              <div className="small" style={{ marginTop: 10 }}>
                Una vez asignado, el perfil queda bloqueado (solo admin puede cambiarlo desde Debug).
              </div>
            </div>
          </div>
        )}

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
                {scopeSel === "shared" ? <span> · Visible en ambos (Compartido)</span> : <span> · Solo tú (Personal)</span>}
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

                <label className="label">
                  Alcance
                  <select className="select" value={scopeSel} onChange={(e) => setScopeSel(e.target.value)}>
                    <option value="personal">Personal</option>
                    <option value="shared">Compartido (De los dos)</option>
                  </select>
                </label>

                <label className="label">
                  Desde
                  <select className="select" value={accountSel} onChange={(e) => setAccountSel(e.target.value)}>
                    <option value="personal">Personal</option>
                    <option value="balance">Balance general</option>
                  </select>
                </label>

                {scopeSel === "shared" && (
                  <label className="label span2">
                    Impacto (impactKey)
                    <select className="select" value={impactKeySel} onChange={(e) => setImpactKeySel(e.target.value)}>
                      {(config?.sharedImpactKeys || ["Casa", "Familia", "Salud", "Vacaciones", "DeLosDos"]).map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

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

        {/* SAVINGS */}
        {view === VIEWS.SAVINGS && (
          <div className="grid">
            <div className="card">
              <div className="kpiBig">Ahorro (Objetivos)</div>
              <div className="meta">
                Perfil: <b>{profileName(profileId)}</b> · Mes: <b>{selectedMonth}</b>
              </div>
            </div>

            {myGoals.length === 0 ? (
              <div className="card">No hay objetivos configurados para este perfil.</div>
            ) : (
              <>
                <div className="card grid">
                  <div className="kpiBig">Registrar movimiento</div>

                  <form onSubmit={onSubmitSaving} className="formGrid" style={{ marginTop: 10 }}>
                    <label className="label span2">
                      Objetivo
                      <select className="select" value={savingGoalId} onChange={(e) => setSavingGoalId(e.target.value)}>
                        {myGoals.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} {g.scope === "shared" ? "· (Compartido)" : "· (Personal)"}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="label">
                      Tipo
                      <select className="select" value={savingDir} onChange={(e) => setSavingDir(e.target.value)}>
                        <option value="in">Aportar (+)</option>
                        <option value="out">Gastar (-)</option>
                      </select>
                    </label>

                    <label className="label">
                      Monto (CLP) *
                      <input className="input" inputMode="numeric" value={savingAmount} onChange={(e) => setSavingAmount(e.target.value)} />
                    </label>

                    <label className="label span2">
                      Nota (opcional)
                      <input className="input" value={savingNote} onChange={(e) => setSavingNote(e.target.value)} />
                    </label>

                    <div className="span2">
                      <button className="primary" type="submit" disabled={loading}>
                        {loading ? "Guardando..." : "Guardar"}
                      </button>
                    </div>
                  </form>
                </div>

                {goalStats.map((g) => (
                  <div key={g.id} className="rowCard">
                    <div className="rowTop">
                      <div className="money">{g.name} {g.scope === "shared" ? "🤝" : "👤"}</div>
                      <div className="meta">Saldo total: <b>${formatCLP(g.allBalance)}</b></div>
                    </div>

                    <div className="meta">
                      Mes: +${formatCLP(g.monthIn)} · -${formatCLP(g.monthOut)} · Saldo mes: <b>${formatCLP(g.monthBalance)}</b>
                    </div>

                    <div className="meta">
                      Total: +${formatCLP(g.allIn)} · -${formatCLP(g.allOut)}
                    </div>

                    <button className="secondaryBtn" type="button" onClick={() => onMoveGoalToBalance(g.id)} disabled={loading}>
                      Mover a Balance General
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* FIXED */}
        {view === VIEWS.FIXED && (
          <div className="grid">
            <div className="card">
              <div className="kpiBig">Gastos fijos</div>
              <div className="meta">
                Se guardan en <b>Config.fixedItems</b> (nube). Mes actual: <b>{selectedMonth}</b>
              </div>
              <button className="secondaryBtn" onClick={onGenerateFixedForMonth} disabled={loading}>
                Generar cargos del mes
              </button>
            </div>

            <div className="card grid">
              <div className="kpiBig">{editingFixedId ? "Editar gasto fijo" : "Nuevo gasto fijo"}</div>

              <form onSubmit={onSaveFixedItem} className="formGrid" style={{ marginTop: 10 }}>
                <label className="label span2">
                  ID (opcional)
                  <input className="input" value={fixedDraft.id} onChange={(e) => setFixedDraft((d) => ({ ...d, id: e.target.value }))} />
                </label>

                <label className="label span2">
                  Descripción *
                  <input className="input" value={fixedDraft.name} onChange={(e) => setFixedDraft((d) => ({ ...d, name: e.target.value }))} />
                </label>

                <label className="label">
                  Categoría
                  <select className="select" value={fixedDraft.category} onChange={(e) => setFixedDraft((d) => ({ ...d, category: e.target.value }))}>
                    {getExpenseCats_(config).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>

                <label className="label">
                  Monto (CLP) *
                  <input className="input" inputMode="numeric" value={fixedDraft.amount} onChange={(e) => setFixedDraft((d) => ({ ...d, amount: e.target.value }))} />
                </label>

                <label className="label">
                  Alcance
                  <select className="select" value={fixedDraft.scope} onChange={(e) => setFixedDraft((d) => ({ ...d, scope: e.target.value }))}>
                    <option value="shared">Compartido</option>
                    <option value="personal">Personal</option>
                  </select>
                </label>

                <label className="label">
                  A quién aplica
                  <select className="select" value={fixedDraft.appliesTo} onChange={(e) => setFixedDraft((d) => ({ ...d, appliesTo: e.target.value }))}>
                    <option value="both">Ambos</option>
                    <option value="pablo">Pablo</option>
                    <option value="maria_ignacia">María Ignacia</option>
                  </select>
                </label>

                <label className="label">
                  Cuenta
                  <select className="select" value={fixedDraft.account} onChange={(e) => setFixedDraft((d) => ({ ...d, account: e.target.value }))}>
                    <option value="balance">Balance General</option>
                    <option value="personal">Personal</option>
                    {myGoals.map((g) => (
                      <option key={g.id} value={`goal:${g.id}`}>{`goal:${g.id}`}</option>
                    ))}
                  </select>
                </label>

                <label className="label">
                  ImpactKey (si compartido)
                  <select className="select" value={fixedDraft.impactKey} onChange={(e) => setFixedDraft((d) => ({ ...d, impactKey: e.target.value }))}>
                    {(config?.sharedImpactKeys || ["Casa","Familia","Salud","Vacaciones","DeLosDos"]).map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </label>

                <div className="span2" style={{ display: "flex", gap: 8 }}>
                  <button className="primary" type="submit" disabled={loading}>
                    {loading ? "Guardando..." : "Guardar"}
                  </button>
                  <button className="secondaryBtn" type="button" onClick={() => resetFixedDraft_()} disabled={loading}>
                    Limpiar
                  </button>
                </div>
              </form>
            </div>

            <div className="card">
              <div className="kpiBig">Listado</div>
              {fixedItems.length === 0 ? (
                <div className="meta">No hay gastos fijos aún.</div>
              ) : (
                fixedItems.map((fx) => (
                  <div key={fx.id} className="rowCard">
                    <div className="rowTop">
                      <div className="money">{fx.name}</div>
                      <div className="meta">${formatCLP(fx.amount)} · {fx.category}</div>
                    </div>
                    <div className="meta">
                      id: <b>{fx.id}</b> · scope: {fx.scope} · appliesTo: {fx.appliesTo} · account: {fx.account} · impactKey: {fx.impactKey || "-"}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="secondaryBtn" onClick={() => onEditFixedItem(fx)} disabled={loading}>Editar</button>
                      <button className="dangerBtn" onClick={() => onDeleteFixedItem(fx.id)} disabled={loading}>Eliminar</button>
                    </div>
                  </div>
                ))
              )}
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
                    {String(e?.nature || "") === "saving"
                      ? `Ahorro · ${e.category} · ${profileName(e.profile)}`
                      : `${e.type === "income" ? "Ingreso" : "Gasto"} · ${e.category} · ${profileName(e.profile)}`}
                    {String(e?.account || "").startsWith("goal:") ? ` · ${String(e.account)}` : ""}
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
              <div className="meta">Admin local + herramientas (import/export).</div>

              <div style={{ marginTop: 12 }}>
                <div className="kpiSmall">Dispositivo</div>
                <div className="meta" style={{ marginTop: 4 }}>
                  DeviceId:{" "}
                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {shortId(deviceId)}
                  </span>
                </div>
                <div className="meta" style={{ marginTop: 4 }}>
                  Perfil nube: <b>{profileLocked ? profileName(profileId) : "No asignado"}</b>
                  {profileLocked ? " (bloqueado)" : ""}
                </div>
              </div>

              <div className="adminActions" style={{ marginTop: 12 }}>
                {!adminUnlocked ? (
                  <button
                    className="secondaryBtn"
                    type="button"
                    onClick={() => {
                      if (confirm("¿Desbloquear modo admin en ESTE dispositivo?")) setAdminUnlocked(true);
                    }}
                  >
                    Desbloquear admin (este dispositivo)
                  </button>
                ) : (
                  <button className="secondaryBtn" type="button" onClick={() => setAdminUnlocked(false)}>
                    Bloquear admin
                  </button>
                )}
              </div>

              {adminUnlocked && (
                <div style={{ marginTop: 12 }}>
                  <div className="kpiSmall">Reasignar perfil del dispositivo (escribe en la nube)</div>
                  <div className="adminActions" style={{ marginTop: 8 }}>
                    <button
                      className="danger"
                      type="button"
                      disabled={loading}
                      onClick={async () => {
                        if (!confirm("Esto cambiará el perfil asignado a este dispositivo en la nube. ¿Continuar?")) return;
                        try {
                          setLoading(true);
                          await registerDeviceProfile({ deviceId, profile: "pablo" });
                          await syncAll();
                          alert("Reasignado a Pablo ✅");
                        } catch (e) {
                          alert("Error reasignando: " + (e?.message || String(e)));
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Asignar a Pablo
                    </button>

                    <button
                      className="danger"
                      type="button"
                      disabled={loading}
                      onClick={async () => {
                        if (!confirm("Esto cambiará el perfil asignado a este dispositivo en la nube. ¿Continuar?")) return;
                        try {
                          setLoading(true);
                          await registerDeviceProfile({ deviceId, profile: "maria_ignacia" });
                          await syncAll();
                          alert("Reasignado a Maria Ignacia ✅");
                        } catch (e) {
                          alert("Error reasignando: " + (e?.message || String(e)));
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Asignar a Maria Ignacia
                    </button>
                  </div>
                </div>
              )}

              <div className="adminActions" style={{ marginTop: 12 }}>
                <button className="secondaryBtn" onClick={() => copyToClipboard(JSON.stringify(allEntries, null, 2))}>
                  Copiar JSON
                </button>
                <button className="secondaryBtn" onClick={syncAll} disabled={loading || booting || syncing}>
                  {loading || booting || syncing ? "..." : "Recargar nube"}
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
            <button className="navMenuItem" onClick={() => go(VIEWS.SAVINGS)} role="menuitem">
              Ahorro (Objetivos)
            </button>
            <button className="navMenuItem" onClick={() => go(VIEWS.FIXED)} role="menuitem">
              Gastos fijos
            </button>
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
