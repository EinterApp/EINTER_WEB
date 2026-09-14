// Costos Variables page: weekly price/cost matrix per product (same pattern
// as Ventas HD), open to any authenticated user to edit. Saving a week also
// updates the product's official price/cost. Each row can open a small
// time-series chart of its price/cost history.
import { useState, useEffect } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import { getMonterreyYear } from "../lib/dateMx";

interface Semana {
  semana_num: number;
  semana_label: string;
}

interface CostoCelda {
  id: number | null;
  precio: number | null;
  costo: number | null;
  arrastrado: boolean;
}

interface Producto {
  mod: number;
  sku: string;
  nombre_producto: string;
  costos: Record<number, CostoCelda>;
}

interface MatrizResponse {
  anio: number;
  semanas: Semana[];
  productos: Producto[];
}

interface HistorialPunto {
  anio: number;
  semana_num: number;
  semana_label: string;
  precio: number | null;
  costo: number | null;
}

function formatMoney(v: number | null): string {
  if (v == null) return "-";
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
}

const MESES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (dow - 1) + (week - 1) * 7);
  return monday;
}

function generateWeekLabel(anio: number, semana: number): string {
  const monday = isoWeekMonday(anio, semana);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const d1 = String(monday.getDate()).padStart(2, "0");
  const d2 = String(sunday.getDate()).padStart(2, "0");
  return `${d1}-${d2} ${MESES_ES[sunday.getMonth()]}`;
}

// ─── Nueva semana modal ────────────────────────────────────────────────────

