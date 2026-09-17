// Compares Home Depot orders vs actual salidas, by product and by order.
import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { auth } from "../lib/firebase";
import { ColumnFilter, distinctValues } from "../components/ColumnFilter";
import { SkuCombobox, type SkuOption } from "../components/SkuCombobox";
import { getMonterreyDateISO } from "../lib/dateMx";

// ── Types ──────────────────────────────────────────────────────────────────────

type ComparativoStatus = "completo" | "parcial" | "sin_entrega" | "sin_pedido";

interface ComparativoRow {
  master_sku: string;
  sku_thd: string;
  descripcion: string;
  total_pedido: number;
  total_salida: number;
  diferencia: number;
  pct_cumplimiento: number;
  status: ComparativoStatus;
  numero_folio: string | null;
  cantidad_real: number | null;
  discrepancia_resuelta: boolean;
}

interface ComparativoSummary {
  total_productos: number;
  total_pedido: number;
  total_salida: number;
  pct_cumplimiento_general: number;
}

type OrdenStatus = "completo" | "parcial" | "pendiente" | "sin_pedido";

interface OrdenRow {
  numero_folio: string;
  fecha_orden: string;
  total_pedido: number;
  total_salida: number;
  diferencia: number;
  pct_cumplimiento: number;
  status: OrdenStatus;
  discrepancia_resuelta: boolean;
}

interface OrdenSummary {
  total_ordenes: number;
  total_pedido: number;
  total_salida: number;
  pct_cumplimiento_general: number;
}

