import { useEffect, useMemo, useRef, useState } from "react";
import { addEntry, deleteEntry, listEntries, listMonths, replaceAll } from "./api";

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

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

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

function formatCLP(n) {
  return Number(n).toLocaleString("es-CL");
}

function parseAmount(input) {
  const n = Number(String(input || "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function profileName(profileId) {
  return PROFILES.find((p) => p.id === profileId)?.name || "—";
}

function CategoryBars({ rows, maxValue }) {
  return (
    <div>
      {rows.map((r) => {
        const pct = maxValue > 0 ? Math.round((r.value / maxValue) * 100) : 0;
        return (
          <div className="barRow" key={r.label}>
            <div className="barLabel" title={r.label}>{r.label}</div>
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

function SegmentedType({ value, onChange }) {
  return (
    <div className="segmented" role="tablist" aria-label="Tipo de movimiento">
      <button type="button" role="tab" aria-selected={value === ENTRY_TYPES.EXPENSE}
        className={`segBtn ${value === ENTRY_TYPES.EXPENSE ? "isActive" : ""}`}
        onClick={() => onChange(ENTRY_TYPES.EXPENSE)}>
        💸 Gasto
      </button>
      <button type="button" role="tab" aria-selected={value === ENTRY_TYPES.INCOME}
        className={`segBtn ${value === ENTRY_TYPES.INCOME ? "isActive" : ""}`}
        onClick={() => onChange(ENTRY_TYPES.INCOME)}>
        ✨ Ingreso
      </button>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState(VIEWS.PROFILE);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const [profileId, setProfileId] = useState("pablo");

  const [allEntries, setAllEntries] = useState([]);
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(monthKeyFromISODate(todayISODateLocal()));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");

  const [entryType, setEntryType] = useState(ENTRY_TYPES.EXPENSE);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(OPTIONS.categories[0]);
  const [date, setDate] = useState(todayISODateLocal());
  const [note, setNote] = useState("");

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    function onKey(e) { if (e.key === "Escape") setMenuOpen(false); }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  async function refreshAll() {
    setLoading(true); setErr("");
    try {
      const [items, ms] = await Promise.all([listEntries(""), listMonths()]);
      setAllEntries(items);
      setMonths(ms.includes(selectedMonth) ? ms : [selectedMonth, ...ms]);
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
      setEntryType(ENTRY_TYPES.EXPENSE);
      setDate(todayISODateLocal());
      setAmount("");
      setNote("");
      setCategory(OPTIONS.categories[0]);
    }
  }

  useEffect(() => {
    const list = entryType === ENTRY_TYPES.INCOME ? OPTIONS.incomeCategories : OPTIONS.categories;
    if (!list.includes(category)) setCategory(list[0] || "Otros");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryType]);

  const entriesMonth = useMemo(
    () => allEntries.filter((e) => monthKeyFromISODate(e.date) === selectedMonth),
    [allEntries, selectedMonth]
  );

  const myEntriesMonth = useMemo(
    () => entriesMonth.filter((e) => e.profile === profileId),
    [entriesMonth, profileId]
  );

  const myExpensesMonth = useMemo(
    () => myEntriesMonth.filter((e) => e.type !== ENTRY_TYPES.INCOME),
    [myEntriesMonth]
  );

  const myIncomesMonth = useMemo(
    () => myEntriesMonth.filter((e) => e.type === ENTRY_TYPES.INCOME),
    [myEntriesMonth]
  );

  const myIncomeTotal = useMemo(() => myIncomesMonth.reduce((a, e) => a + Number(e.amount || 0), 0), [myIncomesMonth]);
  const myExpenseTotal = useMemo(() => myExpensesMonth.reduce((a, e) => a + Number(e.amount || 0), 0), [myExpensesMonth]);

  const myTopExpenseCategories = useMemo(() => {
    const map = new Map();
    for (const e of myExpensesMonth) {
      const k = e.category || "Otros";
      map.set(k, (map.get(k) || 0) + Number(e.amount || 0));
    }
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [myExpensesMonth]);

  const myMaxCat = useMemo(() => Math.max(0, ...myTopExpenseCategories.map((x) => x.value)), [myTopExpenseCategories]);

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
      const delta = spent - target;
      rows.push({ cat, pct, target, spent, delta });
    }
    rows.sort((a, b) => b.pct - a.pct);
    return rows;
  }, [budgetPercents, myIncomeTotal, spendByCat]);

  const allSorted = useMemo(() => {
    const copy = [...allEntries];
    copy.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
    return copy;
  }, [allEntries]);

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

    setLoading(true); setErr("");
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
    setLoading(true); setErr("");
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
    try { await navigator.clipboard.writeText(text); alert("Copiado ✅"); }
    catch { alert("No se pudo copiar."); }
  }

  const fileInputRef = useRef(null);
  async function onPickJsonFile() { fileInputRef.current?.click(); }

  async function onJsonFileSelected(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;

    let txt = "";
    try { txt = await file.text(); } catch { return alert("No se pudo leer el archivo."); }

    let parsed;
    try { parsed = JSON.parse(txt); } catch { return alert("JSON inválido."); }

    let items = parsed;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      items = parsed.items || parsed.entries || parsed.movements || parsed.data || [];
    }
    if (!Array.isArray(items)) return alert("El JSON debe ser un array o { items:[...] }.");

    if (!confirm("Esto REEMPLAZARÁ la nube (Google Sheet). ¿Continuar?")) return;

    setLoading(true); setErr("");
    try {
      await replaceAll(items);
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
      <div className="appHeader"><div className="appHeaderInner"><div className="topBar" /></div></div>

      <div className="container">
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="chartTitleRow">
            <div>
              <div className="kpiBig">Nube (Google Sheets)</div>
              <div className="kpiSmall">
                Mes: <b>{selectedMonth}</b> · Perfil: <b>{profileName(profileId)}</b>
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

              <div className="barsWrap">
                <div className="kpiSmall">Tus gastos por categoría</div>
                {myTopExpenseCategories.length === 0 ? (
                  <div className="kpiSmall" style={{ marginTop: 10 }}>Sin gastos este mes.</div>
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
            </div>
          </div>
        )}

        {view === VIEWS.ADD && (
          <div className="grid">
            <div className="card grid">
              <div className="kpiBig">{entryType === "income" ? "Agregar ingreso" : "Agregar gasto"}</div>
              <SegmentedType value={entryType} onChange={setEntryType} />

              <div className="meta">Se guardará en: <b>{profileName(profileId)}</b></div>

              <form onSubmit={onSubmit} className="formGrid" style={{ marginTop: 10 }}>
                <label className="label span2">
                  Monto (CLP) *
                  <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>

                <label className="label">
                  Categoría
                  <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {catList.map((c) => <option key={c} value={c}>{c}</option>)}
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
                  <button className="danger" onClick={() => onDelete(e.id)} disabled={loading}>Eliminar</button>
                </div>
              ))
            )}
          </div>
        )}

        {view === VIEWS.MONTHS && (
          <div className="grid">
            <div className="card">
              <div className="kpiBig">Meses pasados</div>
              <div className="meta">Elige un mes para ver el análisis.</div>
            </div>

            {(months.length ? months : [selectedMonth]).map((m) => (
              <div key={m} className="rowCard">
                <div className="rowTop">
                  <div className="money">{m}</div>
                  <div className="meta">{m === selectedMonth ? "Actual" : ""}</div>
                </div>
                <button className="secondaryBtn" onClick={() => { setSelectedMonth(m); go(VIEWS.PROFILE); }}>
                  Ver análisis
                </button>
              </div>
            ))}
          </div>
        )}

        {view === VIEWS.DEBUG && (
          <div className="grid">
            <div className="card">
              <div className="money">Debug</div>
              <div className="meta">Cambiar perfil + importar JSON a la nube.</div>

              <div style={{ marginTop: 12 }}>
                <div className="kpiSmall">Perfil actual</div>
                <select className="select" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={onJsonFileSelected} />
              </div>
            </div>

            <div className="card">
              <div className="kpiBig">JSON (vista)</div>
              <textarea className="monoArea" value={JSON.stringify(allEntries, null, 2)} readOnly />
            </div>
          </div>
        )}
      </div>

      <div className="bottomNav" ref={menuRef}>
        {menuOpen && (
          <div className="navMenuBox" role="menu">
            <button className="navMenuItem" onClick={() => go(VIEWS.HISTORY)} role="menuitem">Historial</button>
            <button className="navMenuItem" onClick={() => go(VIEWS.MONTHS)} role="menuitem">Meses pasados</button>
            <button className="navMenuItem" onClick={() => go(VIEWS.DEBUG)} role="menuitem">Debug</button>
          </div>
        )}

        <div className="bottomNavInner">
          <button className="navBtn" onClick={() => setMenuOpen((s) => !s)} aria-label="Opciones">☰</button>
          <button className="navBtn navBtnPrimary" onClick={() => go(VIEWS.ADD)} aria-label="Agregar">+</button>
          <button className={`navBtn ${view === VIEWS.PROFILE ? "isActive" : ""}`} onClick={() => go(VIEWS.PROFILE)} aria-label="Perfil">👤</button>
        </div>
      </div>
    </>
  );
}