function NuevaSemanaModal({
  anio, semanas, productos, onClose, onSaved,
}: {
  anio: number; semanas: Semana[]; productos: Producto[];
  onClose: () => void; onSaved: () => void;
}) {
  const [semanaMode, setSemanaMode] = useState<"existente" | "nueva">(
    semanas.length > 0 ? "existente" : "nueva"
  );
  const [semanaSeleccionada, setSemanaSeleccionada] = useState<string>(
    semanas.length > 0 ? String(semanas[semanas.length - 1].semana_num) : ""
  );
  const [nuevaSemanaNum, setNuevaSemanaNum] = useState("");
  const [valores, setValores] = useState<Record<number, { precio: string; costo: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastSemana = semanas.length > 0 ? semanas[semanas.length - 1].semana_num : null;

  useEffect(() => {
    const init: Record<number, { precio: string; costo: string }> = {};
    const num = semanaMode === "existente" ? Number(semanaSeleccionada) : NaN;
    productos.forEach((p) => {
      let v: CostoCelda | undefined;
      if (!isNaN(num)) v = p.costos[num];
      else if (lastSemana != null) v = p.costos[lastSemana]; // carry forward into a brand-new week
      init[p.mod] = {
        precio: v?.precio != null ? String(v.precio) : "",
        costo: v?.costo != null ? String(v.costo) : "",
      };
    });
    setValores(init);
  }, [semanaMode, semanaSeleccionada, productos, lastSemana]);

  const setCampo = (mod: number, campo: "precio" | "costo", valor: string) => {
    setValores((prev) => ({ ...prev, [mod]: { ...prev[mod], [campo]: valor } }));
  };

  const handleSave = async () => {
    let semana_num: number;
    let semana_label: string;

    if (semanaMode === "existente") {
      const sem = semanas.find((s) => s.semana_num === Number(semanaSeleccionada));
      if (!sem) { setError("Selecciona una semana"); return; }
      semana_num = sem.semana_num;
      semana_label = sem.semana_label;
    } else {
      semana_num = Number(nuevaSemanaNum);
      if (!nuevaSemanaNum || isNaN(semana_num) || semana_num < 1 || semana_num > 53) {
        setError("Número de semana inválido (1–53)"); return;
      }
      if (semanas.some((s) => s.semana_num === semana_num)) {
        setError(`La semana ${semana_num} ya existe`); return;
      }
      semana_label = generateWeekLabel(anio, semana_num);
    }

    const filas = productos
      .map((p) => {
        const v = valores[p.mod] ?? { precio: "", costo: "" };
        const precio = v.precio !== "" ? Number(v.precio) : null;
        const costo = v.costo !== "" ? Number(v.costo) : null;
        if (precio == null && costo == null) return null;
        return { mod: p.mod, precio, costo };
      })
      .filter((f): f is { mod: number; precio: number | null; costo: number | null } => f !== null);

    if (filas.length === 0) { setError("Ingresa al menos un precio o costo"); return; }

    setSaving(true);
    setError(null);
    try {
      for (const f of filas) {
        await fetchAPI("/api/costos-variables", {
          method: "POST",
          body: JSON.stringify({ anio, semana_num, semana_label, ...f }),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Semana de costos {anio}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Los valores se prellenan con el último precio/costo capturado (se arrastra hasta que lo cambies).
          </p>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Semana</label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
              {semanas.length > 0 && (
                <button type="button" onClick={() => setSemanaMode("existente")}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    semanaMode === "existente" ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}>
                  Semana existente
                </button>
              )}
              <button type="button" onClick={() => setSemanaMode("nueva")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  semanaMode === "nueva" ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}>
                Nueva semana
              </button>
            </div>
            {semanaMode === "existente" ? (
              <select value={semanaSeleccionada} onChange={(e) => setSemanaSeleccionada(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                {semanas.map((s) => (
                  <option key={s.semana_num} value={s.semana_num}>Sem {s.semana_num}: {s.semana_label}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-3">
                <input type="number" min="1" max="53" placeholder="# semana" value={nuevaSemanaNum}
                  onChange={(e) => setNuevaSemanaNum(e.target.value)}
                  className="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                {nuevaSemanaNum && !isNaN(Number(nuevaSemanaNum)) && Number(nuevaSemanaNum) >= 1 && Number(nuevaSemanaNum) <= 53 && (
                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    {generateWeekLabel(anio, Number(nuevaSemanaNum))}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {productos.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No hay productos en el catálogo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-2 font-medium">MOD</th>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 font-medium w-32 text-center">Precio</th>
                  <th className="px-4 py-2 font-medium w-32 text-center">Costo</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p, idx) => (
                  <tr key={p.mod} className={idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-900/40"}>
                    <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-700 dark:text-gray-300 align-middle">{p.mod}</td>
                    <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 align-middle">
                      <span className="line-clamp-2">{p.nombre_producto}</span>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <input type="number" min="0" step="0.01" placeholder="0.00"
                        value={valores[p.mod]?.precio ?? ""}
                        onChange={(e) => setCampo(p.mod, "precio", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-right" />
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <input type="number" min="0" step="0.01" placeholder="0.00"
                        value={valores[p.mod]?.costo ?? ""}
                        onChange={(e) => setCampo(p.mod, "costo", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-right" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? "Guardando…" : "Guardar semana"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Chart modal ───────────────────────────────────────────────────────────

function GraficaModal({ mod, nombre, onClose }: { mod: number; nombre: string; onClose: () => void }) {
  const [puntos, setPuntos] = useState<HistorialPunto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI(`/api/costos-variables/historial/${mod}`)
      .then((raw) => setPuntos(raw as HistorialPunto[]))
      .catch(() => setPuntos([]))
      .finally(() => setLoading(false));
  }, [mod]);

  const W = 640, H = 260, PAD = 36;
  const allVals = puntos.flatMap((p) => [p.precio, p.costo]).filter((v): v is number => v != null);
  const maxVal = allVals.length > 0 ? Math.max(...allVals) * 1.1 : 1;

  const xFor = (i: number) => puntos.length <= 1 ? PAD : PAD + (i / (puntos.length - 1)) * (W - PAD * 2);
  const yFor = (v: number) => H - PAD - (v / maxVal) * (H - PAD * 2);

  const pathFor = (key: "precio" | "costo") => {
    const pts = puntos
      .map((p, i) => (p[key] != null ? { x: xFor(i), y: yFor(p[key]!) } : null))
      .filter((p): p is { x: number; y: number } => p !== null);
    if (pts.length === 0) return "";
    return pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Precio y costo — {nombre}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : puntos.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">Sin historial capturado todavía.</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-64">
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" className="text-gray-300 dark:text-gray-600" />
              <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="currentColor" className="text-gray-300 dark:text-gray-600" />
              <path d={pathFor("precio")} fill="none" stroke="#2563eb" strokeWidth={2} />
              <path d={pathFor("costo")} fill="none" stroke="#dc2626" strokeWidth={2} />
              {puntos.map((p, i) => (
                <g key={i}>
                  {p.precio != null && <circle cx={xFor(i)} cy={yFor(p.precio)} r={3} fill="#2563eb" />}
                  {p.costo != null && <circle cx={xFor(i)} cy={yFor(p.costo)} r={3} fill="#dc2626" />}
                </g>
              ))}
            </svg>
            <div className="flex items-center gap-6 mt-2 text-sm">
              <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> Precio
              </span>
              <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                <span className="w-3 h-3 rounded-full bg-red-600 inline-block" /> Costo
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

const ANIOS_DISPONIBLES = [2025, 2026];

export function CostosVariables() {
  useDarkMode();

  const [anio, setAnio] = useState<number>(getMonterreyYear());
  const [matriz, setMatriz] = useState<MatrizResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNuevaSemana, setShowNuevaSemana] = useState(false);
  const [grafica, setGrafica] = useState<{ mod: number; nombre: string } | null>(null);

  const fetchMatriz = async (a = anio) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAPI(`/api/costos-variables?anio=${a}`) as MatrizResponse;
      setMatriz(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMatriz(anio); }, [anio]);

  const semanas = matriz?.semanas ?? [];
  const productos = matriz?.productos ?? [];

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900" style={{ minHeight: 0 }}>
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Costos Variables</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Precio y costo por semana; se arrastra el último valor hasta que lo actualices.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            {ANIOS_DISPONIBLES.map((a) => (
              <button key={a} onClick={() => setAnio(a)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  anio === a ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}>
                {a}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNuevaSemana(true)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg transition-colors">
            + Nueva semana
          </button>
          <button onClick={() => fetchMatriz(anio)} disabled={loading}
            className="px-4 py-2 border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {loading ? "Cargando…" : "↻ Actualizar"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}
      {!loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-2">
          <p className="text-red-500 font-semibold">Error al cargar datos</p>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
      )}
      {!loading && !error && matriz && semanas.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-2">
          <p className="text-gray-500 dark:text-gray-400 text-lg">No hay semanas capturadas para {anio}</p>
          <p className="text-gray-400 text-sm">Usa "+ Nueva semana" para comenzar.</p>
        </div>
      )}

      {!loading && !error && matriz && semanas.length > 0 && (
        <div className="flex-1 overflow-auto mx-4 my-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm" style={{ minHeight: 0 }}>
          <table className="border-collapse min-w-max text-sm">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="sticky left-0 z-20 bg-gray-100 dark:bg-gray-700 border-b-2 border-r-2 border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-400 min-w-[3rem]">MOD</th>
                <th className="sticky left-12 z-20 bg-gray-100 dark:bg-gray-700 border-b-2 border-r-2 border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-400 min-w-[14rem] max-w-[16rem]">Producto</th>
                {semanas.map((s) => (
                  <th key={s.semana_num} className="border-b-2 border-r border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 min-w-[7rem] whitespace-nowrap">
                    Sem {s.semana_num}<br /><span className="font-normal text-gray-400">{s.semana_label}</span>
                  </th>
                ))}
                <th className="border-b-2 border-l-2 border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 min-w-[5rem]">Gráfica</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p, idx) => (
                <tr key={p.mod} className={idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"}>
                  <td className={`sticky left-0 z-10 border-b border-r-2 border-gray-200 dark:border-gray-700 px-3 py-2 text-center font-mono text-xs font-semibold text-gray-700 dark:text-gray-300 ${idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"}`}>
                    {p.mod}
                  </td>
                  <td className={`sticky left-12 z-10 border-b border-r-2 border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-800 dark:text-gray-200 max-w-[16rem] ${idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"}`}>
                    <span className="line-clamp-2">{p.nombre_producto}</span>
                  </td>
                  {semanas.map((s) => {
                    const c = p.costos[s.semana_num];
                    return (
                      <td key={s.semana_num} className={`border-b border-r border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center ${c?.arrastrado ? "bg-gray-50 dark:bg-gray-800/60" : ""}`}>
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight">
                          {formatMoney(c?.precio ?? null)}
                        </div>
                        <div className="text-[10px] text-red-600 dark:text-red-400 leading-tight">
                          {formatMoney(c?.costo ?? null)}
                        </div>
                      </td>
                    );
                  })}
                  <td className="border-b border-l-2 border-gray-200 dark:border-gray-700 px-3 py-1.5 text-center">
                    <button onClick={() => setGrafica({ mod: p.mod, nombre: p.nombre_producto })}
                      className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors">
                      📈 Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNuevaSemana && (
        <NuevaSemanaModal
          anio={anio} semanas={semanas} productos={productos}
          onClose={() => setShowNuevaSemana(false)}
          onSaved={() => fetchMatriz(anio)}
        />
      )}

      {grafica && (
        <GraficaModal mod={grafica.mod} nombre={grafica.nombre} onClose={() => setGrafica(null)} />
      )}
    </div>
  );
}
