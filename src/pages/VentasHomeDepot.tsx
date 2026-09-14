// Home Depot sales page: weekly matrix entry/editing and Excel export.
import { useState, useEffect, useRef } from "react";
import ExcelJS from "exceljs";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import { getMonterreyYear } from "../lib/dateMx";

interface Semana {
  semana_num: number;
  semana_label: string;
}

interface VentaSemana {
  id: number;
  cantidad: number;
  precio: number;
  precioHD: number;
  importe: number;
}

interface Producto {
  mod: number;
  sku: string;
  descripcion: string;
  nombre_catalogo: string | null;
  en_catalogo: boolean;
  ventas: Record<number, VentaSemana>;
}

interface MatrizResponse {
  anio: number;
  semanas: Semana[];
  productos: Producto[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatImporte(v: number): string {
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
}

const MESES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function isoWeekMonday(year: number, week: number): Date {
  // Jan 4 is always in ISO week 1 of its year
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7; // 1=Mon … 7=Sun
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

// ─── Edit modal ──────────────────────────────────────────────────────────────

interface CeldaEditada {
  id: number | null;
  anio: number;
  semana_num: number;
  semana_label: string;
  mod: number;
  sku: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  precioHD: number;
  importe: number;
}

interface EditModalProps {
  celda: CeldaEditada;
  onClose: () => void;
  onSave: (celda: CeldaEditada) => Promise<void>;
}

function EditModal({ celda, onClose, onSave }: EditModalProps) {
  const [cantidad, setCantidad] = useState(String(celda.cantidad));
  const [precio, setPrecio] = useState(String(celda.precio || ""));
  const [precioHD, setPrecioHD] = useState(String(celda.precioHD || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importe = (Number(cantidad) || 0) * (Number(precio) || 0);

  const handleSave = async () => {
    const c = Number(cantidad);
    const p = Number(precio) || 0;
    const pHD = Number(precioHD) || 0;
    if (isNaN(c) || c < 0) { setError("Cantidad inválida"); return; }
    if (p < 0 || pHD < 0) { setError("Precio inválido"); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...celda, cantidad: c, precio: p, precioHD: pHD, importe: c * p });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Editar semana {celda.semana_label}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 truncate">
          {celda.descripcion}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cantidad (piezas)
            </label>
            <input
              type="number"
              min="0"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Precio (costo por unidad)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Precio HD (a como lo vendió Home Depot por unidad)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={precioHD}
              onChange={(e) => setPrecioHD(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Importe (MXN, automático)
            </label>
            <input
              type="text"
              readOnly
              value={formatImporte(importe)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-not-allowed"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-500">{error}</p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Nueva-semana modal ───────────────────────────────────────────────────────

interface FilaVenta {
  mod: number;
  sku: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  precioHD: number;
  importe: number;
}

interface NuevaSemanaModalProps {
  anio: number;
  semanas: Semana[];
  productos: Producto[];
  onClose: () => void;
  onSave: (semana_num: number, semana_label: string, filas: FilaVenta[]) => Promise<void>;
}

function NuevaSemanaModal({ anio, semanas, productos, onClose, onSave }: NuevaSemanaModalProps) {
  const [semanaMode, setSemanaMode] = useState<"existente" | "nueva">(
    semanas.length > 0 ? "existente" : "nueva"
  );
  const [semanaSeleccionada, setSemanaSeleccionada] = useState<string>(
    semanas.length > 0 ? String(semanas[semanas.length - 1].semana_num) : ""
  );
  const [nuevaSemanaNum, setNuevaSemanaNum] = useState("");
  // valores por MOD: { cantidad, precio, precioHD } como strings de input; importe se deriva
  const [valores, setValores] = useState<Record<number, { cantidad: string; precio: string; precioHD: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init: Record<number, { cantidad: string; precio: string; precioHD: string }> = {};
    const num = semanaMode === "existente" ? Number(semanaSeleccionada) : NaN;
    productos.forEach((p) => {
      const v = !isNaN(num) ? p.ventas[num] : undefined;
      init[p.mod] = {
        cantidad: v ? String(v.cantidad) : "",
        precio: v?.precio ? String(v.precio) : "",
        precioHD: v?.precioHD ? String(v.precioHD) : "",
      };
    });
    setValores(init);
  }, [semanaMode, semanaSeleccionada, productos]);

  const setCampo = (mod: number, campo: "cantidad" | "precio" | "precioHD", valor: string) => {
    setValores((prev) => ({ ...prev, [mod]: { ...prev[mod], [campo]: valor } }));
  };

  const importeDe = (mod: number) =>
    (Number(valores[mod]?.cantidad) || 0) * (Number(valores[mod]?.precio) || 0);

  // Resumen en vivo
  const totalPzas = productos.reduce((s, p) => s + (Number(valores[p.mod]?.cantidad) || 0), 0);
  const totalImp = productos.reduce((s, p) => s + importeDe(p.mod), 0);
  const conVenta = productos.filter(
    (p) => (Number(valores[p.mod]?.cantidad) || 0) > 0 || (Number(valores[p.mod]?.precio) || 0) > 0
  ).length;

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

    const filas: FilaVenta[] = productos
      .map((p) => {
        const v = valores[p.mod] ?? { cantidad: "", precio: "", precioHD: "" };
        const c = Number(v.cantidad) || 0;
        const precio = Number(v.precio) || 0;
        const precioHD = Number(v.precioHD) || 0;
        if (c < 0 || precio < 0 || precioHD < 0) return null;
        return {
          mod: p.mod, sku: p.sku, descripcion: p.descripcion,
          cantidad: c, precio, precioHD, importe: c * precio,
        };
      })
      .filter((f): f is FilaVenta => f !== null && (f.cantidad > 0 || f.precio > 0));

    if (filas.length === 0) { setError("Ingresa al menos una venta"); return; }

    setSaving(true);
    setError(null);
    try {
      await onSave(semana_num, semana_label, filas);
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
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Nueva semana de {anio}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Captura la venta de cada modelo para la semana. Los modelos sin venta se omiten.
          </p>

          {/* Semana */}
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Semana</label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
              {semanas.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSemanaMode("existente")}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    semanaMode === "existente"
                      ? "bg-blue-600 text-white"
                      : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  Semana existente
                </button>
              )}
              <button
                type="button"
                onClick={() => setSemanaMode("nueva")}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  semanaMode === "nueva"
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                Nueva semana
              </button>
            </div>

            {semanaMode === "existente" ? (
              <select
                value={semanaSeleccionada}
                onChange={(e) => setSemanaSeleccionada(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {semanas.map((s) => (
                  <option key={s.semana_num} value={s.semana_num}>
                    Sem {s.semana_num}: {s.semana_label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="53"
                  placeholder="# semana"
                  value={nuevaSemanaNum}
                  onChange={(e) => setNuevaSemanaNum(e.target.value)}
                  className="w-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                {nuevaSemanaNum && !isNaN(Number(nuevaSemanaNum)) &&
                 Number(nuevaSemanaNum) >= 1 && Number(nuevaSemanaNum) <= 53 && (
                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    {generateWeekLabel(anio, Number(nuevaSemanaNum))}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lista de modelos */}
        <div className="flex-1 overflow-auto">
          {productos.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
              No hay modelos registrados todavía. Agrega ventas desde una celda de la matriz.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-2 font-medium">MOD</th>
                  <th className="px-4 py-2 font-medium">Descripción</th>
                  <th className="px-4 py-2 font-medium w-28 text-center">Cantidad</th>
                  <th className="px-4 py-2 font-medium w-28 text-center">Precio</th>
                  <th className="px-4 py-2 font-medium w-28 text-center">Precio HD</th>
                  <th className="px-4 py-2 font-medium w-32 text-center">Importe (MXN)</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p, idx) => (
                  <tr
                    key={p.mod}
                    className={idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-900/40"}
                  >
                    <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-700 dark:text-gray-300 align-middle">
                      {p.mod}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 align-middle">
                      <span className="line-clamp-2" title={p.nombre_catalogo ?? p.descripcion}>
                        {p.nombre_catalogo ?? p.descripcion}
                      </span>
                      {!p.en_catalogo && (
                        <span className="block text-[10px] text-red-500">Sin producto en catálogo</span>
                      )}
                      <span className="block font-mono text-[10px] text-gray-400">{p.sku}</span>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={valores[p.mod]?.cantidad ?? ""}
                        onChange={(e) => setCampo(p.mod, "cantidad", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center"
                      />
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={valores[p.mod]?.precio ?? ""}
                        onChange={(e) => setCampo(p.mod, "precio", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-right"
                      />
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={valores[p.mod]?.precioHD ?? ""}
                        onChange={(e) => setCampo(p.mod, "precioHD", e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-right"
                      />
                    </td>
                    <td className="px-4 py-2 align-middle text-right text-xs text-gray-500 dark:text-gray-400">
                      {formatImporte(importeDe(p.mod))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4 text-sm">
            <div className="flex gap-6 text-gray-500 dark:text-gray-400">
              <span><span className="font-semibold text-gray-900 dark:text-white">{conVenta}</span> con venta</span>
              <span>Pzas: <span className="font-semibold text-gray-900 dark:text-white">{totalPzas.toLocaleString("es-MX")}</span></span>
              <span>Importe: <span className="font-semibold text-green-600 dark:text-green-400">{formatImporte(totalImp)}</span></span>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? "Guardando…" : "Guardar semana"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const ANIOS_DISPONIBLES = [2025, 2026];

export function VentasHomeDepot() {
  useDarkMode();

  const [anio, setAnio] = useState<number>(getMonterreyYear());
  const [matriz, setMatriz] = useState<MatrizResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editCelda, setEditCelda] = useState<CeldaEditada | null>(null);
  const [showNuevaSemana, setShowNuevaSemana] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashMsg = (msg: string) => {
    setActionMsg(msg);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => setActionMsg(null), 3000);
  };

  const fetchMatriz = async (a = anio) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAPI(`/api/ventas-hd?anio=${a}`) as MatrizResponse;
      setMatriz(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMatriz(anio); }, [anio]);

  // ── Edit cell ──────────────────────────────────────────────────────────────

  const handleCellClick = (producto: Producto, semana: Semana) => {
    const venta = producto.ventas[semana.semana_num];
    setEditCelda({
      id: venta?.id ?? null,
      anio,
      semana_num: semana.semana_num,
      semana_label: semana.semana_label,
      mod: producto.mod,
      sku: producto.sku,
      descripcion: producto.descripcion,
      cantidad: venta?.cantidad ?? 0,
      precio: venta?.precio ?? 0,
      precioHD: venta?.precioHD ?? 0,
      importe: venta?.importe ?? 0,
    });
  };

  const handleSaveEdit = async (celda: CeldaEditada) => {
    if (celda.id) {
      await fetchAPI(`/api/ventas-hd/${celda.id}`, {
        method: "PUT",
        body: JSON.stringify({
          cantidad: celda.cantidad, precio: celda.precio, precioHD: celda.precioHD, importe: celda.importe,
        }),
      });
    } else {
      await fetchAPI("/api/ventas-hd", {
        method: "POST",
        body: JSON.stringify({
          anio: celda.anio,
          semana_num: celda.semana_num,
          semana_label: celda.semana_label,
          mod: celda.mod,
          sku: celda.sku,
          descripcion: celda.descripcion,
          cantidad: celda.cantidad,
          precio: celda.precio,
          precioHD: celda.precioHD,
          importe: celda.importe,
        }),
      });
    }
    flashMsg("Guardado correctamente");
    await fetchMatriz(anio);
  };

  // ── Nueva semana (captura masiva) ────────────────────────────────────────────

  const handleNuevaSemana = async (
    semana_num: number,
    semana_label: string,
    filas: FilaVenta[]
  ) => {
    for (const f of filas) {
      await fetchAPI("/api/ventas-hd", {
        method: "POST",
        body: JSON.stringify({ anio, semana_num, semana_label, ...f }),
      });
    }
    flashMsg(`Semana ${semana_num} guardada (${filas.length} ${filas.length === 1 ? "modelo" : "modelos"})`);
    await fetchMatriz(anio);
  };

  // ── Export Excel ───────────────────────────────────────────────────────────

  const exportExcel = async () => {
    if (!matriz) return;

    const wb = new ExcelJS.Workbook();
    wb.creator = "EinterWeb";
    const ws = wb.addWorksheet(`Ventas HD ${anio}`);

    const sems = matriz.semanas;
    const prods = matriz.productos;

    const FIXED = 3;
    const semCol = (i: number) => FIXED + i * 2 + 1;
    const totalCantCol = FIXED + sems.length * 2 + 1;
    const totalImpCol  = FIXED + sems.length * 2 + 2;
    const lastCol = totalImpCol;

    // ── Styles ──────────────────────────────────────────────────────────────
    const headerFill = (argb: string): ExcelJS.Fill =>
      ({ type: "pattern", pattern: "solid", fgColor: { argb } });
    const border: ExcelJS.Borders = {
      top:      { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom:   { style: "thin", color: { argb: "FFD1D5DB" } },
      left:     { style: "thin", color: { argb: "FFD1D5DB" } },
      right:    { style: "thin", color: { argb: "FFD1D5DB" } },
      diagonal: {},
    };
    const thickBorderRight: Partial<ExcelJS.Border> = { style: "medium", color: { argb: "FF9CA3AF" } };

    const applyHeader = (cell: ExcelJS.Cell, value: string | number, bgArgb = "FFF3F4F6") => {
      cell.value = value;
      cell.fill = headerFill(bgArgb);
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = border;
    };

    // ── Row 1: "Sem N" merged headers ────────────────────────────────────────
    const r1 = ws.getRow(1);
    r1.height = 20;
    applyHeader(r1.getCell(1), "MOD");
    applyHeader(r1.getCell(2), "SKU");
    applyHeader(r1.getCell(3), "Descripción");

    sems.forEach((s, i) => {
      const c = semCol(i);
      applyHeader(r1.getCell(c), `Sem ${s.semana_num}`);
      ws.mergeCells(1, c, 1, c + 1);
    });
    applyHeader(r1.getCell(totalCantCol), "Total", "FFFEF9C3");
    ws.mergeCells(1, totalCantCol, 1, totalImpCol);

    // ── Row 2: week labels ───────────────────────────────────────────────────
    const r2 = ws.getRow(2);
    r2.height = 18;
    [1, 2, 3].forEach((c) => {
      r2.getCell(c).fill = headerFill("FFF3F4F6");
      r2.getCell(c).border = border;
    });
    sems.forEach((s, i) => {
      const c = semCol(i);
      const cell = r2.getCell(c);
      cell.value = s.semana_label;
      cell.fill = headerFill("FFF3F4F6");
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = border;
      ws.mergeCells(2, c, 2, c + 1);
    });
    const r2total = r2.getCell(totalCantCol);
    r2total.fill = headerFill("FFFEF9C3");
    r2total.border = border;
    ws.mergeCells(2, totalCantCol, 2, totalImpCol);

    // ── Row 3: "Pzas" / "$MXN" sub-headers ──────────────────────────────────
    const r3 = ws.getRow(3);
    r3.height = 16;
    [1, 2, 3].forEach((c) => {
      r3.getCell(c).fill = headerFill("FFF3F4F6");
      r3.getCell(c).border = border;
    });
    sems.forEach((_, i) => {
      const c = semCol(i);
      applyHeader(r3.getCell(c),     "Pzas");
      applyHeader(r3.getCell(c + 1), "$MXN");
    });
    applyHeader(r3.getCell(totalCantCol), "Pzas",  "FFFEF9C3");
    applyHeader(r3.getCell(totalImpCol),  "$MXN",  "FFFEF9C3");

    // Fix thick right-border on col 3 (Desc) in all 3 header rows
    [1, 2, 3].forEach((r) => {
      ws.getRow(r).getCell(3).border = { ...border, right: thickBorderRight };
    });

    // ── Data rows ────────────────────────────────────────────────────────────
    const cantFill: Record<string, string> = {
      zero:  "FFF9FAFB", // gray-50
      low:   "FFFFFFFF", // white
      mid:   "FFEFF6FF", // blue-50
      high:  "FFF0FDF4", // green-50
    };
    const cantBg = (c: number) =>
      c === 0 ? cantFill.zero : c >= 200 ? cantFill.high : c >= 100 ? cantFill.mid : cantFill.low;

    prods.forEach((p, idx) => {
      const rowBg = idx % 2 === 0 ? "FFFFFFFF" : "FFF9FAFB";
      const row = ws.addRow([]);
      row.height = 18;

      const setFixed = (col: number, val: string | number) => {
        const cell = row.getCell(col);
        cell.value = val;
        cell.fill = headerFill(rowBg);
        cell.font = { size: 10 };
        cell.border = border;
        cell.alignment = { vertical: "middle" };
      };
      setFixed(1, p.mod);
      setFixed(2, p.sku);
      const descCell = row.getCell(3);
      descCell.value = p.descripcion;
      descCell.fill = headerFill(rowBg);
      descCell.font = { size: 10 };
      descCell.border = { ...border, right: thickBorderRight };
      descCell.alignment = { vertical: "middle" };

      let totalCant = 0;
      let totalImp  = 0;

      sems.forEach((s, i) => {
        const v    = p.ventas[s.semana_num];
        const cant = v?.cantidad ?? 0;
        const imp  = v?.importe  ?? 0;
        totalCant += cant;
        totalImp  += imp;
        const c = semCol(i);

        const cantCell = row.getCell(c);
        cantCell.value = cant;
        cantCell.fill  = headerFill(cantBg(cant));
        cantCell.font  = { bold: cant > 0, size: 10 };
        cantCell.alignment = { horizontal: "center", vertical: "middle" };
        cantCell.border = border;

        const impCell = row.getCell(c + 1);
        impCell.value = imp;
        impCell.numFmt = '"$"#,##0.00';
        impCell.fill   = headerFill(cantBg(cant));
        impCell.font   = { size: 10, color: { argb: "FF16A34A" } };
        impCell.alignment = { horizontal: "right", vertical: "middle" };
        impCell.border = border;
      });

      const tcCell = row.getCell(totalCantCol);
      tcCell.value = totalCant;
      tcCell.fill  = headerFill("FFFEFCE8");
      tcCell.font  = { bold: true, size: 10 };
      tcCell.alignment = { horizontal: "center", vertical: "middle" };
      tcCell.border = { ...border, left: thickBorderRight };

      const tiCell = row.getCell(totalImpCol);
      tiCell.value = totalImp;
      tiCell.numFmt = '"$"#,##0.00';
      tiCell.fill   = headerFill("FFFEFCE8");
      tiCell.font   = { bold: true, size: 10, color: { argb: "FF15803D" } };
      tiCell.alignment = { horizontal: "right", vertical: "middle" };
      tiCell.border = border;
    });

    // ── Totals row ───────────────────────────────────────────────────────────
    const totRow = ws.addRow([]);
    totRow.height = 20;
    [1, 2].forEach((c) => {
      totRow.getCell(c).fill   = headerFill("FFFEFCE8");
      totRow.getCell(c).border = border;
    });
    const totDescCell = totRow.getCell(3);
    totDescCell.value = "TOTALES";
    totDescCell.fill  = headerFill("FFFEFCE8");
    totDescCell.font  = { bold: true, size: 10 };
    totDescCell.alignment = { vertical: "middle" };
    totDescCell.border = { ...border, right: thickBorderRight };

    let grandCant = 0;
    let grandImp  = 0;
    sems.forEach((s, i) => {
      const cant = prods.reduce((sum, p) => sum + (p.ventas[s.semana_num]?.cantidad ?? 0), 0);
      const imp  = prods.reduce((sum, p) => sum + (p.ventas[s.semana_num]?.importe  ?? 0), 0);
      grandCant += cant;
      grandImp  += imp;
      const c = semCol(i);

      const cc = totRow.getCell(c);
      cc.value = cant;
      cc.fill  = headerFill("FFFEFCE8");
      cc.font  = { bold: true, size: 10 };
      cc.alignment = { horizontal: "center", vertical: "middle" };
      cc.border = { ...border, top: thickBorderRight };

      const ic = totRow.getCell(c + 1);
      ic.value = imp;
      ic.numFmt = '"$"#,##0.00';
      ic.fill   = headerFill("FFFEFCE8");
      ic.font   = { bold: true, size: 10, color: { argb: "FF15803D" } };
      ic.alignment = { horizontal: "right", vertical: "middle" };
      ic.border = { ...border, top: thickBorderRight };
    });

    const gcCell = totRow.getCell(totalCantCol);
    gcCell.value = grandCant;
    gcCell.fill  = headerFill("FFFDE68A");
    gcCell.font  = { bold: true, size: 10 };
    gcCell.alignment = { horizontal: "center", vertical: "middle" };
    gcCell.border = { ...border, top: thickBorderRight, left: thickBorderRight };

    const giCell = totRow.getCell(totalImpCol);
    giCell.value = grandImp;
    giCell.numFmt = '"$"#,##0.00';
    giCell.fill   = headerFill("FFFDE68A");
    giCell.font   = { bold: true, size: 10, color: { argb: "FF15803D" } };
    giCell.alignment = { horizontal: "right", vertical: "middle" };
    giCell.border = { ...border, top: thickBorderRight };

    // ── Column widths ────────────────────────────────────────────────────────
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 38;
    for (let i = 0; i < sems.length; i++) {
      ws.getColumn(semCol(i)).width     = 8;
      ws.getColumn(semCol(i) + 1).width = 12;
    }
    ws.getColumn(totalCantCol).width = 9;
    ws.getColumn(totalImpCol).width  = 13;

    // ── Freeze: first 3 cols + first 3 header rows ───────────────────────────
    ws.views = [{ state: "frozen", xSplit: 3, ySplit: 3, activeCell: "D4" }];

    // ── Auto-filter on row 3 ─────────────────────────────────────────────────
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: lastCol } };

    // ── Download ─────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_hd_${anio}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Totals ─────────────────────────────────────────────────────────────────

  const semanas = matriz?.semanas ?? [];
  const productos = matriz?.productos ?? [];

  const totalPorSemana = (semana_num: number) =>
    productos.reduce((s, p) => s + (p.ventas[semana_num]?.cantidad ?? 0), 0);

  const importePorSemana = (semana_num: number) =>
    productos.reduce((s, p) => s + (p.ventas[semana_num]?.importe ?? 0), 0);

  const totalPorProducto = (p: Producto) =>
    semanas.reduce((s, sem) => s + (p.ventas[sem.semana_num]?.cantidad ?? 0), 0);

  const importePorProducto = (p: Producto) =>
    semanas.reduce((s, sem) => s + (p.ventas[sem.semana_num]?.importe ?? 0), 0);

  const granTotal = productos.reduce(
    (s, p) => s + semanas.reduce((ss, sem) => ss + (p.ventas[sem.semana_num]?.cantidad ?? 0), 0),
    0
  );
  const granImporte = productos.reduce(
    (s, p) => s + semanas.reduce((ss, sem) => ss + (p.ventas[sem.semana_num]?.importe ?? 0), 0),
    0
  );

  // ── Cell style ─────────────────────────────────────────────────────────────

  const cellBg = (cantidad: number) => {
    if (cantidad === 0) return "bg-gray-50 dark:bg-gray-800/50";
    if (cantidad >= 200) return "bg-green-50 dark:bg-green-900/20";
    if (cantidad >= 100) return "bg-blue-50 dark:bg-blue-900/20";
    return "";
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900" style={{ minHeight: 0 }}>

      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ventas HD</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Ventas semanales por producto, vista matricial
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {actionMsg && (
            <span className="text-sm text-green-600 dark:text-green-400 font-medium">{actionMsg}</span>
          )}

          {/* Year selector */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            {ANIOS_DISPONIBLES.map((a) => (
              <button
                key={a}
                onClick={() => setAnio(a)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  anio === a
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowNuevaSemana(true)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
          >
            + Nueva semana
          </button>

          <button
            onClick={exportExcel}
            disabled={!matriz || loading}
            className="px-4 py-2 border border-green-600 text-green-600 hover:bg-green-600 hover:text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            ↓ Excel
          </button>

          <button
            onClick={() => fetchMatriz(anio)}
            disabled={loading}
            className="px-4 py-2 border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Cargando…" : "↻ Actualizar"}
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      {matriz && !loading && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex gap-8 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">{productos.length}</span> productos
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">{semanas.length}</span> semanas
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            Total piezas:{" "}
            <span className="font-semibold text-gray-900 dark:text-white">
              {granTotal.toLocaleString("es-MX")}
            </span>
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            Total importe:{" "}
            <span className="font-semibold text-green-600 dark:text-green-400">
              {formatImporte(granImporte)}
            </span>
          </span>
        </div>
      )}

      {/* ── Loading / Error ── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="ml-4 text-gray-500 dark:text-gray-400">Cargando datos…</p>
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
          <p className="text-gray-500 dark:text-gray-400 text-lg">No hay datos para {anio}</p>
          <p className="text-gray-400 text-sm">Importa datos desde el Excel o agrega un producto para comenzar.</p>
        </div>
      )}

      {/* ── Matrix Table ── */}
      {!loading && !error && matriz && semanas.length > 0 && (
        <div className="flex-1 overflow-auto mx-4 my-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm" style={{ minHeight: 0 }}>
          <table className="border-collapse min-w-max text-sm">
            <thead>
              {/* ── Row 1: week numbers ── */}
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="sticky left-0 z-20 bg-gray-100 dark:bg-gray-700 border-b-2 border-r-2 border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-400 min-w-[3rem]">
                  MOD
                </th>
                <th className="sticky left-12 z-20 bg-gray-100 dark:bg-gray-700 border-b-2 border-r border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-400 min-w-[6rem]">
                  SKU
                </th>
                <th className="sticky left-36 z-20 bg-gray-100 dark:bg-gray-700 border-b-2 border-r-2 border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-400 min-w-[14rem] max-w-[16rem]">
                  Descripción
                </th>
                {semanas.map((s) => (
                  <th
                    key={s.semana_num}
                    colSpan={1}
                    className="border-b-2 border-r border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-xs font-normal text-gray-400 dark:text-gray-500 min-w-[6rem]"
                  >
                    Sem {s.semana_num}
                  </th>
                ))}
                <th className="border-b-2 border-l-2 border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400 min-w-[7rem] bg-yellow-50 dark:bg-yellow-900/20">
                  Total
                </th>
              </tr>

              {/* ── Row 2: week labels ── */}
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="sticky left-0 z-20 bg-gray-100 dark:bg-gray-700 border-b border-r-2 border-gray-300 dark:border-gray-600 px-3 py-1" />
                <th className="sticky left-12 z-20 bg-gray-100 dark:bg-gray-700 border-b border-r border-gray-300 dark:border-gray-600 px-3 py-1" />
                <th className="sticky left-36 z-20 bg-gray-100 dark:bg-gray-700 border-b border-r-2 border-gray-300 dark:border-gray-600 px-3 py-1" />
                {semanas.map((s) => (
                  <th
                    key={s.semana_num}
                    className="border-b border-r border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap"
                  >
                    {s.semana_label}
                  </th>
                ))}
                <th className="border-b border-l-2 border-gray-300 dark:border-gray-600 px-3 py-1 bg-yellow-50 dark:bg-yellow-900/20" />
              </tr>
            </thead>

            <tbody>
              {productos.map((producto, idx) => (
                <tr
                  key={producto.mod}
                  className={idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"}
                >
                  {/* Sticky: MOD */}
                  <td className={`sticky left-0 z-10 border-b border-r-2 border-gray-200 dark:border-gray-700 px-3 py-2 text-center font-mono text-xs font-semibold text-gray-700 dark:text-gray-300 ${idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"}`}>
                    {producto.mod}
                  </td>
                  {/* Sticky: SKU */}
                  <td className={`sticky left-12 z-10 border-b border-r border-gray-200 dark:border-gray-700 px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400 ${idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"}`}>
                    {producto.sku}
                  </td>
                  {/* Sticky: Descripción */}
                  <td className={`sticky left-36 z-10 border-b border-r-2 border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-800 dark:text-gray-200 max-w-[16rem] ${idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"}`}>
                    <span className="line-clamp-2" title={producto.nombre_catalogo ?? producto.descripcion}>
                      {producto.nombre_catalogo ?? producto.descripcion}
                    </span>
                    {!producto.en_catalogo && (
                      <span className="block text-[10px] text-red-500">Sin producto en catálogo</span>
                    )}
                  </td>

                  {/* Week cells */}
                  {semanas.map((s) => {
                    const v = producto.ventas[s.semana_num];
                    const cant = v?.cantidad ?? 0;
                    const imp = v?.importe ?? 0;
                    return (
                      <td
                        key={s.semana_num}
                        onClick={() => handleCellClick(producto, s)}
                        className={`border-b border-r border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center cursor-pointer hover:ring-2 hover:ring-blue-400 hover:z-10 hover:relative transition-all ${cellBg(cant)}`}
                      >
                        <div className="font-semibold text-gray-800 dark:text-gray-200 text-xs leading-none">
                          {cant.toLocaleString("es-MX")}
                        </div>
                        <div className="text-[10px] text-green-600 dark:text-green-400 leading-none mt-0.5 whitespace-nowrap">
                          {imp > 0 ? formatImporte(imp) : "-"}
                        </div>
                      </td>
                    );
                  })}

                  {/* Row total */}
                  <td className="border-b border-l-2 border-gray-200 dark:border-gray-700 px-3 py-1.5 text-center bg-yellow-50 dark:bg-yellow-900/20">
                    <div className="font-bold text-gray-900 dark:text-white text-xs">
                      {totalPorProducto(producto).toLocaleString("es-MX")}
                    </div>
                    <div className="text-[10px] text-green-700 dark:text-green-400 whitespace-nowrap">
                      {formatImporte(importePorProducto(producto))}
                    </div>
                  </td>
                </tr>
              ))}

              {/* ── Totals row ── */}
              <tr className="bg-yellow-50 dark:bg-yellow-900/20 font-bold">
                <td className="sticky left-0 z-10 bg-yellow-50 dark:bg-yellow-900/20 border-t-2 border-r-2 border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-700 dark:text-gray-300" />
                <td className="sticky left-12 z-10 bg-yellow-50 dark:bg-yellow-900/20 border-t-2 border-r border-gray-300 dark:border-gray-600 px-3 py-2" />
                <td className="sticky left-36 z-10 bg-yellow-50 dark:bg-yellow-900/20 border-t-2 border-r-2 border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-200">
                  TOTALES
                </td>
                {semanas.map((s) => (
                  <td
                    key={s.semana_num}
                    className="border-t-2 border-r border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center"
                  >
                    <div className="text-xs font-bold text-gray-900 dark:text-white">
                      {totalPorSemana(s.semana_num).toLocaleString("es-MX")}
                    </div>
                    <div className="text-[10px] text-green-700 dark:text-green-400 whitespace-nowrap">
                      {formatImporte(importePorSemana(s.semana_num))}
                    </div>
                  </td>
                ))}
                <td className="border-t-2 border-l-2 border-gray-300 dark:border-gray-600 px-3 py-1.5 text-center">
                  <div className="text-xs font-bold text-gray-900 dark:text-white">
                    {granTotal.toLocaleString("es-MX")}
                  </div>
                  <div className="text-[10px] text-green-700 dark:text-green-400 whitespace-nowrap">
                    {formatImporte(granImporte)}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modals ── */}
      {editCelda && (
        <EditModal
          celda={editCelda}
          onClose={() => setEditCelda(null)}
          onSave={handleSaveEdit}
        />
      )}

      {showNuevaSemana && (
        <NuevaSemanaModal
          anio={anio}
          semanas={semanas}
          productos={productos}
          onClose={() => setShowNuevaSemana(false)}
          onSave={handleNuevaSemana}
        />
      )}
    </div>
  );
}
