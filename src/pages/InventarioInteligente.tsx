// Smart inventory page: applies the replenishment model to flag products
// by semaforo status and estimate container fill.
import { useState, useEffect, useCallback, useMemo } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import {
  calculateResults,
  sortResults,
  DEFAULT_PARAMS,
  type ModelParams,
  type ProductResult,
  type InventoryStatus,
} from "../lib/inventoryModel";

// ─── Tipos de la recomendación MILP (GET /api/reabasto/contenedores) ────────
type AsignacionSKU = {
  mod: string;
  desc: string;
  factory: string;
  categoria: "OBLIGATORIO" | "DESEABLE" | "ADELANTABLE";
  urgencia: string;
  cajas: number;
  pzsCaja: number;
  pzs: number;
  pesoKg: number;
  volM3: number;
};

type ContenedorResuelto = {
  indice: number;
  tipo: string;
  pesoMaxKg: number;
  volMaxM3: number;
  pctPeso: number;
  pctVol: number;
  justificadoPor: string;
  esValido: boolean;
  asignaciones: AsignacionSKU[];
};

type SolucionSerialized = {
  configuracion: string;
  nBins: number;
  pesoTotalKg: number;
  volTotalM3: number;
  pctPesoProm: number;
  pctVolProm: number;
  todosValidos: boolean;
  detalle: {
    obligatoriosCubiertos?: string;
    coberturaPromDias?: number;
  };
  contenedores: ContenedorResuelto[];
};

type ReabastoPorFactory = Record<string, SolucionSerialized[] | { error: string }>;

type RankingProveedor = {
  factory: string;
  categoria: "CRITICO" | "URGENTE" | "PROXIMO" | "SIN_PRISA";
  urgenciaScore: number;
  nSkus: number;
  nVencidos: number;
  nUrgentes: number;
  nProximos: number;
  diasAlPrimerLimite: number;
  descMasUrgente: string;
};