interface DetalleOrdenRow {
  master_sku: number;
  sku_thd: string | null;
  descripcion: string | null;
  total_pedido: number;
  total_salida: number;
  diferencia: number;
  pct_cumplimiento: number;
  status: ComparativoStatus;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<
  ComparativoStatus,
  { label: string; rowBg: string; badgeBg: string; badgeText: string }
> = {
  completo: {
    label: "Completo",
    rowBg: "bg-green-50 dark:bg-green-950/30",
    badgeBg: "bg-green-100 dark:bg-green-900/50",
    badgeText: "text-green-700 dark:text-green-300",
  },
  parcial: {
    label: "Parcial",
    rowBg: "bg-amber-50 dark:bg-amber-950/20",
    badgeBg: "bg-amber-100 dark:bg-amber-900/40",
    badgeText: "text-amber-700 dark:text-amber-300",
  },
  sin_entrega: {
    label: "Sin Entrega",
    rowBg: "bg-red-50 dark:bg-red-950/30",
    badgeBg: "bg-red-100 dark:bg-red-900/50",
    badgeText: "text-red-700 dark:text-red-300",
  },
  sin_pedido: {
    label: "Sin Pedido",
    rowBg: "",
    badgeBg: "bg-gray-100 dark:bg-gray-700",
    badgeText: "text-gray-600 dark:text-gray-400",
  },
};

const ORDEN_STATUS_CFG: Record<
  OrdenStatus,
  { label: string; rowBg: string; badgeBg: string; badgeText: string }
> = {
  completo: {
    label: "Completo",
    rowBg: "bg-green-50 dark:bg-green-950/30",
    badgeBg: "bg-green-100 dark:bg-green-900/50",
    badgeText: "text-green-700 dark:text-green-300",
  },
  parcial: {
    label: "Parcial",
    rowBg: "bg-amber-50 dark:bg-amber-950/20",
    badgeBg: "bg-amber-100 dark:bg-amber-900/40",
    badgeText: "text-amber-700 dark:text-amber-300",
  },
  pendiente: {
    label: "Pendiente",
    rowBg: "bg-blue-50 dark:bg-blue-950/20",
    badgeBg: "bg-blue-100 dark:bg-blue-900/40",
    badgeText: "text-blue-700 dark:text-blue-300",
  },
  sin_pedido: {
    label: "Sin Pedido",
    rowBg: "",
    badgeBg: "bg-gray-100 dark:bg-gray-700",
    badgeText: "text-gray-600 dark:text-gray-400",
  },
};

const MESES = [
  { value: 0, label: "Todos los meses" },
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

const DIAS = [
  { value: 0, label: "Todos los días" },
  ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
];

const CATEGORIAS = [{ value: "baños", label: "Baños" }];

const TABLE_GRID_PROD = "6rem 7rem minmax(0,3fr) 7rem 7rem 7rem 9rem 7rem";
const TABLE_GRID_ORDEN = "6rem 8rem 7rem 7rem 7rem 9rem 7rem";

// ── Helpers ────────────────────────────────────────────────────────────────────

type SortCol = keyof ComparativoRow;
type OrdenSortCol = keyof OrdenRow;
type SortDir = "asc" | "desc";

function formatPct(pct: number, _status: string) {
  return `${pct.toFixed(1)}%`;
}

function pctTextColor(pct: number) {
  if (pct >= 100) return "text-green-600 dark:text-green-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function pctBarColor(pct: number) {
  if (pct >= 100) return "bg-green-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function ordenPctTextColor(pct: number) {
  if (pct >= 90) return "text-green-600 dark:text-green-400";
  if (pct >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function ordenPctBarColor(pct: number) {
  if (pct >= 90) return "bg-green-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-red-500";
}

function summaryPctClasses(pct: number) {
  if (pct >= 90)
    return "bg-green-100 dark:bg-green-900/40 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300";
  if (pct >= 50)
    return "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300";
  return "bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300";
}

function ordenSummaryPctClasses(pct: number) {
  if (pct >= 90)
    return "bg-green-100 dark:bg-green-900/40 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300";
  if (pct >= 70)
    return "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300";
  return "bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300";
}

function formatFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return getMonterreyDateISO();
}

// ── Expanded panel ─────────────────────────────────────────────────────────────

function ExpandedPanel({
  row,
  onRefresh,
}: {
  row: ComparativoRow;
  onRefresh: () => void;
}) {
  const isCompleto = row.status === "completo";
  const [toggleOn, setToggleOn] = useState(isCompleto || row.discrepancia_resuelta);
  const [cantidadReal, setCantidadReal] = useState("");
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSubmit = async () => {
    if (!row.numero_folio || !cantidadReal) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      await fetchAPI(
        `/api/thd/discrepancia/${encodeURIComponent(row.numero_folio)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ cantidad_real: Number(cantidadReal), notas }),
        }
      );
      setSubmitMsg({ ok: true, text: "Salida real guardada exitosamente." });
      onRefresh();
    } catch (err) {
      setSubmitMsg({ ok: false, text: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-950/20 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      {/* Read-only info */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <div>
          <p className="text-xs font-robotoMedium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">
            Número de folio
          </p>
          <p className="text-sm text-gray-900 dark:text-white font-mono">
            {row.numero_folio ?? "-"}
          </p>
        </div>
        <div>
          <p className="text-xs font-robotoMedium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">
            Pedido
          </p>
          <p className="text-sm text-gray-900 dark:text-white">
            {row.total_pedido.toLocaleString("es-MX")}
          </p>
        </div>
        <div>
          <p className="text-xs font-robotoMedium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">
            Salida registrada
          </p>
          <p className="text-sm text-gray-900 dark:text-white">
            {row.total_salida.toLocaleString("es-MX")}
          </p>
        </div>
        <div>
          <p className="text-xs font-robotoMedium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">
            Diferencia
          </p>
          <p
            className={`text-sm font-medium ${
              row.diferencia < 0
                ? "text-red-600 dark:text-red-400"
                : "text-green-600 dark:text-green-400"
            }`}
          >
            {row.diferencia.toLocaleString("es-MX")}
          </p>
        </div>
        <div>
          <p className="text-xs font-robotoMedium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">
            % Cumplimiento
          </p>
          <p className={`text-sm font-bold ${pctTextColor(row.pct_cumplimiento)}`}>
            {row.pct_cumplimiento.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="border-t border-blue-200 dark:border-blue-800 mb-4" />

      {/* Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm font-robotoMedium text-gray-700 dark:text-gray-300">
          ¿Coincide con salida registrada?
        </span>
        <button
          type="button"
          disabled={isCompleto}
          onClick={() => !isCompleto && setToggleOn((v) => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            toggleOn ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
          } ${isCompleto ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              toggleOn ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Toggle content */}
      {toggleOn ? (
        <p className="text-sm text-green-700 dark:text-green-400 font-robotoMedium">
          ✓ Salida confirmada como correcta
        </p>
      ) : (
        <div className="space-y-3 max-w-md">
          <div>
            <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1">
              Cantidad real que salió <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              value={cantidadReal}
              onChange={(e) => setCantidadReal(e.target.value)}
              placeholder="Cantidad real que salió"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1">
              Notas
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas sobre la discrepancia (opcional)"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
            />
          </div>
          {submitMsg && (
            <p
              className={`text-sm ${
                submitMsg.ok
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {submitMsg.text}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || !cantidadReal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-robotoMedium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Guardando…
              </>
            ) : (
              "Guardar salida real"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Orden Modal ────────────────────────────────────────────────────────────────

interface OrdenModalProps {
  orden: OrdenRow | null;
  onClose: () => void;
  modalData: DetalleOrdenRow[];
  modalLoading: boolean;
  modalError: string | null;
}

function OrdenModal({ orden, onClose, modalData, modalLoading, modalError }: OrdenModalProps) {
  if (!orden) return null;

  const cfg = ORDEN_STATUS_CFG[orden.status] ?? ORDEN_STATUS_CFG.sin_pedido;
  const productos = modalData;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Orden #{orden.numero_folio}
            </h2>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.badgeBg} ${cfg.badgeText}`}
            >
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatFecha(orden.fecha_orden)}
            </p>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none px-1"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-gray-200 dark:border-gray-700">
          <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Pedido
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {orden.total_pedido.toLocaleString("es-MX")}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Salida
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {orden.total_salida.toLocaleString("es-MX")}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Diferencia
            </p>
            <p
              className={`text-xl font-bold ${
                orden.diferencia < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {orden.diferencia.toLocaleString("es-MX")}
            </p>
          </div>
          <div className={`border rounded-lg p-3 ${ordenSummaryPctClasses(orden.pct_cumplimiento)}`}>
            <p className="text-xs font-medium uppercase tracking-wide mb-1 opacity-75">
              % Cumplimiento
            </p>
            <p className="text-xl font-bold">{formatPct(orden.pct_cumplimiento, orden.status)}</p>
          </div>
        </div>

        {/* Discrepancy warning */}
        {!orden.discrepancia_resuelta && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg flex items-center gap-2">
            <span className="text-amber-500 text-lg">⚠</span>
            <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
              Esta orden tiene discrepancias sin resolver
            </p>
          </div>
        )}

        {/* Product table */}
        <div className="flex-1 overflow-auto mx-6 my-4 border border-gray-300 dark:border-gray-600 rounded-lg flex flex-col">
          {modalLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                Cargando productos...
              </p>
            </div>
          ) : modalError ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-red-500 font-medium text-sm">Error al cargar productos</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">{modalError}</p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div
                className="grid [&>*]:min-w-0 bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-300 dark:border-gray-600 sticky top-0"
                style={{ gridTemplateColumns: TABLE_GRID_PROD }}
              >
                {(
                  [
                    { label: "MOD", align: "center" },
                    { label: "SKU THD", align: "center" },
                    { label: "Descripción", align: "left" },
                    { label: "Pedido", align: "center" },
                    { label: "Salida", align: "center" },
                    { label: "Diferencia", align: "center" },
                    { label: "% Cumplimiento", align: "center" },
                    { label: "Status", align: "center" },
                  ] as { label: string; align: "center" | "left" }[]
                ).map((c, i, arr) => (
                  <div
                    key={c.label}
                    className={`py-3 px-3 ${i < arr.length - 1 ? "border-r border-gray-300 dark:border-gray-600" : ""} flex items-center ${c.align === "left" ? "justify-start" : "justify-center"}`}
                  >
                    <span className="font-robotoMedium text-gray-900 dark:text-white text-sm">
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Table body */}
              {productos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <span className="text-4xl">📋</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                    No hay productos registrados para esta orden
                  </p>
                </div>
              ) : (
                productos.map((row) => {
                  const prodCfg = STATUS_CFG[row.status] ?? STATUS_CFG.sin_pedido;
                  const isNeg = row.diferencia < 0;
                  return (
                    <div
                      key={`${row.master_sku}-${row.sku_thd}`}
                      className={`grid [&>*]:min-w-0 border-b border-gray-200 dark:border-gray-700 ${prodCfg.rowBg}`}
                      style={{ gridTemplateColumns: TABLE_GRID_PROD }}
                    >
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span className="text-gray-700 dark:text-gray-300 text-sm font-mono">
                          {row.master_sku}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span className="text-gray-700 dark:text-gray-300 text-sm font-mono">
                          {row.sku_thd}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center">
                        <span
                          className="text-gray-900 dark:text-gray-100 text-sm truncate"
                          title={row.descripcion ?? undefined}
                        >
                          {row.descripcion}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span className="text-gray-900 dark:text-gray-100 text-sm">
                          {row.total_pedido.toLocaleString("es-MX")}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span className="text-gray-900 dark:text-gray-100 text-sm">
                          {row.total_salida.toLocaleString("es-MX")}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span
                          className={`text-sm font-medium ${
                            isNeg
                              ? "text-red-600 dark:text-red-400"
                              : "text-green-600 dark:text-green-400"
                          }`}
                        >
                          {row.diferencia.toLocaleString("es-MX")}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-1 w-full px-1">
                          <span className={`text-sm font-bold ${pctTextColor(row.pct_cumplimiento)}`}>
                            {formatPct(row.pct_cumplimiento, row.status)}
                          </span>
                          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pctBarColor(row.pct_cumplimiento)}`}
                              style={{ width: `${Math.min(100, row.pct_cumplimiento)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="py-3 px-3 flex items-center justify-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${prodCfg.badgeBg} ${prodCfg.badgeText}`}
                        >
                          {prodCfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function THDComparativo() {
  useDarkMode();

  // Shared filter state
  const [anio, setAnio] = useState(2026);
  const [mes, setMes] = useState(0);
  const [dia, setDia] = useState(0);
  const [categoria, setCategoria] = useState("baños");
  const [viewMode, setViewMode] = useState<"producto" | "orden">("orden");

  // Por Producto state
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ComparativoRow[]>([]);
  const [summary, setSummary] = useState<ComparativoSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("total_pedido");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Por Orden state
  const [ordenData, setOrdenData] = useState<OrdenRow[]>([]);
  const [ordenSummary, setOrdenSummary] = useState<OrdenSummary | null>(null);
  const [ordenLoading, setOrdenLoading] = useState(false);
  const [ordenError, setOrdenError] = useState<string | null>(null);
  const [sortOrdenCol, setSortOrdenCol] = useState<OrdenSortCol>("fecha_orden");
  const [sortOrdenDir, setSortOrdenDir] = useState<SortDir>("desc");

  // Modal state
  const [selectedOrden, setSelectedOrden] = useState<OrdenRow | null>(null);
  const [modalData, setModalData] = useState<DetalleOrdenRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Ordenes-por-producto drill-down (click a product row's "Ver órdenes")
  const [productoOrdenes, setProductoOrdenes] = useState<{ master_sku: string; descripcion: string } | null>(null);
  const [productoOrdenesData, setProductoOrdenesData] = useState<OrdenRow[]>([]);
  const [productoOrdenesLoading, setProductoOrdenesLoading] = useState(false);
  const [productoOrdenesError, setProductoOrdenesError] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  // Nueva Orden HD modal state
  const [showNuevaOrden, setShowNuevaOrden] = useState(false);
  const [folioMode, setFolioMode] = useState<"auto" | "manual">("auto");
  const [folioAuto, setFolioAuto] = useState("");
  const [folioManual, setFolioManual] = useState("");
  const [hdFecha, setHdFecha] = useState(todayISO());
  const [hdAnio, setHdAnio] = useState(2026);
  const [hdCategoria, setHdCategoria] = useState("baños");
  const [hdItems, setHdItems] = useState<{ master_sku: string; cantidad: string }[]>([
    { master_sku: "", cantidad: "1" },
  ]);
  const [hdLoading, setHdLoading] = useState(false);
  const [hdError, setHdError] = useState<string | null>(null);
  const [hdSkuCatalog, setHdSkuCatalog] = useState<SkuOption[]>([]);
  const [hdSkuCatalogLoading, setHdSkuCatalogLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async (a: number, m: number, c: string, d: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ anio: String(a), categoria: c });
      if (m !== 0) params.set("mes", String(m));
      if (d !== 0) params.set("dia", String(d));
      const raw = (await fetchAPI(`/api/thd/comparativo?${params}`)) as Record<string, unknown>;
      const rows = (raw.data ?? raw.rows ?? raw.items ?? []) as ComparativoRow[];
      setData(Array.isArray(rows) ? rows : []);
      setSummary((raw.summary ?? null) as ComparativoSummary | null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrdenData = async (a: number, m: number, c: string, d: number) => {
    setOrdenLoading(true);
    setOrdenError(null);
    try {
      const params = new URLSearchParams({ anio: String(a), categoria: c });
      if (m !== 0) params.set("mes", String(m));
      if (d !== 0) params.set("dia", String(d));
      const raw = (await fetchAPI(`/api/thd/comparativo/ordenes?${params}`)) as Record<string, unknown>;
      const rows = (raw.data ?? raw.rows ?? raw.items ?? []) as OrdenRow[];
      setOrdenData(Array.isArray(rows) ? rows : []);
      setOrdenSummary((raw.summary ?? null) as OrdenSummary | null);
    } catch (err) {
      setOrdenError((err as Error).message);
    } finally {
      setOrdenLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdenData(2026, 0, "baños", 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useRefetchOnFocus(useCallback(() => {
    if (viewMode === "producto") fetchData(anio, mes, categoria, dia);
    else fetchOrdenData(anio, mes, categoria, dia);
  }, [viewMode, anio, mes, categoria, dia]));

  // Fetch per-folio product breakdown when an order is selected
  useEffect(() => {
    if (!selectedOrden) {
      setModalData([]);
      return;
    }
    const loadModal = async () => {
      setModalLoading(true);
      setModalError(null);
      try {
        const raw = (await fetchAPI(
          `/api/thd/comparativo/detalle-orden/${encodeURIComponent(selectedOrden.numero_folio)}`
        )) as Record<string, unknown>;
        const rows = (raw.data ?? []) as DetalleOrdenRow[];
        setModalData(Array.isArray(rows) ? rows : []);
      } catch (err) {
        setModalError((err as Error).message);
      } finally {
        setModalLoading(false);
      }
    };
    loadModal();
  }, [selectedOrden]); // eslint-disable-line react-hooks/exhaustive-deps

  const openProductoOrdenes = async (master_sku: string, descripcion: string) => {
    setProductoOrdenes({ master_sku, descripcion });
    setProductoOrdenesData([]);
    setProductoOrdenesError(null);
    setProductoOrdenesLoading(true);
    try {
      const raw = (await fetchAPI(
        `/api/thd/comparativo/ordenes-por-producto/${encodeURIComponent(master_sku)}?anio=${anio}&categoria=${encodeURIComponent(categoria)}`
      )) as { data?: OrdenRow[] };
      setProductoOrdenesData(raw.data ?? []);
    } catch (err) {
      setProductoOrdenesError((err as Error).message);
    } finally {
      setProductoOrdenesLoading(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleOpenNuevaOrden = () => {
    setFolioMode("auto");
    setFolioAuto("");
    setFolioManual("");
    setHdFecha(todayISO());
    setHdAnio(anio);
    setHdCategoria(categoria);
    setHdItems([{ master_sku: "", cantidad: "1" }]);
    setHdError(null);
    setShowNuevaOrden(true);

    if (hdSkuCatalog.length === 0) {
      setHdSkuCatalogLoading(true);
      fetchAPI("/api/productos?pageSize=100000")
        .then((raw) => {
          const items = ((raw as { items?: { sku: string; name: string }[] }).items ?? []);
          setHdSkuCatalog(items.filter((p) => p.sku).map((p) => ({ sku: p.sku, name: p.name ?? "" })));
        })
        .catch(() => {})
        .finally(() => setHdSkuCatalogLoading(false));
    }

    const currentAnio = anio;
    fetchAPI(`/api/thd/comparativo/ordenes?anio=${currentAnio}`)
      .then((raw) => {
        const rows = ((raw as { data?: { numero_folio: string }[] }).data ?? []);
        const nums = rows.map((r) => Number(r.numero_folio)).filter((n) => !isNaN(n) && n > 0);
        setFolioAuto(String(nums.length > 0 ? Math.max(...nums) + 1 : 1));
      })
      .catch(() => setFolioAuto("1"));
  };

  const hdAddItem = () =>
    setHdItems((prev) => [...prev, { master_sku: "", cantidad: "1" }]);

  const hdRemoveItem = (i: number) =>
    setHdItems((prev) => prev.filter((_, idx) => idx !== i));

  const hdUpdateItem = (i: number, field: "master_sku" | "cantidad", value: string) =>
    setHdItems((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item))
    );

  const handleNuevaOrdenSubmit = async () => {
    const folioStr = folioMode === "auto" ? folioAuto : folioManual.trim();
    if (!folioStr) {
      setHdError("El folio es requerido.");
      return;
    }

    const validItems = hdItems
      .filter((i) => i.master_sku.trim())
      .map((i) => {
        const match = hdSkuCatalog.find((o) => o.sku === i.master_sku.trim());
        return {
          master_sku: Number(i.master_sku.trim()),
          sku_thd: null as string | null,
          descripcion: match?.name ?? (null as string | null),
          cantidad: Math.max(1, Number(i.cantidad) || 1),
        };
      });

    if (validItems.length === 0) {
      setHdError("Agrega al menos un producto.");
      return;
    }

    if (validItems.some((i) => !Number.isInteger(i.master_sku) || i.master_sku <= 0)) {
      setHdError("Selecciona un modelo válido para todos los productos.");
      return;
    }

    setHdLoading(true);
    setHdError(null);
    try {
      await fetchAPI("/api/thd/orden", {
        method: "POST",
        body: JSON.stringify({
          numero_folio: folioStr,
          fecha_orden: hdFecha,
          anio: hdAnio,
          categoria: hdCategoria,
          productos: validItems,
        }),
      });
      setShowNuevaOrden(false);
      setToast({ ok: true, text: `Orden #${folioStr} creada exitosamente.` });
      if (viewMode === "producto") {
        fetchData(anio, mes, categoria, dia);
      } else {
        fetchOrdenData(anio, mes, categoria, dia);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.toLowerCase().includes("ya tiene")) {
        setHdError("Este folio ya tiene pedidos registrados.");
      } else {
        setHdError(msg || "Error al crear la orden.");
      }
    } finally {
      setHdLoading(false);
    }
  };

  const handleBuscar = () => {
    if (viewMode === "producto") {
      fetchData(anio, mes, categoria, dia);
    } else {
      fetchOrdenData(anio, mes, categoria, dia);
    }
  };

  const handleViewMode = (mode: "producto" | "orden") => {
    setViewMode(mode);
    if (mode === "orden" && ordenData.length === 0 && !ordenLoading) {
      fetchOrdenData(anio, mes, categoria, dia);
    }
    if (mode === "producto" && data.length === 0 && !loading) {
      fetchData(anio, mes, categoria, dia);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : "";
      const apiBase =
        import.meta.env.VITE_API_BASE_URL ||
        (import.meta.env.DEV ? "" : "http://localhost:3000");

      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${apiBase}/api/thd/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, string>;
        throw new Error(body.error || body.message || `HTTP ${res.status}`);
      }

      setUploadMsg({ ok: true, text: "Archivo subido correctamente. Actualizando datos..." });
      await fetchData(anio, mes, categoria, dia);
    } catch (err) {
      setUploadMsg({
        ok: false,
        text: `Error al subir archivo: ${(err as Error).message}`,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  // Product sort
  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  // Orden sort
  const handleSortOrden = (col: OrdenSortCol) => {
    if (sortOrdenCol === col) {
      setSortOrdenDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortOrdenCol(col);
      setSortOrdenDir("asc");
    }
  };

  // Product derived data
  const sortedData = [...data].sort((a, b) => {
    const av = a[sortCol];
    const bv = b[sortCol];
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const colAccessors: Record<string, (r: ComparativoRow) => string> = {
    master_sku: (r) => r.master_sku,
    sku_thd: (r) => r.sku_thd,
    descripcion: (r) => r.descripcion,
    status: (r) => STATUS_CFG[r.status]?.label ?? r.status,
  };

  const colFilteredData = sortedData.filter((row) =>
    Object.entries(colFilters).every(
      ([key, vals]) => !vals.length || vals.includes(colAccessors[key](row))
    )
  );

  const searchLower = search.toLowerCase();
  const filteredData = searchLower
    ? colFilteredData.filter(
        (row) =>
          row.master_sku.toLowerCase().includes(searchLower) ||
          row.sku_thd.toLowerCase().includes(searchLower) ||
          row.descripcion.toLowerCase().includes(searchLower)
      )
    : colFilteredData;

  // Orden derived data
  const sortedOrdenData = [...ordenData].sort((a, b) => {
    const av = a[sortOrdenCol];
    const bv = b[sortOrdenCol];
    if (typeof av === "number" && typeof bv === "number") {
      return sortOrdenDir === "asc" ? av - bv : bv - av;
    }
    return sortOrdenDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const sortIcon = (col: SortCol) => {
    if (sortCol !== col) return " ⬍";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const sortOrdenIcon = (col: OrdenSortCol) => {
    if (sortOrdenCol !== col) return " ⬍";
    return sortOrdenDir === "asc" ? " ▲" : " ▼";
  };

  const SortHeader = ({
    col,
    label,
    align = "center",
    last = false,
  }: {
    col: SortCol;
    label: string;
    align?: "left" | "center";
    last?: boolean;
  }) => (
    <button
      onClick={() => handleSort(col)}
      className={`w-full py-4 px-3 ${
        !last ? "border-r border-gray-400 dark:border-gray-600" : ""
      } flex items-center ${
        align === "left" ? "justify-start" : "justify-center"
      } font-robotoMedium text-gray-900 dark:text-white text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors`}
    >
      {label}
      {sortIcon(col)}
    </button>
  );

  const OrdenSortHeader = ({
    col,
    label,
    last = false,
  }: {
    col: OrdenSortCol;
    label: string;
    last?: boolean;
  }) => (
    <button
      onClick={() => handleSortOrden(col)}
      className={`w-full py-4 px-3 ${
        !last ? "border-r border-gray-400 dark:border-gray-600" : ""
      } flex items-center justify-center font-robotoMedium text-gray-900 dark:text-white text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors`}
    >
      {label}
      {sortOrdenIcon(col)}
    </button>
  );

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen">
      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
        <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white mb-4">
          THD Comparativo
        </h1>

        {/* View toggle */}
        <div className="flex gap-1 mb-5">
          <button
            onClick={() => handleViewMode("orden")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              viewMode === "orden"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            Por Orden
          </button>
          <button
            onClick={() => handleViewMode("producto")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              viewMode === "producto"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            Por Producto
          </button>
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
          >
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>

          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
          >
            {MESES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <select
            value={dia}
            onChange={(e) => setDia(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
          >
            {DIAS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>

          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          {viewMode === "producto" && (
            <input
              type="text"
              placeholder="Buscar MOD, SKU THD o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm w-72"
            />
          )}

          <button
            onClick={handleBuscar}
            disabled={loading || ordenLoading}
            className="px-6 py-2 border border-blue-600 text-blue-700 dark:text-blue-400 dark:border-blue-500 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading || ordenLoading ? "Buscando..." : "Buscar"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-6 py-2 border border-green-600 text-green-700 dark:text-green-400 dark:border-green-500 hover:bg-green-600 hover:text-white dark:hover:bg-green-600 dark:hover:text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading ? (
              <>
                <span className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                Subiendo...
              </>
            ) : (
              "⬆ Subir Excel"
            )}
          </button>

          <button
            onClick={handleOpenNuevaOrden}
            className="px-6 py-2 border border-indigo-600 text-indigo-700 dark:text-indigo-400 dark:border-indigo-500 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white rounded-lg transition-colors text-sm font-medium"
          >
            + Nueva Orden HD
          </button>
        </div>

        {/* Upload feedback */}
        {uploadMsg && (
          <div
            className={`mt-4 p-3 border rounded-lg text-sm ${
              uploadMsg.ok
                ? "bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300"
                : "bg-red-100 dark:bg-red-900 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
            }`}
          >
            {uploadMsg.text}
          </div>
        )}

        {/* KPI cards */}
        {viewMode === "producto" ? (
          summary && !loading && (
            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Total Productos
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.total_productos.toLocaleString("es-MX")}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Total Pedido
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.total_pedido.toLocaleString("es-MX")}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Total Salida
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.total_salida.toLocaleString("es-MX")}
                </p>
              </div>
              <div
                className={`border rounded-lg p-4 ${summaryPctClasses(summary.pct_cumplimiento_general)}`}
              >
                <p className="text-xs font-medium uppercase tracking-wide mb-1 opacity-75">
                  % Cumplimiento General
                </p>
                <p className="text-2xl font-bold">
                  {summary.pct_cumplimiento_general.toFixed(1)}%
                </p>
              </div>
            </div>
          )
        ) : (
          ordenSummary && !ordenLoading && (
            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Total Órdenes
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {ordenSummary.total_ordenes.toLocaleString("es-MX")}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Total Pedido
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {ordenSummary.total_pedido.toLocaleString("es-MX")}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Total Salida
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {ordenSummary.total_salida.toLocaleString("es-MX")}
                </p>
              </div>
              <div
                className={`border rounded-lg p-4 ${ordenSummaryPctClasses(ordenSummary.pct_cumplimiento_general)}`}
              >
                <p className="text-xs font-medium uppercase tracking-wide mb-1 opacity-75">
                  % Cumplimiento General
                </p>
                <p className="text-2xl font-bold">
                  {ordenSummary.pct_cumplimiento_general.toFixed(1)}%
                </p>
              </div>
            </div>
          )
        )}
      </div>

      {/* ── Table ── */}
      {viewMode === "producto" ? (
        <div className="flex-1 bg-white dark:bg-gray-800 mx-8 mt-4 mb-8 border border-gray-400 dark:border-gray-700 overflow-hidden flex flex-col rounded-lg">
          {/* Column headers */}
          <div
            className="grid [&>*]:min-w-0 bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-600"
            style={{ gridTemplateColumns: TABLE_GRID_PROD }}
          >
            {([
              { key: "master_sku", label: "MOD", align: "center" as const },
              { key: "sku_thd", label: "SKU THD", align: "center" as const },
              { key: "descripcion", label: "Descripción", align: "left" as const },
            ]).map((c) => (
              <div
                key={c.key}
                className="py-4 px-2 border-r border-gray-400 dark:border-gray-600 flex items-center justify-center"
              >
                <ColumnFilter
                  label={c.label}
                  align={c.align}
                  options={distinctValues(data, colAccessors[c.key])}
                  selected={colFilters[c.key] ?? []}
                  onChange={(next) =>
                    setColFilters((p) => ({ ...p, [c.key]: next }))
                  }
                  sortDir={sortCol === (c.key as SortCol) ? sortDir : null}
                  onSort={(dir) => {
                    setSortCol(c.key as SortCol);
                    setSortDir(dir);
                  }}
                />
              </div>
            ))}
            <SortHeader col="total_pedido" label="Pedido" />
            <SortHeader col="total_salida" label="Salida" />
            <SortHeader col="diferencia" label="Diferencia" />
            <SortHeader col="pct_cumplimiento" label="% Cumplimiento" />
            <div className="py-4 px-2 flex items-center justify-center">
              <ColumnFilter
                label="Status"
                options={distinctValues(data, colAccessors.status)}
                selected={colFilters.status ?? []}
                onChange={(next) =>
                  setColFilters((p) => ({ ...p, status: next }))
                }
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-500 dark:text-gray-400 font-robotoRegular mt-4">
                  Cargando comparativo...
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-red-500 font-robotoMedium">Error al cargar datos</p>
                <p className="text-gray-400 dark:text-gray-500 font-robotoRegular text-sm mt-2">
                  {error}
                </p>
                <button
                  onClick={handleBuscar}
                  className="mt-4 px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors text-sm"
                >
                  Reintentar
                </button>
              </div>
            ) : filteredData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <span className="text-5xl">📋</span>
                <p className="text-gray-500 dark:text-gray-400 font-robotoMedium text-lg mt-2">
                  {data.length === 0
                    ? "Sin datos para mostrar"
                    : "Sin resultados para la búsqueda"}
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-sm">
                  {data.length === 0
                    ? "Sube un archivo Excel para comenzar o ajusta los filtros"
                    : "Intenta con otros términos de búsqueda"}
                </p>
              </div>
            ) : (
              filteredData.map((row) => {
                const cfg = STATUS_CFG[row.status] ?? STATUS_CFG.sin_pedido;
                const isNegDiff = row.diferencia < 0;
                const rowKey = `${row.master_sku}-${row.sku_thd}`;
                const isExpandable = row.status !== "sin_pedido";
                const isExpanded = expandedKey === rowKey;
                return (
                  <Fragment key={rowKey}>
                    <div
                      className={`grid [&>*]:min-w-0 border-b border-gray-200 dark:border-gray-700 ${cfg.rowBg} transition-opacity ${
                        isExpandable ? "cursor-pointer hover:opacity-90" : ""
                      }`}
                      style={{ gridTemplateColumns: TABLE_GRID_PROD }}
                      onClick={
                        isExpandable
                          ? () => setExpandedKey(isExpanded ? null : rowKey)
                          : undefined
                      }
                    >
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span className="text-gray-700 dark:text-gray-300 text-sm font-mono">
                          {row.master_sku}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span className="text-gray-700 dark:text-gray-300 text-sm font-mono">
                          {row.sku_thd}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center gap-2">
                        <span
                          className="text-gray-900 dark:text-gray-100 text-sm truncate"
                          title={row.descripcion ?? undefined}
                        >
                          {row.descripcion}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openProductoOrdenes(row.master_sku, row.descripcion);
                          }}
                          className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap"
                          title="Ver todas las órdenes de este producto"
                        >
                          📦 Órdenes
                        </button>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span className="text-gray-900 dark:text-gray-100 text-sm">
                          {row.total_pedido.toLocaleString("es-MX")}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span className="text-gray-900 dark:text-gray-100 text-sm">
                          {row.total_salida.toLocaleString("es-MX")}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span
                          className={`text-sm font-medium ${
                            isNegDiff
                              ? "text-red-600 dark:text-red-400"
                              : "text-green-600 dark:text-green-400"
                          }`}
                        >
                          {row.diferencia.toLocaleString("es-MX")}
                        </span>
                      </div>
                      <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-1 w-full px-1">
                          <span
                            className={`text-sm font-bold ${pctTextColor(row.pct_cumplimiento)}`}
                          >
                            {formatPct(row.pct_cumplimiento, row.status)}
                          </span>
                          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pctBarColor(row.pct_cumplimiento)}`}
                              style={{ width: `${Math.min(100, row.pct_cumplimiento)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="py-3 px-3 flex items-center justify-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeBg} ${cfg.badgeText}`}
                        >
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                    {isExpanded && (
                      <ExpandedPanel
                        row={row}
                        onRefresh={() => fetchData(anio, mes, categoria, dia)}
                      />
                    )}
                  </Fragment>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* ── Por Orden table ── */
        <div className="flex-1 bg-white dark:bg-gray-800 mx-8 mt-4 mb-8 border border-gray-400 dark:border-gray-700 overflow-hidden flex flex-col rounded-lg">
          {/* Column headers */}
          <div
            className="grid [&>*]:min-w-0 bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-600"
            style={{ gridTemplateColumns: TABLE_GRID_ORDEN }}
          >
            <OrdenSortHeader col="numero_folio" label="Folio" />
            <OrdenSortHeader col="fecha_orden" label="Fecha" />
            <OrdenSortHeader col="total_pedido" label="Pedido" />
            <OrdenSortHeader col="total_salida" label="Salida" />
            <OrdenSortHeader col="diferencia" label="Diferencia" />
            <OrdenSortHeader col="pct_cumplimiento" label="% Cumplimiento" />
            <OrdenSortHeader col="status" label="Status" last />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto">
            {ordenLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-500 dark:text-gray-400 font-robotoRegular mt-4">
                  Cargando órdenes...
                </p>
              </div>
            ) : ordenError ? (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-red-500 font-robotoMedium">Error al cargar datos</p>
                <p className="text-gray-400 dark:text-gray-500 font-robotoRegular text-sm mt-2">
                  {ordenError}
                </p>
                <button
                  onClick={handleBuscar}
                  className="mt-4 px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors text-sm"
                >
                  Reintentar
                </button>
              </div>
            ) : sortedOrdenData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <span className="text-5xl">📦</span>
                <p className="text-gray-500 dark:text-gray-400 font-robotoMedium text-lg mt-2">
                  Sin órdenes para mostrar
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-sm">
                  Ajusta los filtros y haz clic en Buscar
                </p>
              </div>
            ) : (
              sortedOrdenData.map((row) => {
                const cfg = ORDEN_STATUS_CFG[row.status] ?? ORDEN_STATUS_CFG.sin_pedido;
                const isNegDiff = row.diferencia < 0;
                return (
                  <div
                    key={row.numero_folio}
                    className={`grid [&>*]:min-w-0 border-b border-gray-200 dark:border-gray-700 ${cfg.rowBg} cursor-pointer hover:opacity-90 transition-opacity`}
                    style={{ gridTemplateColumns: TABLE_GRID_ORDEN }}
                    onClick={() => setSelectedOrden(row)}
                  >
                    {/* Folio */}
                    <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                      <span className="text-gray-700 dark:text-gray-300 text-sm font-mono">
                        {row.numero_folio}
                      </span>
                    </div>
                    {/* Fecha */}
                    <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                      <span className="text-gray-700 dark:text-gray-300 text-sm">
                        {formatFecha(row.fecha_orden)}
                      </span>
                    </div>
                    {/* Pedido */}
                    <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                      <span className="text-gray-900 dark:text-gray-100 text-sm">
                        {row.total_pedido.toLocaleString("es-MX")}
                      </span>
                    </div>
                    {/* Salida */}
                    <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                      <span className="text-gray-900 dark:text-gray-100 text-sm">
                        {row.total_salida.toLocaleString("es-MX")}
                      </span>
                    </div>
                    {/* Diferencia */}
                    <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                      <span
                        className={`text-sm font-medium ${
                          isNegDiff
                            ? "text-red-600 dark:text-red-400"
                            : "text-green-600 dark:text-green-400"
                        }`}
                      >
                        {row.diferencia.toLocaleString("es-MX")}
                      </span>
                    </div>
                    {/* % Cumplimiento */}
                    <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-1 w-full px-1">
                        <span
                          className={`text-sm font-bold ${ordenPctTextColor(row.pct_cumplimiento)}`}
                        >
                          {formatPct(row.pct_cumplimiento, row.status)}
                        </span>
                        <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${ordenPctBarColor(row.pct_cumplimiento)}`}
                            style={{ width: `${Math.min(100, row.pct_cumplimiento)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    {/* Status */}
                    <div className="py-3 px-3 flex items-center justify-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeBg} ${cfg.badgeText}`}
                      >
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Orden Detail Modal ── */}
      <OrdenModal
        orden={selectedOrden}
        onClose={() => setSelectedOrden(null)}
        modalData={modalData}
        modalLoading={modalLoading}
        modalError={modalError}
      />

      {/* ── Órdenes por producto (drill-down desde "Por Producto") ── */}
      {productoOrdenes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setProductoOrdenes(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Órdenes de {productoOrdenes.descripcion}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  MOD {productoOrdenes.master_sku}
                </p>
              </div>
              <button
                onClick={() => setProductoOrdenes(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none px-1"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-auto mx-6 my-4 border border-gray-300 dark:border-gray-600 rounded-lg">
              {productoOrdenesLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : productoOrdenesError ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <p className="text-red-500 font-medium text-sm">Error al cargar órdenes</p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">{productoOrdenesError}</p>
                </div>
              ) : productoOrdenesData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <span className="text-4xl">📦</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Este producto no aparece en ninguna orden todavía
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="grid [&>*]:min-w-0 bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-300 dark:border-gray-600 sticky top-0"
                    style={{ gridTemplateColumns: TABLE_GRID_ORDEN }}
                  >
                    {["Folio", "Fecha", "Pedido", "Salida", "Diferencia", "% Cumplimiento", "Status"].map((label, i, arr) => (
                      <div
                        key={label}
                        className={`py-3 px-3 ${i < arr.length - 1 ? "border-r border-gray-300 dark:border-gray-600" : ""} flex items-center justify-center`}
                      >
                        <span className="font-robotoMedium text-gray-900 dark:text-white text-sm">{label}</span>
                      </div>
                    ))}
                  </div>
                  {productoOrdenesData.map((row) => {
                    const cfg = ORDEN_STATUS_CFG[row.status] ?? ORDEN_STATUS_CFG.sin_pedido;
                    const isNeg = row.diferencia < 0;
                    return (
                      <div
                        key={row.numero_folio}
                        className={`grid [&>*]:min-w-0 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 ${cfg.rowBg}`}
                        style={{ gridTemplateColumns: TABLE_GRID_ORDEN }}
                        onClick={() => { setProductoOrdenes(null); setSelectedOrden(row); }}
                      >
                        <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                          <span className="text-blue-600 dark:text-blue-400 text-sm font-mono">{row.numero_folio}</span>
                        </div>
                        <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm text-gray-600 dark:text-gray-400">
                          {formatFecha(row.fecha_orden)}
                        </div>
                        <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm">
                          {row.total_pedido.toLocaleString("es-MX")}
                        </div>
                        <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm">
                          {row.total_salida.toLocaleString("es-MX")}
                        </div>
                        <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                          <span className={`text-sm font-medium ${isNeg ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                            {row.diferencia.toLocaleString("es-MX")}
                          </span>
                        </div>
                        <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                          <span className={`text-sm font-bold ${pctTextColor(row.pct_cumplimiento)}`}>
                            {formatPct(row.pct_cumplimiento, row.status)}
                          </span>
                        </div>
                        <div className="py-3 px-3 flex items-center justify-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeBg} ${cfg.badgeText}`}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Nueva Orden HD Modal ── */}
      {showNuevaOrden && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-xl flex flex-col max-h-[90vh] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-robotoMedium text-gray-900 dark:text-white">
                Nueva Orden HD
              </h2>
              <button
                onClick={() => setShowNuevaOrden(false)}
                disabled={hdLoading}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
              {/* Inline error */}
              {hdError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/40 border border-red-300 dark:border-red-600 text-red-800 dark:text-red-200 text-sm">
                  <span className="shrink-0">⚠️</span>
                  <span className="font-robotoRegular">{hdError}</span>
                </div>
              )}

              {/* Folio */}
              <div>
                <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1.5">
                  Folio <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4 mb-2">
                  {(["auto", "manual"] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="folioMode"
                        checked={folioMode === mode}
                        onChange={() => setFolioMode(mode)}
                        className="accent-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {mode === "auto" ? "Automático" : "Manual"}
                      </span>
                    </label>
                  ))}
                </div>
                {folioMode === "auto" ? (
                  <input
                    type="text"
                    disabled
                    value={folioAuto ? `#${folioAuto}` : "Calculando…"}
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 text-sm cursor-not-allowed"
                  />
                ) : (
                  <input
                    type="text"
                    value={folioManual}
                    onChange={(e) => setFolioManual(e.target.value)}
                    placeholder="Ej. 410"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                )}
              </div>

              {/* Fecha de orden */}
              <div>
                <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1.5">
                  Fecha de orden <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={hdFecha}
                  onChange={(e) => setHdFecha(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
              </div>

              {/* Año + Categoría */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1.5">
                    Año
                  </label>
                  <select
                    value={hdAnio}
                    onChange={(e) => setHdAnio(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  >
                    <option value={2025}>2025</option>
                    <option value={2026}>2026</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1.5">
                    Categoría
                  </label>
                  <select
                    value={hdCategoria}
                    onChange={(e) => setHdCategoria(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Productos */}
              <div>
                <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2">
                  Productos
                </label>
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_6rem_2rem] gap-2 px-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-robotoMedium">
                      Modelo / MOD
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-robotoMedium text-center">
                      Cantidad
                    </span>
                    <span />
                  </div>
                  {hdItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_6rem_2rem] gap-2 items-center">
                      <SkuCombobox
                        value={item.master_sku}
                        onChange={(sku) => {
                          hdUpdateItem(i, "master_sku", sku);
                          if (hdError) setHdError(null);
                        }}
                        options={hdSkuCatalog}
                        loading={hdSkuCatalogLoading}
                        invalid={
                          !!item.master_sku.trim() &&
                          hdSkuCatalog.length > 0 &&
                          !hdSkuCatalog.some((o) => o.sku === item.master_sku.trim())
                        }
                      />
                      <input
                        type="number"
                        min={1}
                        value={item.cantidad}
                        onChange={(e) => hdUpdateItem(i, "cantidad", e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                      <button
                        onClick={() => hdRemoveItem(i)}
                        disabled={hdItems.length === 1}
                        className="flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-0 disabled:pointer-events-none"
                        title="Eliminar fila"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={hdAddItem}
                  className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-robotoMedium transition-colors"
                >
                  + Agregar producto
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowNuevaOrden(false)}
                disabled={hdLoading}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-robotoMedium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleNuevaOrdenSubmit}
                disabled={hdLoading || !hdFecha || (folioMode === "manual" && !folioManual.trim())}
                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-robotoMedium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {hdLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Guardando…
                  </>
                ) : (
                  "Guardar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-sm w-full p-4 rounded-lg shadow-lg border ${
            toast.ok
              ? "bg-green-50 dark:bg-green-900/80 border-green-300 dark:border-green-600 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-900/80 border-red-300 dark:border-red-600 text-red-800 dark:text-red-200"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="font-robotoRegular text-sm">{toast.text}</span>
            <button
              onClick={() => setToast(null)}
              className="text-current opacity-60 hover:opacity-100 text-xs leading-none shrink-0 mt-0.5"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
