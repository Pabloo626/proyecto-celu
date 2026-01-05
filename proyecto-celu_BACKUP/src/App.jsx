import { useEffect, useMemo, useState } from "react";

const KEY = "gastos_pareja_v1";

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

function loadExpenses() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function saveExpenses(expenses) {
  localStorage.setItem(KEY, JSON.stringify(expenses));
}

const CATEGORIES = ["Comida", "Transporte", "Casa", "Salud", "Panorama", "Otros"];

export default function App() {
  const [view, setView] = useState("add"); // add | list
  const [expenses, setExpenses] = useState(() => loadExpenses());

  // Form
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [paidBy, setPaidBy] = useState("yo"); // yo | pareja
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  useEffect(() => {
    saveExpenses(expenses);
  }, [expenses]);

  const total = useMemo(
    () => expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0),
    [expenses]
  );

  function addExpense(e) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      alert("Monto inválido. Debe ser un número > 0.");
      return;
    }
    if (!CATEGORIES.includes(category)) {
      alert("Categoría inválida.");
      return;
    }

    const item = {
      id: uid(),
      amount: n,
      category,
      paidBy, // "yo" | "pareja"
      date,   // "YYYY-MM-DD"
      note: note.trim(),
      split: "50_50",
      createdAt: new Date().toISOString(),
    };

    setExpenses([item, ...expenses]);
    setAmount("");
    setNote("");
    setView("list");
  }

  function removeExpense(id) {
    if (!confirm("¿Eliminar este gasto?")) return;
    setExpenses(expenses.filter((e) => e.id !== id));
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Gastos Pareja</h2>
        <nav style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setView("add")} disabled={view === "add"}>Agregar</button>
          <button onClick={() => setView("list")} disabled={view === "list"}>Historial</button>
        </nav>
      </header>

      <hr style={{ margin: "12px 0" }} />

      {view === "add" && (
        <form onSubmit={addExpense} style={{ display: "grid", gap: 10 }}>
          <label>
            Monto (CLP) *
            <input
              inputMode="numeric"
              placeholder="Ej: 8500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            />
          </label>

          <label>
            Categoría
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%", padding: 10 }}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label>
            Pagó
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} style={{ width: "100%", padding: 10 }}>
              <option value="yo">Yo</option>
              <option value="pareja">Pareja</option>
            </select>
          </label>

          <label>
            Fecha
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%", padding: 10 }} />
          </label>

          <label>
            Nota (opcional)
            <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", padding: 10 }} />
          </label>

          <button type="submit" style={{ padding: 12 }}>Guardar gasto</button>

          <p style={{ margin: 0, opacity: 0.7 }}>
            * Guardado local por ahora (en este navegador/dispositivo).
          </p>
        </form>
      )}

      {view === "list" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <b>Total acumulado:</b> ${total.toLocaleString("es-CL")}
          </div>

          {expenses.length === 0 ? (
            <div>No hay gastos todavía.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {expenses.map((e) => (
                <div key={e.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <b>${Number(e.amount).toLocaleString("es-CL")}</b>
                    <span>{e.date}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {e.category} · pagó: {e.paidBy === "yo" ? "Yo" : "Pareja"}
                  </div>
                  {e.note ? <div style={{ marginTop: 4, opacity: 0.8 }}>{e.note}</div> : null}
                  <button onClick={() => removeExpense(e.id)} style={{ marginTop: 10 }}>
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