const CATEGORIA_PROVEEDOR_CFG: Record<RankingProveedor["categoria"], { label: string; dot: string; badge: string }> = {
  CRITICO: { label: "Crítico", dot: "🔴", badge: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" },
  URGENTE: { label: "Urgente", dot: "🟠", badge: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300" },
  PROXIMO: { label: "Próximo", dot: "🟡", badge: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300" },
  SIN_PRISA: { label: "Sin prisa", dot: "🟢", badge: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" },
};

// ─── Helpers de estilo por estado ────────────────────────────────────────────
const STATUS_CFG: Record<
  InventoryStatus,
  {
    label: string;
    dot: string;
    rowBg: string;
    badgeBg: string;
    badgeText: string;
    border: string;
  }
> = {
  rojo: {
    label: "Crítico",
    dot: "🔴",
    rowBg: "bg-red-50 dark:bg-red-950/30",
    badgeBg: "bg-red-100 dark:bg-red-900/50",
    badgeText: "text-red-700 dark:text-red-300",
    border: "border-l-4 border-l-red-500",
  },
  amarillo: {
    label: "Alerta",
    dot: "🟡",
    rowBg: "bg-yellow-50 dark:bg-yellow-950/20",
    badgeBg: "bg-yellow-100 dark:bg-yellow-900/40",
    badgeText: "text-yellow-700 dark:text-yellow-300",
    border: "border-l-4 border-l-yellow-400",
  },
  verde: {
    label: "OK",
    dot: "🟢",
    rowBg: "",
    badgeBg: "bg-green-100 dark:bg-green-900/40",
    badgeText: "text-green-700 dark:text-green-300",
    border: "border-l-4 border-l-green-400",
  },
  sin_datos: {
    label: "Sin datos",
    dot: "⚫",
    rowBg: "bg-gray-50 dark:bg-gray-800/30",
    badgeBg: "bg-gray-100 dark:bg-gray-700",
    badgeText: "text-gray-500 dark:text-gray-400",
    border: "border-l-4 border-l-gray-300",
  },
  sobrestock: {
    label: "Sobrestock",
    dot: "🔵",
    rowBg: "bg-blue-50 dark:bg-blue-950/20",
    badgeBg: "bg-blue-100 dark:bg-blue-900/40",
    badgeText: "text-blue-700 dark:text-blue-300",
    border: "border-l-4 border-l-blue-400",
  },
};

function fmt(n: number, dec = 0) {
  return n.toLocaleString("es-MX", { maximumFractionDigits: dec });
}

function fmtDias(d: number) {
  if (d >= 9999) return "-";
  if (d > 999) return "+999";
  return fmt(d, 1) + "d";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InventarioInteligente() {
  useDarkMode();

  // ── State ──────────────────────────────────────────────────────────────────
  const [rawItems, setRawItems] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Demanda calculada automáticamente desde ventas Home Depot
  const [hdDailyDemand, setHdDailyDemand] = useState<Record<string, number>>({});
  const [loadingHD, setLoadingHD] = useState(false);

  // Parámetros del modelo (solo configuración global, no edición por fila)
  const [params, setParams] = useState<ModelParams>(DEFAULT_PARAMS);
  const [showConfig, setShowConfig] = useState(false);

  // UI
  const [tab, setTab] = useState<"status" | "containers">("status");
  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterStatus, setFilterStatus] = useState<InventoryStatus | "">("");
  const [filterModelo, setFilterModelo] = useState<"" | "si" | "no">("si");
  const [filterEstadoProducto, setFilterEstadoProducto] = useState<"" | "activo" | "inactivo" | "special_buy">("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // ── Fetch productos desde Odoo ────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: unknown[] = [];
      let pg = 1;
      while (true) {
        const res = (await fetchAPI(
          `/api/odoo/productos?page=${pg}&pageSize=100`,
        )) as { items?: unknown[]; total?: number };
        const items: unknown[] = res.items || [];
        all.push(...items);
        const total: number = res.total || 0;
        if (all.length >= total || items.length === 0) break;
        pg++;
        if (pg > 30) break;
      }
      setRawItems(all);
      setPage(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHdDailyDemand = useCallback(async () => {
    setLoadingHD(true);
    try {
      const data = (await fetchAPI("/api/ventas-hd/demanda-diaria")) as {
        mod: string;
        demanda_diaria: number;
      }[];
      const map: Record<string, number> = {};
      for (const item of data) {
        if (item.demanda_diaria > 0) map[item.mod] = item.demanda_diaria;
      }
      setHdDailyDemand(map);
    } catch {
      // silencioso: el modelo muestra sin_datos para esos MODs
    } finally {
      setLoadingHD(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchHdDailyDemand();
  }, [fetchAll, fetchHdDailyDemand]);

  useRefetchOnFocus(useCallback(() => {
    fetchAll();
    fetchHdDailyDemand();
  }, [fetchAll, fetchHdDailyDemand]));

  // ── Calcular resultados ────────────────────────────────────────────────────
  const results: ProductResult[] = useMemo(() => {
    const inputs = rawItems.map((item) => {
      const i = item as Record<string, unknown>;
      // master_sku en articulos = default_code en Odoo = MOD del producto
      const mod = String(i.master_sku ?? i.id_articulo ?? "");
      return {
        sku: mod,
        name: String(i.nombre_producto ?? ""),
        supplier: String(i.proveedor_nombre || "Sin proveedor"),
        supplierId:
          i.id_proveedor !== undefined ? Number(i.id_proveedor) : undefined,
        stock: Number(i.existencias) || 0,
        weightKg: Number(i.peso_kg) || 0,
        qtyPerCarton: i.cantidad_x_ctn != null ? Number(i.cantidad_x_ctn) : null,
        dimensionsCm:
          i.largo_cm || i.ancho_cm || i.alto_cm
            ? {
                largo: Number(i.largo_cm) || 0,
                ancho: Number(i.ancho_cm) || 0,
                alto: Number(i.alto_cm) || 0,
              }
            : undefined,
        piecesInTransit: 0,
        // Cruce por MOD: hdDailyDemand tiene keys = String(mod)
        dailyDemand: hdDailyDemand[mod] || 0,
        // Switch "tomar en cuenta en modelo matemático" del modal de edición
        consideraModelo: i.considerar_modelo_matematico !== false,
        estadoProducto: (i.estado as "activo" | "inactivo" | "special_buy") ?? "activo",
      };
    });
    // El motor de cálculo solo debe operar sobre los productos marcados para
    // el modelo; los demás se conservan aparte para el filtro "Considerado en modelo".
    const consideradosCalculados = sortResults(
      calculateResults(
        inputs.filter((i) => i.consideraModelo),
        params,
      ),
    );
    const noConsiderados: ProductResult[] = inputs
      .filter((i) => !i.consideraModelo)
      .map((i) => ({
        ...i,
        effectiveInventory: i.stock,
        inventoryDays: 9999,
        status: "sin_datos" as InventoryStatus,
        isOverstock: false,
        daysToRed: null,
        redDate: null,
        piecesNeeded: 0,
        piecesToOrder: 0,
        volumeM3: 0,
      }));
    return [...consideradosCalculados, ...noConsiderados];
  }, [rawItems, hdDailyDemand, params]);

  // ── Filtro por consideración en el modelo ─────────────────────────────────
  const modeloFiltered = useMemo(() => {
    if (filterModelo === "si") return results.filter((r) => r.consideraModelo);
    if (filterModelo === "no") return results.filter((r) => !r.consideraModelo);
    return results;
  }, [results, filterModelo]);

  // ── Conteos de semáforo ───────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { rojo: 0, amarillo: 0, verde: 0, sin_datos: 0, sobrestock: 0 };
    for (const r of modeloFiltered) c[r.status]++;
    return c;
  }, [modeloFiltered]);

  // ── Proveedores únicos ────────────────────────────────────────────────────
  const suppliers = useMemo(
    () => [...new Set(modeloFiltered.map((r) => r.supplier))].sort(),
    [modeloFiltered],
  );

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = modeloFiltered;
    if (filterStatus) list = list.filter((r) => r.status === filterStatus);
    if (filterSupplier)
      list = list.filter((r) => r.supplier === filterSupplier);
    if (filterEstadoProducto)
      list = list.filter((r) => r.estadoProducto === filterEstadoProducto);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [modeloFiltered, filterStatus, filterSupplier, filterEstadoProducto, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filterModelo, filterStatus, filterSupplier, filterEstadoProducto, search]);

  // ── Contenedores: primero elegir proveedor, luego pedir su óptimo al MILP ──
  const [ranking, setRanking] = useState<RankingProveedor[] | null>(null);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [errorRanking, setErrorRanking] = useState<string | null>(null);
  const [rankingFetched, setRankingFetched] = useState(false);

  const [selectedFactory, setSelectedFactory] = useState<string | null>(null);
  const [solucionCache, setSolucionCache] = useState<ReabastoPorFactory>({});
  const [loadingFactory, setLoadingFactory] = useState<string | null>(null);
  const [errorFactory, setErrorFactory] = useState<string | null>(null);

  const fetchRanking = useCallback(async () => {
    setLoadingRanking(true);
    setErrorRanking(null);
    try {
      const res = (await fetchAPI("/api/reabasto/ranking")) as { data: RankingProveedor[] };
      setRanking(res.data);
    } catch (e) {
      setErrorRanking((e as Error).message);
    } finally {
      setLoadingRanking(false);
      setRankingFetched(true);
    }
  }, []);

  useEffect(() => {
    if (tab === "containers" && !rankingFetched) fetchRanking();
  }, [tab, rankingFetched, fetchRanking]);

  const selectFactory = useCallback(async (factory: string, force = false) => {
    setSelectedFactory(factory);
    if (!force && solucionCache[factory]) return;
    setLoadingFactory(factory);
    setErrorFactory(null);
    try {
      const res = (await fetchAPI(
        `/api/reabasto/contenedores?factory=${encodeURIComponent(factory)}`,
      )) as { soluciones: SolucionSerialized[] };
      setSolucionCache((prev) => ({ ...prev, [factory]: res.soluciones }));
    } catch (e) {
      setErrorFactory((e as Error).message);
    } finally {
      setLoadingFactory(null);
    }
  }, [solucionCache]);

  const updateParam = (key: keyof ModelParams, value: string) => {
    const num = parseFloat(value);
    setParams((prev) => ({ ...prev, [key]: isNaN(num) ? prev[key] : num }));
  };

  const isLoadingAny = loading || loadingHD;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              🧠 Inventario Inteligente
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Demanda calculada de ventas Home Depot · {rawItems.length} productos
              {loadingHD && (
                <span className="ml-2 text-blue-500 animate-pulse">· cargando demanda HD…</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                showConfig
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              ⚙️ Parámetros
            </button>
            <button
              onClick={() => {
                fetchAll();
                fetchHdDailyDemand();
                if (tab === "containers") {
                  fetchRanking();
                  if (selectedFactory) selectFactory(selectedFactory, true);
                }
              }}
              disabled={isLoadingAny}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-all disabled:opacity-60"
            >
              {isLoadingAny ? "⏳ Cargando…" : "🔄 Actualizar"}
            </button>
          </div>
        </div>

        {/* Config Panel */}
        {showConfig && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-850">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Parámetros del modelo
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {(
                [
                  { key: "leadTimeDays", label: "Lead time (días)" },
                  { key: "targetDays", label: "Cobertura objetivo (días)" },
                  { key: "redAlertDays", label: "Umbral crítico (días)" },
                  { key: "yellowAlertDays", label: "Umbral alerta (días)" },
                  { key: "minPiecesPerSku", label: "Mín. piezas / MOD" },
                ] as { key: keyof ModelParams; label: string }[]
              ).map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {label}
                  </label>
                  <input
                    type="number"
                    value={params[key] as number}
                    onChange={(e) => updateParam(key, e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(
          [
            { key: "rojo", label: "Crítico" },
            { key: "amarillo", label: "Alerta" },
            { key: "verde", label: "OK" },
            { key: "sin_datos", label: "Sin datos HD" },
            { key: "sobrestock", label: "Sobrestock" },
          ] as { key: InventoryStatus; label: string }[]
        ).map(({ key, label }) => {
          const cfg = STATUS_CFG[key];
          const active = filterStatus === key;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(active ? "" : key)}
              className={`rounded-xl p-4 text-left transition-all hover:scale-[1.02] border-2 ${
                active
                  ? `${cfg.badgeBg} border-current`
                  : "bg-white dark:bg-gray-800 border-transparent hover:border-gray-200 dark:hover:border-gray-600 shadow-sm"
              }`}
            >
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                {fmt(counts[key])}
              </div>
              <div className={`text-sm font-medium mt-0.5 ${cfg.badgeText}`}>
                {cfg.dot} {label}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Banner sin datos HD ────────────────────────────────────────────── */}
      {counts.sin_datos > 0 && !loadingHD && (
        <div className="mx-6 mb-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
          <strong>ℹ️ {counts.sin_datos} productos sin ventas HD registradas.</strong>{" "}
          Estos MODs no tienen historial en la tabla de ventas semanales de Home Depot
          y no pueden ser evaluados por el modelo.
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="px-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex gap-1">
          {(
            [
              { id: "status", label: "📊 Semáforo" },
              { id: "containers", label: "🚢 Contenedores" },
            ] as { id: "status" | "containers"; label: string }[]
          ).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          ❌ {error}
        </div>
      )}

      {isLoadingAny && rawItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-bounce">🧠</div>
            <p className="text-gray-500 dark:text-gray-400">Cargando datos…</p>
          </div>
        </div>
      ) : (
        <>
          {tab === "status" && (
            <StatusTab
              paginated={paginated}
              filtered={filtered}
              suppliers={suppliers}
              filterSupplier={filterSupplier}
              filterStatus={filterStatus}
              filterModelo={filterModelo}
              filterEstadoProducto={filterEstadoProducto}
              search={search}
              page={page}
              totalPages={totalPages}
              PAGE_SIZE={PAGE_SIZE}
              hdDailyDemand={hdDailyDemand}
              onSearchChange={setSearch}
              onSupplierChange={setFilterSupplier}
              onStatusChange={(v) => setFilterStatus(v as InventoryStatus | "")}
              onModeloChange={(v) => setFilterModelo(v as "" | "si" | "no")}
              onEstadoProductoChange={(v) => setFilterEstadoProducto(v as "" | "activo" | "inactivo" | "special_buy")}
              onPageChange={setPage}
            />
          )}
          {tab === "containers" && (
            <ContainersTab
              ranking={ranking}
              loadingRanking={loadingRanking}
              errorRanking={errorRanking}
              onRetryRanking={fetchRanking}
              selectedFactory={selectedFactory}
              onSelectFactory={selectFactory}
              solucionCache={solucionCache}
              loadingFactory={loadingFactory}
              errorFactory={errorFactory}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Semáforo Tab ─────────────────────────────────────────────────────────────

interface StatusTabProps {
  paginated: ProductResult[];
  filtered: ProductResult[];
  suppliers: string[];
  filterSupplier: string;
  filterStatus: InventoryStatus | "";
  filterModelo: "" | "si" | "no";
  filterEstadoProducto: "" | "activo" | "inactivo" | "special_buy";
  search: string;
  page: number;
  totalPages: number;
  PAGE_SIZE: number;
  hdDailyDemand: Record<string, number>;
  onSearchChange: (v: string) => void;
  onSupplierChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onModeloChange: (v: string) => void;
  onEstadoProductoChange: (v: string) => void;
  onPageChange: (p: number) => void;
}

const ESTADO_PRODUCTO_LABELS: Record<"activo" | "inactivo" | "special_buy", string> = {
  activo: "Activo",
  inactivo: "Inactivo",
  special_buy: "Special Buy",
};

function StatusTab({
  paginated,
  filtered,
  suppliers,
  filterSupplier,
  filterStatus,
  filterModelo,
  filterEstadoProducto,
  search,
  page,
  totalPages,
  PAGE_SIZE,
  hdDailyDemand,
  onSearchChange,
  onSupplierChange,
  onStatusChange,
  onModeloChange,
  onEstadoProductoChange,
  onPageChange,
}: StatusTabProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          placeholder="🔍 Buscar MOD o nombre…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 w-56"
        />
        <select
          value={filterSupplier}
          onChange={(e) => onSupplierChange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.dot} {v.label}</option>
          ))}
        </select>
        <select
          value={filterModelo}
          onChange={(e) => onModeloChange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        >
          <option value="">Todos (considerados y no considerados)</option>
          <option value="si">✅ Considerados en el modelo</option>
          <option value="no">🚫 No considerados en el modelo</option>
        </select>
        <select
          value={filterEstadoProducto}
          onChange={(e) => onEstadoProductoChange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        >
          <option value="">Todos los estados de producto</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
          <option value="special_buy">Special Buy</option>
        </select>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 self-center">
          {filtered.length} productos
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left border-b border-r border-gray-300 dark:border-gray-600 w-8">#</th>
              <th className="px-3 py-2.5 text-left border-b border-r border-gray-300 dark:border-gray-600 min-w-[80px]">MOD</th>
              <th className="px-3 py-2.5 text-left border-b border-r border-gray-300 dark:border-gray-600 min-w-[200px]">Nombre</th>
              <th className="px-3 py-2.5 text-left border-b border-r border-gray-300 dark:border-gray-600 min-w-[100px]">Proveedor</th>
              <th className="px-3 py-2.5 text-center border-b border-r border-gray-300 dark:border-gray-600 min-w-[90px]">Estado prod.</th>
              <th className="px-3 py-2.5 text-right border-b border-r border-gray-300 dark:border-gray-600">Stock</th>
              <th className="px-3 py-2.5 text-right border-b border-r border-gray-300 dark:border-gray-600">Dem./día HD</th>
              <th className="px-3 py-2.5 text-right border-b border-r border-gray-300 dark:border-gray-600">Días cob.</th>
              <th className="px-3 py-2.5 text-center border-b border-r border-gray-300 dark:border-gray-600 min-w-[100px]">Estado</th>
              <th className="px-3 py-2.5 text-center border-b border-gray-300 dark:border-gray-600 min-w-[90px]">Modelo</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((r, idx) => {
              const cfg = STATUS_CFG[r.status];
              const globalIdx = (page - 1) * PAGE_SIZE + idx + 1;
              // r.sku contiene el MOD (master_sku del artículo)
              const hdDem = hdDailyDemand[r.sku];
              return (
                <tr
                  key={r.sku}
                  className={`border-b border-gray-200 dark:border-gray-700 hover:brightness-95 transition-all ${cfg.rowBg} ${cfg.border}`}
                >
                  <td className="px-3 py-2 text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 text-center">
                    {globalIdx}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    {r.sku}
                  </td>
                  <td className="px-3 py-2 text-gray-800 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700 max-w-xs truncate" title={r.name}>
                    {r.name}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    {r.supplier}
                  </td>
                  <td className="px-3 py-2 text-center border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {ESTADO_PRODUCTO_LABELS[r.estadoProducto]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-800 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700">
                    {fmt(r.stock)}
                  </td>
                  {/* Demanda diaria, solo lectura, calculada de HD */}
                  <td className="px-3 py-2 text-right border-r border-gray-200 dark:border-gray-700">
                    {hdDem ? (
                      <span className="font-medium text-blue-700 dark:text-blue-400">
                        {hdDem.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600 italic text-xs">sin datos</span>
                    )}
                  </td>
                  {/* Días cobertura */}
                  <td className={`px-3 py-2 text-right font-semibold border-r border-gray-200 dark:border-gray-700 ${cfg.badgeText}`}>
                    {fmtDias(r.inventoryDays)}
                  </td>
                  {/* Estado badge */}
                  <td className="px-3 py-2 text-center border-r border-gray-200 dark:border-gray-700">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeBg} ${cfg.badgeText}`}>
                      {cfg.dot} {cfg.label}
                    </span>
                  </td>
                  {/* Considerado en modelo matemático */}
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.consideraModelo
                          ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {r.consideraModelo ? "✅ Sí" : "🚫 No"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
            <div className="text-5xl mb-3">🔍</div>
            <p>Sin resultados para los filtros actuales.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Página {page} de {totalPages} · {filtered.length} productos
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              ‹ Ant.
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return (
                <button
                  key={pg}
                  onClick={() => onPageChange(pg)}
                  className={`px-3 py-1 text-sm rounded border ${
                    pg === page
                      ? "bg-blue-500 text-white border-blue-500"
                      : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {pg}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              Sig. ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contenedores Tab (recomendación MILP real) ─────────────────────────────

const CATEGORIA_DOT: Record<string, string> = {
  OBLIGATORIO: "🔴",
  DESEABLE: "🟡",
  ADELANTABLE: "🔵",
};

interface ContainersTabProps {
  ranking: RankingProveedor[] | null;
  loadingRanking: boolean;
  errorRanking: string | null;
  onRetryRanking: () => void;
  selectedFactory: string | null;
  onSelectFactory: (factory: string) => void;
  solucionCache: ReabastoPorFactory;
  loadingFactory: string | null;
  errorFactory: string | null;
}

function ContainersTab({
  ranking,
  loadingRanking,
  errorRanking,
  onRetryRanking,
  selectedFactory,
  onSelectFactory,
  solucionCache,
  loadingFactory,
  errorFactory,
}: ContainersTabProps) {
  if (loadingRanking && !ranking) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 text-gray-400 dark:text-gray-500">
        <div className="text-4xl mb-4 animate-bounce">🚢</div>
        <p>Cargando proveedores…</p>
      </div>
    );
  }

  if (errorRanking) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 text-gray-400 dark:text-gray-500">
        <div className="text-5xl mb-3">❌</div>
        <p className="text-red-500 dark:text-red-400">{errorRanking}</p>
        <button
          onClick={onRetryRanking}
          className="mt-4 px-4 py-2 text-sm rounded-lg bg-blue-500 hover:bg-blue-600 text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!ranking || ranking.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 text-gray-400 dark:text-gray-500">
        <div className="text-5xl mb-3">🚢</div>
        <p className="text-lg">Sin proveedores con catálogo activo.</p>
      </div>
    );
  }

  const entry = selectedFactory ? solucionCache[selectedFactory] : null;
  const isLoadingSelected = loadingFactory === selectedFactory;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Elige un proveedor para calcular su empaque óptimo (MILP): cuántas cajas pedir de cada MOD y
        en qué contenedor va cada una.
      </p>

      {/* Selector de proveedor */}
      <div className="flex flex-wrap gap-2 mb-6">
        {ranking.map((r) => {
          const cfg = CATEGORIA_PROVEEDOR_CFG[r.categoria];
          const active = r.factory === selectedFactory;
          return (
            <button
              key={r.factory}
              onClick={() => onSelectFactory(r.factory)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                active
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300"
              }`}
            >
              <span>🏭 {r.factory}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
                {cfg.dot} {cfg.label}
              </span>
              <span className="text-gray-400 dark:text-gray-500 text-xs">{r.nSkus} MODs</span>
            </button>
          );
        })}
      </div>

      {/* Resultado del proveedor seleccionado */}
      {!selectedFactory && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <div className="text-5xl mb-3">👆</div>
          <p>Selecciona un proveedor para ver su contenedor óptimo.</p>
        </div>
      )}

      {selectedFactory && isLoadingSelected && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <div className="text-4xl mb-4 animate-bounce">🚢</div>
          <p>Resolviendo el empaque óptimo de {selectedFactory} (MILP)…</p>
        </div>
      )}

      {selectedFactory && !isLoadingSelected && errorFactory && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <div className="text-5xl mb-3">🚢</div>
          <p className="text-lg">Sin pedido pendiente para {selectedFactory}.</p>
          <p className="text-sm mt-1">{errorFactory}</p>
        </div>
      )}

      {selectedFactory && !isLoadingSelected && !errorFactory && entry && Array.isArray(entry) && entry[0] && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <FactorySolutionCard factory={selectedFactory} sol={entry[0]} />
        </div>
      )}
    </div>
  );
}

function FactorySolutionCard({ factory, sol }: { factory: string; sol: SolucionSerialized }) {
  const barColor = (pct: number) =>
    pct > 100 ? "bg-red-500" : pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-orange-400";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-start justify-between mb-1 gap-2">
        <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base leading-tight">
          🏭 {factory}
        </h3>
        <div className="text-xs text-gray-400 dark:text-gray-500 shrink-0 text-right">
          <div>
            {sol.pesoTotalKg.toLocaleString("es-MX")} kg · {sol.volTotalM3.toLocaleString("es-MX")} m³
          </div>
          <div className="text-blue-500 dark:text-blue-400 font-medium">{sol.configuracion}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 text-xs">
        <span className={sol.todosValidos ? "text-green-600 dark:text-green-400" : "text-orange-500"}>
          {sol.todosValidos ? "✓ Todos los contenedores justificados" : "⚠ Algún contenedor por debajo del piso"}
        </span>
        {sol.detalle.obligatoriosCubiertos && (
          <span className="text-gray-400 dark:text-gray-500">
            · Obligatorios: {sol.detalle.obligatoriosCubiertos}
          </span>
        )}
        {sol.detalle.coberturaPromDias != null && (
          <span className="text-gray-400 dark:text-gray-500">· ~{sol.detalle.coberturaPromDias}d cobertura</span>
        )}
      </div>

      <div className="space-y-4">
        {sol.contenedores.map((c) => (
          <div key={c.indice} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                Contenedor {c.indice + 1} · {c.tipo}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  c.esValido
                    ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                    : "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300"
                }`}
              >
                {c.justificadoPor}
              </span>
            </div>

            <div className="mb-2">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>⚖️ Peso</span>
                <span>{c.pctPeso}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div className={`h-2.5 rounded-full ${barColor(c.pctPeso)}`} style={{ width: `${Math.min(c.pctPeso, 100)}%` }} />
              </div>
            </div>
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>📦 Volumen</span>
                <span>{c.pctVol}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div className={`h-2.5 rounded-full ${barColor(c.pctVol)}`} style={{ width: `${Math.min(c.pctVol, 100)}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              {c.asignaciones.map((a) => (
                <div
                  key={a.mod}
                  className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span>{CATEGORIA_DOT[a.categoria] ?? "⚪"}</span>
                    <span className="font-mono text-gray-600 dark:text-gray-400 shrink-0">{a.mod}</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate">{a.desc}</span>
                  </div>
                  <div className="flex gap-3 shrink-0 ml-2 text-gray-500 dark:text-gray-400">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">{a.cajas} CTN</span>
                    <span>{a.pzs.toLocaleString("es-MX")} pzs</span>
                    <span>{a.pesoKg.toLocaleString("es-MX")} kg</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
