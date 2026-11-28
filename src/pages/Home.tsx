// Dashboard home page: KPI cards, sales charts, and top products/alerts.
import { useState, useEffect, useCallback } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { api } from "../lib/api";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { getMonterreyNow } from "../lib/dateMx";
import { ProductLabelModal } from "../components/ProductLabelModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardKpi = {
  ventasSemana: number;
  ventasMes: number;
  pedidosPendientes: number;
  productosEnAlerta: number;
};

type VentaMes = { mes: string; monto: number };
type TopProducto = { nombre: string; unidades: number };
type ProductoAlerta = { nombre: string; diasCobertura: number; semaforo: "CRITICO" | "ALERTA" };
type CatalogoProducto = { id: string; nombre: string; codigo: string };

// Shape of GET /api/dashboard and GET /api/products (only the fields this page reads).
type DashboardResponse = {
  kpi: DashboardKpi;
  ventasSemanas: { semana_label?: string | null; semana_num: number; monto: number | string }[];
  ventasMeses: { anio_real: number; mes_num: number; monto: number | string }[];
  topProductos: { nombre: string; unidades: number | string }[];
  productosAlerta: { nombre: string; diasCobertura: number | string; semaforo: string }[];
};
type ProductosResponse = { items?: { id: number | string; name: string; sku: string }[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtImporte(n: number) {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

const MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function getLast6Months(): { key: string; mes: string }[] {
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = getMonterreyNow();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    result.push({ key, mes: MESES_ES[d.getUTCMonth()] });
  }
  return result;
}

function currentMonthLabel(): string {
  const d = getMonterreyNow();
  return `${MESES_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ─── Charts ───────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; monto: number }[] }) {
  const maxMonto = Math.max(...data.map((v) => v.monto), 1);
  const niceMax = Math.ceil(maxMonto / 5000) * 5000 || 5000;
  const W = 400, H = 200;
  const padL = 60, padR = 10, padT = 10, padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const spacing = chartW / Math.max(data.length, 1);
  const barW = spacing * 0.55;
  const yTicks = [0, 1, 2, 3, 4].map((i) => Math.round((niceMax / 4) * i));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      {yTicks.map((tick) => {
        const y = padT + chartH - (tick / niceMax) * chartH;
        return (
          <g key={tick}>
            <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4,3" />
            <text x={padL - 5} y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">
              {tick === 0 ? "0" : `$${(tick / 1000).toFixed(0)}k`}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = padL + i * spacing + (spacing - barW) / 2;
        const barH = (d.monto / niceMax) * chartH;
        const y = padT + chartH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill="#3b82f6" opacity="0.85" />
            <text x={x + barW / 2} y={H - padB + 16} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">
              {d.label}
            </text>
          </g>
        );
      })}
      <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke="#d1d5db" strokeWidth="1" />
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#d1d5db" strokeWidth="1" />
    </svg>
  );
}

function LineChart({ data }: { data: VentaMes[] }) {
  const maxMonto = Math.max(...data.map((d) => d.monto), 1);
  const niceMax = Math.ceil(maxMonto / 50000) * 50000 || 50000;
  const W = 400, H = 200;
  const padL = 65, padR = 15, padT = 10, padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const yTicks = [0, 1, 2, 3, 4].map((i) => Math.round((niceMax / 4) * i));

  const pts = data.map((d, i) => ({
    x: padL + (data.length > 1 ? (i / (data.length - 1)) : 0) * chartW,
    y: padT + chartH - (d.monto / niceMax) * chartH,
    mes: d.mes,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = pts.length > 0
    ? `${linePath} L ${pts[pts.length - 1].x} ${padT + chartH} L ${pts[0].x} ${padT + chartH} Z`
    : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      {yTicks.map((tick) => {
        const y = padT + chartH - (tick / niceMax) * chartH;
        return (
          <g key={tick}>
            <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4,3" />
            <text x={padL - 5} y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">
              {tick === 0 ? "0" : `$${(tick / 1000).toFixed(0)}k`}
            </text>
          </g>
        );
      })}
      {areaPath && <path d={areaPath} fill="#3b82f6" opacity="0.07" />}
      {pts.length > 1 && (
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {pts.map((p) => (
        <circle key={p.mes} cx={p.x} cy={p.y} r="4" fill="white" stroke="#3b82f6" strokeWidth="2" />
      ))}
      {pts.map((p) => (
        <text key={p.mes} x={p.x} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#9ca3af" fontFamily="sans-serif">
          {p.mes}
        </text>
      ))}
      <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke="#d1d5db" strokeWidth="1" />
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#d1d5db" strokeWidth="1" />
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ title, value, icon, accent, delta }: {
  title: string; value: string; icon: string; accent: string; delta: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
        <span className={`text-base ${accent} p-1.5 rounded-lg`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{delta}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Home() {
  useDarkMode();

  const [kpi, setKpi] = useState<DashboardKpi>({
    ventasSemana: 0, ventasMes: 0, pedidosPendientes: 0, productosEnAlerta: 0,
  });
  const [ventasSemanas, setVentasSemanas] = useState<{ label: string; monto: number }[]>([]);
  const [ventasMeses, setVentasMeses] = useState<VentaMes[]>([]);
  const [topProductos, setTopProductos] = useState<TopProducto[]>([]);
  const [productosAlerta, setProductosAlerta] = useState<ProductoAlerta[]>([]);
  const [catalogoProductos, setCatalogoProductos] = useState<CatalogoProducto[]>([]);
  const [loading, setLoading] = useState(true);

  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [barcodeSuggestOpen, setBarcodeSuggestOpen] = useState(false);
  const [selectedForLabels, setSelectedForLabels] = useState<CatalogoProducto[]>([]);
  const [etiquetaVisible, setEtiquetaVisible] = useState(false);

  const load = useCallback(async () => {
      try {
        const [dashData, productosData] = await Promise.all([
          api.getDashboard() as Promise<DashboardResponse>,
          api.getProductosCatalogo(50) as Promise<ProductosResponse>,
        ]);

        setKpi(dashData.kpi);

        // Weekly chart, use semana_label as x-axis label
        setVentasSemanas(
          dashData.ventasSemanas.map((v) => ({
            label: String(v.semana_label ?? `S${v.semana_num}`),
            monto: Number(v.monto),
          }))
        );

        // Monthly chart, fill in last 6 months, zeros for missing
        const last6 = getLast6Months();
        const mesMap = new Map<string, number>(
          dashData.ventasMeses.map((v) => [
            `${v.anio_real}-${String(v.mes_num).padStart(2, "0")}`,
            Number(v.monto),
          ])
        );
        setVentasMeses(last6.map(({ key, mes }) => ({ mes, monto: mesMap.get(key) ?? 0 })));

        setTopProductos(
          dashData.topProductos.map((p) => ({
            nombre: p.nombre as string,
            unidades: Number(p.unidades),
          }))
        );

        setProductosAlerta(
          dashData.productosAlerta.map((p) => ({
            nombre: p.nombre as string,
            diasCobertura: Number(p.diasCobertura),
            semaforo: p.semaforo as "CRITICO" | "ALERTA",
          }))
        );

        const items = productosData.items ?? [];
        setCatalogoProductos(
          items.map((p) => ({
            id: String(p.id),
            nombre: p.name as string,
            codigo: p.sku as string,
          }))
        );
      } catch (err) {
        console.error("Error loading dashboard:", err);
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRefetchOnFocus(load);

  const barcodeSuggestions = barcodeSearch.trim()
    ? catalogoProductos.filter(
        (p) =>
          p.nombre.toLowerCase().includes(barcodeSearch.trim().toLowerCase()) ||
          p.codigo.toLowerCase().includes(barcodeSearch.trim().toLowerCase())
      ).slice(0, 8)
    : [];

  const handleSelectBarcodeProduct = (p: CatalogoProducto) => {
    setBarcodeSearch("");
    setBarcodeSuggestOpen(false);
    setSelectedForLabels((prev) =>
      prev.some((sel) => sel.id === p.id) ? prev : [...prev, p]
    );
  };

  const handleRemoveFromLabels = (id: string) => {
    setSelectedForLabels((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="flex-1 bg-gray-50 dark:bg-gray-900 min-h-screen overflow-auto">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
        <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white">Inicio</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Resumen general de {currentMonthLabel()}
        </p>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* ── KPI Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            title="Ventas semana"
            value={loading ? "-" : fmtImporte(kpi.ventasSemana)}
            icon="💰"
            accent="text-blue-500 bg-blue-50 dark:bg-blue-900/20"
            delta="Semana más reciente (HD)"
          />
          <KpiCard
            title="Ventas del mes"
            value={loading ? "-" : fmtImporte(kpi.ventasMes)}
            icon="📈"
            accent="text-green-500 bg-green-50 dark:bg-green-900/20"
            delta={`${currentMonthLabel()} (HD)`}
          />
          <KpiCard
            title="Pedidos pendientes"
            value={loading ? "-" : String(kpi.pedidosPendientes)}
            icon="📦"
            accent="text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
            delta="Sin fecha de llegada"
          />
          <KpiCard
            title="Productos en alerta"
            value={loading ? "-" : String(kpi.productosEnAlerta)}
            icon="⚠️"
            accent="text-red-500 bg-red-50 dark:bg-red-900/20"
            delta="Crítico o alerta de cobertura"
          />
        </div>

        {/* ── Charts ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Ventas por semana (últimas 7 semanas)
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Home Depot: importe MXN</p>
            <div className="h-44">
              {loading ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">Cargando…</div>
              ) : (
                <BarChart data={ventasSemanas} />
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Ventas mensuales (últimos 6 meses)
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Home Depot: importe MXN</p>
            <div className="h-44">
              {loading ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">Cargando…</div>
              ) : (
                <LineChart data={ventasMeses} />
              )}
            </div>
          </div>
        </div>

        {/* ── Top productos & Alertas ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Top 5 productos más vendidos
            </h2>
            {loading ? (
              <div className="text-xs text-gray-400">Cargando…</div>
            ) : topProductos.length === 0 ? (
              <div className="text-xs text-gray-400">Sin ventas registradas este año</div>
            ) : (
              <div className="space-y-3">
                {topProductos.map((p, i) => {
                  const pct = (p.unidades / topProductos[0].unidades) * 100;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400 truncate max-w-[220px]">{p.nombre}</span>
                        <span className="text-gray-700 dark:text-gray-300 font-medium ml-2 shrink-0">
                          {p.unidades.toLocaleString()} uds
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                        <div className="h-2 bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Productos en alerta de cobertura
            </h2>
            {loading ? (
              <div className="text-xs text-gray-400">Cargando…</div>
            ) : productosAlerta.length === 0 ? (
              <div className="text-xs text-gray-400">No hay productos en alerta</div>
            ) : (
              <div className="space-y-3">
                {productosAlerta.map((item, i) => {
                  const umbral = item.semaforo === "CRITICO" ? 60 : 80;
                  const pct = Math.min(Math.round((item.diasCobertura / umbral) * 100), 100);
                  const color = item.semaforo === "CRITICO" ? "bg-red-400" : "bg-yellow-400";
                  const textColor = item.semaforo === "CRITICO" ? "text-red-500" : "text-yellow-500";
                  const badge = item.semaforo === "CRITICO"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{item.nombre}</p>
                          <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${badge}`}>
                            {item.semaforo === "CRITICO" ? "Crítico" : "Alerta"}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                          <div className={`h-1.5 ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className={`text-right shrink-0 text-xs font-semibold ${textColor}`}>
                        {item.diasCobertura}d
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Impresión de barcode ────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 max-w-lg">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Imprimir barcodes de producto
          </h2>

          {loading || catalogoProductos.length === 0 ? (
            <div className="text-xs text-gray-400">
              {loading ? "Cargando productos…" : "No hay productos disponibles"}
            </div>
          ) : (
            <div>
              <div className="relative">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Buscar producto por nombre o MOD
                </label>
                <input
                  type="text"
                  value={barcodeSearch}
                  onChange={(e) => {
                    setBarcodeSearch(e.target.value);
                    setBarcodeSuggestOpen(true);
                  }}
                  onFocus={() => setBarcodeSuggestOpen(true)}
                  onBlur={() => setTimeout(() => setBarcodeSuggestOpen(false), 150)}
                  placeholder="Escribe para buscar y agregar…"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {barcodeSuggestOpen && barcodeSuggestions.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-56 overflow-auto">
                    {barcodeSuggestions.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectBarcodeProduct(p)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200"
                        >
                          {p.nombre} <span className="text-gray-400 font-mono text-xs">({p.codigo})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedForLabels.length > 0 && (
                <ul className="mt-3 space-y-1 max-h-40 overflow-auto">
                  {selectedForLabels.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700 rounded px-3 py-1.5"
                    >
                      <span className="text-gray-800 dark:text-gray-200 truncate">
                        {p.nombre} <span className="text-gray-400 font-mono text-xs">({p.codigo})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromLabels(p.id)}
                        className="text-gray-400 hover:text-red-500 ml-2 shrink-0"
                        aria-label="Quitar"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => setEtiquetaVisible(true)}
                disabled={selectedForLabels.length === 0}
                className="w-full mt-3 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Imprimir etiquetas{selectedForLabels.length > 0 ? ` (${selectedForLabels.length})` : ""}
              </button>
            </div>
          )}
        </div>
      </div>

      <ProductLabelModal
        visible={etiquetaVisible}
        masterSkus={selectedForLabels.map((p) => p.codigo)}
        onClose={() => setEtiquetaVisible(false)}
      />
    </div>
  );
}
