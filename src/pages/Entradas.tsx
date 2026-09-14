// Page for recording and browsing container entradas (inbound shipments),
// with filtering, pagination, and create/detail modals.
import { useState, useEffect, useCallback, useRef } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { auth } from "../lib/firebase";
import { ColumnFilter, distinctValues } from "../components/ColumnFilter";
import { SkuCombobox, type SkuOption } from "../components/SkuCombobox";
import { ContenedorEtiquetaModal } from "../components/ContenedorEtiquetaModal";
import { getMonterreyDateISO, getMonterreyYear } from "../lib/dateMx";
import { useRole } from "../hooks/useRole";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusEnvio = 'pendiente' | 'en_transito' | 'entregado' | 'cancelado';
type EstadoOrden = 'draft' | 'confirmado';

interface ContenedorRow {
  folio_orden: string;
  fecha_movimiento: string;
  fecha_pedido?: string | null;
  total_piezas: number;
  num_productos: number;
  id_movimiento: number; // representative id (for React keys)
  skus: string | null;
  productos: string | null;
  pdf_filename?: string | null;
  pdf_uploaded_at?: string | null;
  status_envio?: StatusEnvio | null;
  estado?: EstadoOrden | null;
  veces_rechazado?: number;
  tamano?: string | null;
  // computed client-side from folio_orden
  orden: string;
  contenedores: string;
}

interface ContenedoresResponse {
  data: Omit<ContenedorRow, "orden" | "contenedores">[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface ContenedorDetail {
  folio: string;
  tamano?: string | null;
  fecha: string;
  fecha_pedido?: string | null;
  importe_factura?: number | null;
  importe_factura_moneda?: string | null;
  items: {
    id_movimiento: number;
    id_articulo: number;
    master_sku: string;
    nombre_producto: string;
    cantidad: number;
  }[];
  total_piezas: number;
}

interface NuevoItem {
  master_sku: string;
  cantidad: string;
}

interface ProductosResponse {
  items: { sku: string; name: string }[];
}

type SortColumn = keyof ContenedorRow | null;
type SortDir = "asc" | "desc";

// ─── Constants ────────────────────────────────────────────────────────────────

const TABLE_GRID =
  "minmax(0,1.7fr) minmax(0,1.2fr) minmax(0,2.6fr) 5rem 7.5rem 7.5rem 6.5rem 8.5rem 5.5rem";

const STATUS_COLORS: Record<StatusEnvio, string> = {
  pendiente:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  en_transito: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  entregado:   "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  cancelado:   "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};
const DETAIL_GRID = "minmax(0,1.5fr) minmax(0,3fr) 6rem";
const LIMIT = 25;

const MONTHS = [
  { value: "0", label: "Todos" },
  { value: "1", label: "Enero" },
  { value: "2", label: "Febrero" },
  { value: "3", label: "Marzo" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Mayo" },
  { value: "6", label: "Junio" },
  { value: "7", label: "Julio" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

const YEARS = ["2025", "2026"];

// Common container sizes suggested in the order modal (free text still allowed).
const TAMANO_OPTIONS = ["1X20", "1X40", "2X40", "FULL", "SENCILLO"];

const COLUMNS: { key: SortColumn; label: string; align: string }[] = [
  { key: "orden", label: "Orden", align: "justify-start" },
  { key: "contenedores", label: "Contenedores", align: "justify-center" },
  { key: "productos", label: "Productos", align: "justify-start" },
  { key: "total_piezas", label: "Piezas", align: "justify-center" },
  { key: "fecha_pedido", label: "Fecha de pedido", align: "justify-center" },
  { key: "fecha_movimiento", label: "Fecha de llegada", align: "justify-center" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return getMonterreyDateISO();
}

function sortRows(
  rows: ContenedorRow[],
  col: SortColumn,
  dir: SortDir
): ContenedorRow[] {
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (av === bv) return 0;
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv), "es");
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({
  col,
  active,
  dir,
}: {
  col: SortColumn;
  active: SortColumn;
  dir: SortDir;
}) {
  if (col !== active)
    return <span className="text-gray-400 ml-1 text-xs">⬍</span>;
  return (
    <span className="text-blue-600 dark:text-blue-400 ml-1 text-xs">
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

function extractTamano(folio: string): string {
  const m = folio.match(/(\d\s*[xX]\s*\d{2}|full|sencillo)/i);
  if (!m) return "Sin especificar";
  return m[0].replace(/\s/g, "").toUpperCase();
}

function parseFolio(folio: string): { orden: string; contenedores: string } {
  const raw = (folio || "").trim();
  const contenedores = extractTamano(raw);
  let orden = raw.replace(/^\s*orden\s*/i, ""); // drop leading "ORDEN"
  const m = raw.match(/(\d\s*[xX]\s*\d{2}|full|sencillo)/i);
  if (m) orden = orden.replace(m[0], "");
  orden = orden.replace(/\s+/g, " ").trim();
  return { orden: orden || raw, contenedores };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Entradas() {
  useDarkMode();
  const { isSuperAdmin } = useRole();
  const currentYear = String(getMonterreyYear());

  const [data, setData] = useState<ContenedorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Filter state
  const [anio, setAnio] = useState(currentYear);
  const [mes, setMes] = useState("0");
  const [searchText, setSearchText] = useState("");
  const [colFilters] = useState<Record<string, string[]>>({});

  // Granular filter state
  const [dateDesde, setDateDesde] = useState("");
  const [dateHasta, setDateHasta] = useState("");
  const [tamanoFilter, setTamanoFilter] = useState<string[]>([]);
  const [skuFilter, setSkuFilter] = useState<string[]>([]);
  const [facturaFilter, setFacturaFilter] = useState<"todos" | "con" | "sin">("todos");

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [retryCount, setRetryCount] = useState(0);

  // Detail modal state
  const [detailVisible, setDetailVisible] = useState(false);
  const [detail, setDetail] = useState<ContenedorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [etiquetaVisible, setEtiquetaVisible] = useState(false);

  // Create / edit modal state
  const [createVisible, setCreateVisible] = useState(false);
  const [editFolio, setEditFolio] = useState<string | null>(null); // null = create mode
  const [createFolio, setCreateFolio] = useState("");
  const [createTamano, setCreateTamano] = useState("");
  const [createFecha, setCreateFecha] = useState(todayISO());
  const [createFechaPedido, setCreateFechaPedido] = useState("");
  const [createImporteFactura, setCreateImporteFactura] = useState("");
  const [createImporteFacturaMoneda, setCreateImporteFacturaMoneda] = useState("USD");
  const [createItems, setCreateItems] = useState<NuevoItem[]>([
    { master_sku: "", cantidad: "1" },
  ]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteFolio, setDeleteFolio] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Review (guardar/confirmar) popup state
  const [reviewEstado, setReviewEstado] = useState<EstadoOrden | null>(null);

  // Botar loading state
  const [botandoFolio, setBotandoFolio] = useState<string | null>(null);
  const [confirmandoFolio, setConfirmandoFolio] = useState<string | null>(null);

  // SKU catalog for the create modal's searchable dropdown
  const [skuCatalog, setSkuCatalog] = useState<SkuOption[]>([]);
  const [skuCatalogLoading, setSkuCatalogLoading] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  // PDF upload state
  const [uploadingFolio, setUploadingFolio] = useState<string | null>(null);
  const [selectedFolio, setSelectedFolio] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Status envío state
  const [statusOverrides, setStatusOverrides] = useState<Record<string, StatusEnvio>>({});
  const [updatingStatuses, setUpdatingStatuses] = useState<Set<string>>(new Set());

  // Auto-dismiss toast after 3.5 s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Reset to first page whenever a client-side filter changes
  useEffect(() => {
    setPage(1);
  }, [searchText, colFilters, dateDesde, dateHasta, tamanoFilter, skuFilter, facturaFilter]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: "1",
          limit: "100000",
          anio,
        });
        if (mes !== "0") params.set("mes", mes);

        const raw = (await fetchAPI(
          `/api/contenedores?${params.toString()}`
        )) as ContenedoresResponse;

        if (!cancelled) {
          const rows = Array.isArray(raw.data) ? raw.data : [];
          setData(
            rows.map((r) => {
              const parsed = parseFolio(r.folio_orden);
              return {
                ...r,
                total_piezas: Number(r.total_piezas) || 0,
                num_productos: Number(r.num_productos) || 0,
                estado: r.estado ?? 'confirmado',
                veces_rechazado: r.veces_rechazado ?? 0,
                orden: parsed.orden,
                contenedores: r.tamano || parsed.contenedores,
              };
            })
          );
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [anio, mes, retryCount]);

  useRefetchOnFocus(useCallback(() => setRetryCount((c) => c + 1), []));

  // ── Filter handlers ──────────────────────────────────────────────────────

  const handleAnioChange = (value: string) => {
    setAnio(value);
    setPage(1);
  };

  const handleMesChange = (value: string) => {
    setMes(value);
    setPage(1);
  };

  const clearGranularFilters = () => {
    setDateDesde("");
    setDateHasta("");
    setTamanoFilter([]);
    setSkuFilter([]);
    setFacturaFilter("todos");
  };

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortColumn(null);
        setSortDir("asc");
      }
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  // ── Detail modal ─────────────────────────────────────────────────────────

  const handleRowClick = async (folio: string) => {
    setDetail(null);
    setDetailError(null);
    setDetailVisible(true);
    setDetailLoading(true);
    try {
      const raw = (await fetchAPI(
        `/api/contenedores/${encodeURIComponent(folio)}`
      )) as ContenedorDetail;
      setDetail(raw);
    } catch (err) {
      setDetailError((err as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailVisible(false);
    setDetail(null);
    setDetailError(null);
  };

  // ── Create / edit modal ──────────────────────────────────────────────────

  const loadSkuCatalog = () => {
    if (skuCatalog.length > 0) return;
    setSkuCatalogLoading(true);
    fetchAPI("/api/productos?pageSize=100000")
      .then((raw) => {
        const items = (raw as ProductosResponse).items ?? [];
        setSkuCatalog(
          items
            .filter((p) => p.sku)
            .map((p) => ({ sku: p.sku, name: p.name ?? "" }))
        );
      })
      .catch((err) =>
        setCreateError(
          `No se pudo cargar el catálogo de MODs: ${(err as Error).message}`
        )
      )
      .finally(() => setSkuCatalogLoading(false));
  };

  const handleOpenCreate = () => {
    setEditFolio(null);
    setCreateFolio("");
    setCreateTamano("");
    setCreateFecha(todayISO());
    setCreateFechaPedido("");
    setCreateImporteFactura("");
    setCreateImporteFacturaMoneda("USD");
    setCreateItems([{ master_sku: "", cantidad: "1" }]);
    setCreateError(null);
    setCreateVisible(true);
    loadSkuCatalog();
  };

  const handleOpenEdit = async (folio: string) => {
    setEditFolio(folio);
    setCreateFolio(folio);
    setCreateError(null);
    setCreateVisible(true);
    setCreateLoading(true);
    loadSkuCatalog();
    try {
      const raw = (await fetchAPI(
        `/api/contenedores/${encodeURIComponent(folio)}`
      )) as ContenedorDetail;
      setCreateTamano(raw.tamano || "");
      setCreateFecha((raw.fecha || "").slice(0, 10) || todayISO());
      setCreateFechaPedido((raw.fecha_pedido || "").slice(0, 10));
      setCreateImporteFactura(raw.importe_factura != null ? String(raw.importe_factura) : "");
      setCreateImporteFacturaMoneda(raw.importe_factura_moneda || "USD");
      setCreateItems(
        raw.items.length > 0
          ? raw.items.map((it) => ({
              master_sku: it.master_sku,
              cantidad: String(it.cantidad),
            }))
          : [{ master_sku: "", cantidad: "1" }]
      );
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteFolio) return;
    setDeleteLoading(true);
    try {
      await fetchAPI(`/api/contenedores/${encodeURIComponent(deleteFolio)}`, {
        method: "DELETE",
      });
      setToast({ ok: true, text: `Orden "${deleteFolio}" eliminada.` });
      setDeleteFolio(null);
      setRetryCount((c) => c + 1);
    } catch (err) {
      setToast({ ok: false, text: (err as Error).message });
    } finally {
      setDeleteLoading(false);
    }
  };

  const knownSkus = new Set(skuCatalog.map((o) => o.sku));

  const addItem = () =>
    setCreateItems((prev) => [...prev, { master_sku: "", cantidad: "1" }]);

  const removeItem = (index: number) =>
    setCreateItems((prev) => prev.filter((_, i) => i !== index));

  const updateItem = (
    index: number,
    field: keyof NuevoItem,
    value: string
  ) =>
    setCreateItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );

  const validateCreateForm = (): { master_sku: string; cantidad: number }[] | null => {
    if (!createFolio.trim() || !createFecha) return null;
    setCreateError(null);

    const validItems = createItems
      .filter((i) => i.master_sku.trim())
      .map((i) => ({
        master_sku: i.master_sku.trim(),
        cantidad: Math.max(1, Number(i.cantidad) || 1),
      }));

    if (validItems.length === 0) {
      setCreateError("Agrega al menos un producto.");
      return null;
    }

    if (knownSkus.size > 0) {
      const unknown = validItems
        .map((i) => i.master_sku)
        .filter((sku) => !knownSkus.has(sku));
      if (unknown.length > 0) {
        setCreateError(
          `MOD no encontrado: ${[...new Set(unknown)].join(", ")}. ` +
            "Selecciona un modelo de la lista."
        );
        return null;
      }
    }

    return validItems;
  };

  // Opens the read-only review popup instead of saving directly.
  const handleReviewClick = (estado: EstadoOrden) => {
    const validItems = validateCreateForm();
    if (!validItems) return;
    setReviewEstado(estado);
  };

  const handleCreateSubmit = async (estado: EstadoOrden) => {
    const validItems = validateCreateForm();
    if (!validItems) return;

    setCreateLoading(true);
    try {
      const body = JSON.stringify({
        folio_orden: createFolio.trim(),
        tamano: createTamano.trim() || null,
        fecha_movimiento: createFecha,
        fecha_pedido: createFechaPedido || null,
        importe_factura: createImporteFactura.trim() || null,
        importe_factura_moneda: createImporteFacturaMoneda,
        items: validItems,
        estado,
      });

      if (editFolio) {
        await fetchAPI(`/api/contenedores/${encodeURIComponent(editFolio)}`, {
          method: "PUT",
          body,
        });
      } else {
        await fetchAPI("/api/contenedores", { method: "POST", body });
      }

      setReviewEstado(null);
      setCreateVisible(false);
      setToast({
        ok: true,
        text: editFolio
          ? `Orden "${createFolio.trim()}" actualizada.`
          : estado === "confirmado"
          ? `Orden "${createFolio.trim()}" creada y confirmada.`
          : `Orden "${createFolio.trim()}" guardada como borrador.`,
      });
      setRetryCount((c) => c + 1);
    } catch (err) {
      setCreateError((err as Error).message);
      setReviewEstado(null);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleConfirmarOrden = async (folio: string) => {
    setConfirmandoFolio(folio);
    try {
      await fetchAPI(`/api/contenedores/${encodeURIComponent(folio)}/confirmar`, { method: "PATCH" });
      setToast({ ok: true, text: `Orden "${folio}" confirmada.` });
      setRetryCount((c) => c + 1);
    } catch (err) {
      setToast({ ok: false, text: (err as Error).message });
    } finally {
      setConfirmandoFolio(null);
    }
  };

  const handleBotarOrden = async (folio: string) => {
    setBotandoFolio(folio);
    try {
      await fetchAPI(`/api/contenedores/${encodeURIComponent(folio)}/botar`, { method: "PATCH" });
      setToast({ ok: true, text: `Orden "${folio}" botada de vuelta a borrador.` });
      setRetryCount((c) => c + 1);
    } catch (err) {
      setToast({ ok: false, text: (err as Error).message });
    } finally {
      setBotandoFolio(null);
    }
  };

  const handlePdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFolio) return;
    e.target.value = "";
    setUploadingFolio(selectedFolio);
    try {
      const token = await auth.currentUser!.getIdToken(true);
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${apiBase}/api/contenedores/${encodeURIComponent(selectedFolio)}/pdf`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setToast({ ok: true, text: "Factura subida correctamente" });
      setRetryCount((c) => c + 1);
    } catch (err) {
      setToast({ ok: false, text: (err as Error).message });
    } finally {
      setUploadingFolio(null);
      setSelectedFolio(null);
    }
  };

  const handleViewPdf = async (folio: string) => {
    try {
      const token = await auth.currentUser!.getIdToken(true);
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const res = await fetch(
        `${apiBase}/api/contenedores/${encodeURIComponent(folio)}/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      setToast({
        ok: false,
        text: `Error al abrir factura: ${(err as Error).message}`,
      });
    }
  };

  const handleStatusChange = async (folio: string, newStatus: StatusEnvio) => {
    const prevStatus =
      statusOverrides[folio] ??
      data.find((r) => r.folio_orden === folio)?.status_envio ??
      'pendiente';
    setStatusOverrides((prev) => ({ ...prev, [folio]: newStatus }));
    setUpdatingStatuses((prev) => new Set([...prev, folio]));
    try {
      await fetchAPI(`/api/contenedores/${encodeURIComponent(folio)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status_envio: newStatus }),
      });
    } catch (err) {
      setStatusOverrides((prev) => ({ ...prev, [folio]: prevStatus as StatusEnvio }));
      setToast({ ok: false, text: `Error al actualizar status: ${(err as Error).message}` });
    } finally {
      setUpdatingStatuses((prev) => {
        const next = new Set(prev);
        next.delete(folio);
        return next;
      });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const COL_ACCESSORS: Record<string, (r: ContenedorRow) => string> = {
    orden: (r) => r.orden || "",
    contenedores: (r) => r.contenedores || "",
    productos: (r) => r.productos || "",
    fecha_pedido: (r) => formatDate(r.fecha_pedido || ""),
    fecha_movimiento: (r) => formatDate(r.fecha_movimiento),
  };

  // Individual SKUs in a row's aggregated `skus` string ("A, B, C")
  const rowSkus = (r: ContenedorRow): string[] =>
    (r.skus || "").split(",").map((s) => s.trim()).filter(Boolean);

  const hasGranularFilters =
    dateDesde !== "" ||
    dateHasta !== "" ||
    tamanoFilter.length > 0 ||
    skuFilter.length > 0 ||
    facturaFilter !== "todos";

  const tamanoOptions = distinctValues(data, (r) => r.contenedores);
  const skuOptions = Array.from(
    new Set(data.flatMap(rowSkus))
  ).sort((a, b) => a.localeCompare(b, "es"));

  const search = searchText.trim().toLowerCase();
  const matched = data.filter((r) => {
    if (search) {
      const hay = `${r.folio_orden} ${r.skus ?? ""} ${r.productos ?? ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    for (const [k, vals] of Object.entries(colFilters)) {
      if (vals.length && !vals.includes(COL_ACCESSORS[k](r))) return false;
    }
    if (dateDesde && r.fecha_movimiento < dateDesde) return false;
    if (dateHasta && r.fecha_movimiento > dateHasta) return false;
    if (tamanoFilter.length && !tamanoFilter.includes(r.contenedores))
      return false;
    if (skuFilter.length && !rowSkus(r).some((s) => skuFilter.includes(s)))
      return false;
    if (facturaFilter === "con" && !r.pdf_filename) return false;
    if (facturaFilter === "sin" && r.pdf_filename) return false;
    return true;
  });
  const sorted = sortRows(matched, sortColumn, sortDir);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const displayedRows = sorted.slice((page - 1) * LIMIT, page * LIMIT);

  return (
    <>
      <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white">
                Entradas
              </h1>
              {!loading && total > 0 && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {total.toLocaleString("es-MX")} registros
                </span>
              )}
            </div>
            <button
              onClick={handleOpenCreate}
              className="px-6 py-2 border border-black dark:border-white hover:bg-black dark:hover:bg-white hover:text-white dark:hover:text-black transition-colors text-sm font-medium text-gray-900 dark:text-white"
            >
              + Nueva Orden
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {/* Year selector */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => handleAnioChange(y)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    anio === y
                      ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>

            {/* Month selector */}
            <select
              value={mes}
              onChange={(e) => handleMesChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            {/* Text search */}
            <div className="relative">
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar por folio, modelo o descripción..."
                className="pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm w-72"
              />
              <span className="absolute left-3 top-2.5 text-gray-400 dark:text-gray-500 text-sm pointer-events-none">
                🔍
              </span>
              {searchText && (
                <button
                  onClick={() => setSearchText("")}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs leading-none"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Granular filters row */}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {/* Date range */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-robotoMedium whitespace-nowrap">
                Desde
              </span>
              <div className="relative">
                <input
                  type="date"
                  value={dateDesde}
                  onChange={(e) => setDateDesde(e.target.value)}
                  className={`py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm ${
                    dateDesde ? "pl-3 pr-7" : "px-3"
                  }`}
                />
                {dateDesde && (
                  <button
                    onClick={() => setDateDesde("")}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs leading-none"
                  >
                    ✕
                  </button>
                )}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-robotoMedium whitespace-nowrap">
                Hasta
              </span>
              <div className="relative">
                <input
                  type="date"
                  value={dateHasta}
                  onChange={(e) => setDateHasta(e.target.value)}
                  className={`py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm ${
                    dateHasta ? "pl-3 pr-7" : "px-3"
                  }`}
                />
                {dateHasta && (
                  <button
                    onClick={() => setDateHasta("")}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs leading-none"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Tamaño multi-select */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 px-2 py-1.5 min-w-[120px]">
              <ColumnFilter
                label="Tamaño"
                options={tamanoOptions}
                selected={tamanoFilter}
                onChange={setTamanoFilter}
                align="left"
              />
            </div>

            {/* Modelo multi-select */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 px-2 py-1.5 min-w-[120px]">
              <ColumnFilter
                label="Modelo"
                options={skuOptions}
                selected={skuFilter}
                onChange={setSkuFilter}
                align="left"
              />
            </div>

            {/* Factura 3-state toggle */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              {(["todos", "con", "sin"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setFacturaFilter(v)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    facturaFilter === v
                      ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  {v === "todos"
                    ? "Todos"
                    : v === "con"
                    ? "Con factura"
                    : "Sin factura"}
                </button>
              ))}
            </div>

            {/* Clear all */}
            {hasGranularFilters && (
              <button
                onClick={clearGranularFilters}
                className="text-sm text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors font-robotoMedium"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* ── Table card ──────────────────────────────────────────────────── */}
        <div className="flex-1 bg-white dark:bg-gray-800 mx-8 mt-4 mb-8 border border-gray-400 dark:border-gray-700 overflow-hidden flex flex-col rounded-lg">
          {/* Column headers */}
          <div
            className="grid [&>*]:min-w-0 bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-600"
            style={{ gridTemplateColumns: TABLE_GRID }}
          >
            {COLUMNS.map((col) => (
              <button
                key={String(col.key)}
                onClick={() => handleSort(col.key)}
                className={`py-4 px-3 flex items-center ${col.align} border-r border-gray-400 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors w-full`}
              >
                <span className="font-robotoMedium text-gray-900 dark:text-white text-sm">
                  {col.label}
                </span>
                <SortIcon col={col.key} active={sortColumn} dir={sortDir} />
              </button>
            ))}
            <div className="py-4 px-3 flex items-center justify-center border-r border-gray-400 dark:border-gray-600">
              <span className="font-robotoMedium text-gray-900 dark:text-white text-sm">
                Factura
              </span>
            </div>
            <div className="py-4 px-3 flex items-center justify-center border-r border-gray-400 dark:border-gray-600">
              <span className="font-robotoMedium text-gray-900 dark:text-white text-sm">
                Status Envío
              </span>
            </div>
            <div className="py-4 px-3 flex items-center justify-center">
              <span className="font-robotoMedium text-gray-900 dark:text-white text-sm">
                Acciones
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                <p className="text-gray-500 dark:text-gray-400 font-robotoRegular mt-4">
                  Cargando entradas...
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-red-500 font-robotoMedium">
                  Error al cargar datos
                </p>
                <p className="text-gray-400 dark:text-gray-500 font-robotoRegular text-sm mt-2">
                  {error}
                </p>
                <button
                  onClick={() => setRetryCount((c) => c + 1)}
                  className="mt-4 px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors text-sm"
                >
                  Reintentar
                </button>
              </div>
            ) : displayedRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <p className="text-gray-400 dark:text-gray-500 text-4xl">📦</p>
                <p className="text-gray-500 dark:text-gray-400 font-robotoMedium text-lg mt-1">
                  Sin entradas para mostrar
                </p>
                <p className="text-gray-400 dark:text-gray-500 font-robotoRegular text-sm">
                  Intenta ajustar los filtros
                </p>
              </div>
            ) : (
              displayedRows.map((row, index) => (
                <div
                  key={row.id_movimiento}
                  onClick={() => handleRowClick(row.folio_orden)}
                  className={`grid [&>*]:min-w-0 border-b border-gray-200 dark:border-gray-700 cursor-pointer ${
                    index % 2 === 0
                      ? "bg-white dark:bg-gray-800"
                      : "bg-gray-50 dark:bg-gray-700/40"
                  } hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}
                  style={{ gridTemplateColumns: TABLE_GRID }}
                >
                  {/* Orden */}
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center">
                    <span
                      className="text-gray-900 dark:text-gray-100 text-sm font-mono font-medium truncate"
                      title={row.folio_orden}
                    >
                      {row.orden || "-"}
                    </span>
                  </div>
                  {/* Contenedores */}
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium">
                      {row.contenedores}
                    </span>
                  </div>
                  {/* Productos (resumen) */}
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center shrink-0 px-1.5 h-5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                      {row.num_productos}
                    </span>
                    <span
                      className="text-gray-700 dark:text-gray-300 text-sm truncate"
                      title={row.productos ?? ""}
                    >
                      {row.productos || "-"}
                    </span>
                  </div>
                  {/* Piezas */}
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <span className="text-gray-900 dark:text-gray-100 text-sm font-medium">
                      {row.total_piezas.toLocaleString("es-MX")}
                    </span>
                  </div>
                  {/* Fecha de pedido */}
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <span className="text-gray-600 dark:text-gray-400 text-sm">
                      {row.fecha_pedido ? formatDate(row.fecha_pedido) : "-"}
                    </span>
                  </div>
                  {/* Fecha de llegada */}
                  <div className="py-3 px-3 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <span className="text-gray-600 dark:text-gray-400 text-sm">
                      {formatDate(row.fecha_movimiento)}
                    </span>
                  </div>
                  {/* Factura */}
                  <div
                    className="py-3 px-3 flex items-center justify-center gap-1 border-r border-gray-200 dark:border-gray-600"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {uploadingFolio === row.folio_orden ? (
                      <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
                    ) : row.pdf_filename ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewPdf(row.folio_orden);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                        >
                          📄 Ver
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFolio(row.folio_orden);
                            pdfInputRef.current?.click();
                          }}
                          className="inline-flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-xs"
                          title="Reemplazar PDF"
                        >
                          ↑
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFolio(row.folio_orden);
                          pdfInputRef.current?.click();
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        📎 Subir
                      </button>
                    )}
                  </div>
                  <div
                    className="py-3 px-3 flex items-center justify-center border-r border-gray-200 dark:border-gray-600"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {updatingStatuses.has(row.folio_orden) ? (
                      <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
                    ) : (() => {
                      const status: StatusEnvio =
                        statusOverrides[row.folio_orden] ??
                        row.status_envio ??
                        'pendiente';
                      return (
                        <select
                          value={status}
                          onChange={(e) =>
                            handleStatusChange(row.folio_orden, e.target.value as StatusEnvio)
                          }
                          onClick={(e) => e.stopPropagation()}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${STATUS_COLORS[status]}`}
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="en_transito">En tránsito</option>
                          <option value="entregado">Entregado</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      );
                    })()}
                  </div>
                  {/* Acciones */}
                  <div
                    className="py-3 px-2 flex items-center justify-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isSuperAdmin ? (
                      <>
                        {row.estado === "confirmado" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBotarOrden(row.folio_orden);
                            }}
                            disabled={botandoFolio === row.folio_orden}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors disabled:opacity-50"
                            title="Botar orden (regresa a borrador)"
                          >
                            {botandoFolio === row.folio_orden ? "…" : "⛔ Botar"}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(row.folio_orden);
                          }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm"
                          title={`Editar orden — botada ${row.veces_rechazado ?? 0} veces`}
                        >
                          ✏️
                        </button>
                        {(row.veces_rechazado ?? 0) > 0 && (
                          <span className="text-[10px] text-red-500 dark:text-red-400 font-semibold" title="Veces botada">
                            ×{row.veces_rechazado}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        {row.estado === "draft" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConfirmarOrden(row.folio_orden);
                            }}
                            disabled={confirmandoFolio === row.folio_orden}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors disabled:opacity-50"
                            title="Confirmar orden"
                          >
                            {confirmandoFolio === row.folio_orden ? "…" : "✓ Confirmar"}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(row.folio_orden);
                          }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm"
                          title="Editar orden"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteFolio(row.folio_orden);
                          }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-sm"
                          title="Eliminar orden"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {!loading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400 font-robotoRegular text-sm">
                Mostrando {(page - 1) * LIMIT + 1}–
                {Math.min(page * LIMIT, total)} de{" "}
                {total.toLocaleString("es-MX")} registros
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={`px-4 py-2 rounded-lg text-sm font-robotoMedium transition-colors ${
                    page === 1
                      ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  Anterior
                </button>
                <span className="px-4 py-2 font-robotoMedium text-gray-700 dark:text-gray-300 text-sm">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className={`px-4 py-2 rounded-lg text-sm font-robotoMedium transition-colors ${
                    page >= totalPages
                      ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Toast notification ──────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-sm w-full p-4 rounded-lg shadow-lg border animate-fade-in ${
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

      {/* ── Detail modal ────────────────────────────────────────────────────── */}
      {detailVisible && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl flex flex-col max-h-[80vh] shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-robotoMedium text-gray-900 dark:text-white">
                  {detail?.folio ?? "Cargando…"}
                </h2>
                {detail && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-robotoRegular mt-0.5">
                    Llegada: {formatDate(detail.fecha)}
                    {detail.fecha_pedido
                      ? ` · Pedido: ${formatDate(detail.fecha_pedido)}`
                      : ""}
                  </p>
                )}
              </div>
              <button
                onClick={closeDetail}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none ml-4 mt-0.5"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto">
              {detailLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  <p className="text-gray-500 dark:text-gray-400 font-robotoRegular mt-4 text-sm">
                    Cargando detalle…
                  </p>
                </div>
              ) : detailError ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <p className="text-red-500 font-robotoMedium text-sm">
                    Error al cargar el detalle
                  </p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
                    {detailError}
                  </p>
                </div>
              ) : detail && detail.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <p className="text-gray-400 dark:text-gray-500 font-robotoRegular text-sm">
                    Sin productos en esta entrada
                  </p>
                </div>
              ) : detail ? (
                <>
                  {/* Inner table header */}
                  <div
                    className="grid [&>*]:min-w-0 bg-gray-100 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600 sticky top-0"
                    style={{ gridTemplateColumns: DETAIL_GRID }}
                  >
                    {(["Modelo", "Descripción", "Cantidad"] as const).map(
                      (label, i, arr) => (
                        <div
                          key={label}
                          className={`py-3 px-4 flex items-center ${
                            label === "Descripción"
                              ? "justify-start"
                              : "justify-center"
                          } ${
                            i < arr.length - 1
                              ? "border-r border-gray-300 dark:border-gray-600"
                              : ""
                          }`}
                        >
                          <span className="font-robotoMedium text-gray-700 dark:text-gray-300 text-sm">
                            {label}
                          </span>
                        </div>
                      )
                    )}
                  </div>

                  {/* Inner table rows */}
                  {detail.items.map((item, index) => (
                    <div
                      key={item.id_movimiento}
                      className={`grid [&>*]:min-w-0 border-b border-gray-200 dark:border-gray-700 ${
                        index % 2 === 0
                          ? "bg-white dark:bg-gray-800"
                          : "bg-gray-50 dark:bg-gray-700/40"
                      }`}
                      style={{ gridTemplateColumns: DETAIL_GRID }}
                    >
                      <div className="py-2.5 px-4 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                        <span className="text-gray-700 dark:text-gray-300 text-sm font-mono">
                          {item.master_sku || "-"}
                        </span>
                      </div>
                      <div className="py-2.5 px-4 border-r border-gray-200 dark:border-gray-600 flex items-center">
                        <span
                          className="text-gray-900 dark:text-gray-100 text-sm truncate"
                          title={item.nombre_producto}
                        >
                          {item.nombre_producto || "-"}
                        </span>
                      </div>
                      <div className="py-2.5 px-4 flex items-center justify-center">
                        <span className="text-gray-900 dark:text-gray-100 text-sm font-medium">
                          {item.cantidad.toLocaleString("es-MX")}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </div>

            {/* Footer */}
            {detail && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <span className="font-robotoMedium text-gray-700 dark:text-gray-300 text-sm">
                  Total piezas:{" "}
                  <span className="text-gray-900 dark:text-white font-bold">
                    {detail.total_piezas.toLocaleString("es-MX")}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEtiquetaVisible(true)}
                    className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors text-sm font-robotoMedium"
                  >
                    Imprimir barcode
                  </button>
                  <button
                    onClick={closeDetail}
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-robotoMedium"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ContenedorEtiquetaModal
        visible={etiquetaVisible}
        detail={detail}
        onClose={() => setEtiquetaVisible(false)}
      />

      {/* ── Create modal ────────────────────────────────────────────────────── */}
      {createVisible && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-xl flex flex-col max-h-[90vh] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-robotoMedium text-gray-900 dark:text-white">
                {editFolio ? "Editar Orden" : "Nueva Orden"}
              </h2>
              <button
                onClick={() => { setCreateVisible(false); setReviewEstado(null); }}
                disabled={createLoading}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
              {/* Inline error */}
              {createError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/40 border border-red-300 dark:border-red-600 text-red-800 dark:text-red-200 text-sm">
                  <span className="shrink-0">⚠️</span>
                  <span className="font-robotoRegular">{createError}</span>
                </div>
              )}

              {/* Orden + Contenedores (tamaño) */}
              <div className="grid grid-cols-[1fr_10rem] gap-4">
                <div>
                  <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1.5">
                    Orden <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={createFolio}
                    onChange={(e) => setCreateFolio(e.target.value)}
                    placeholder="Ej. Contenedor MAD0301"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1.5">
                    Contenedores
                  </label>
                  <input
                    type="text"
                    list="tamano-options"
                    value={createTamano}
                    onChange={(e) => setCreateTamano(e.target.value.toUpperCase())}
                    placeholder="Ej. 1X40"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <datalist id="tamano-options">
                    {TAMANO_OPTIONS.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1.5">
                    Fecha de pedido
                  </label>
                  <input
                    type="date"
                    value={createFechaPedido}
                    onChange={(e) => setCreateFechaPedido(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1.5">
                    Fecha de llegada <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={createFecha}
                    onChange={(e) => setCreateFecha(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* Importe de factura */}
              <div className="grid grid-cols-[1fr_8rem] gap-4">
                <div>
                  <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1.5">
                    Importe de factura
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={createImporteFactura}
                    onChange={(e) => setCreateImporteFactura(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-1.5">
                    Moneda
                  </label>
                  <select
                    value={createImporteFacturaMoneda}
                    onChange={(e) => setCreateImporteFacturaMoneda(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  >
                    <option value="USD">USD</option>
                    <option value="MXN">MXN</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
              </div>

              {/* Items */}
              <div>
                <label className="block text-sm font-robotoMedium text-gray-700 dark:text-gray-300 mb-2">
                  Productos
                </label>

                <div className="space-y-2">
                  {/* Items header */}
                  <div className="grid grid-cols-[1fr_6rem_2rem] gap-2 px-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-robotoMedium">
                      Modelo / MOD
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-robotoMedium text-center">
                      Cantidad
                    </span>
                    <span />
                  </div>

                  {createItems.map((item, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_6rem_2rem] gap-2 items-center"
                    >
                      <SkuCombobox
                        value={item.master_sku}
                        onChange={(sku) => {
                          updateItem(i, "master_sku", sku);
                          if (createError) setCreateError(null);
                        }}
                        options={skuCatalog}
                        loading={skuCatalogLoading}
                        invalid={
                          !!item.master_sku.trim() &&
                          knownSkus.size > 0 &&
                          !knownSkus.has(item.master_sku.trim())
                        }
                      />
                      <input
                        type="number"
                        min={1}
                        value={item.cantidad}
                        onChange={(e) =>
                          updateItem(i, "cantidad", e.target.value)
                        }
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                      <button
                        onClick={() => removeItem(i)}
                        disabled={createItems.length === 1}
                        className="flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-0 disabled:pointer-events-none"
                        title="Eliminar fila"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addItem}
                  className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-robotoMedium transition-colors"
                >
                  + Agregar producto
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => { setCreateVisible(false); setReviewEstado(null); }}
                disabled={createLoading}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-robotoMedium disabled:opacity-50"
              >
                Cancelar
              </button>
              {!isSuperAdmin && (
                <button
                  onClick={() => handleReviewClick("draft")}
                  disabled={
                    createLoading || !createFolio.trim() || !createFecha
                  }
                  className="px-6 py-2 rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-sm font-robotoMedium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Guardar (borrador)
                </button>
              )}
              <button
                onClick={() => handleReviewClick("confirmado")}
                disabled={
                  createLoading || !createFolio.trim() || !createFecha
                }
                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-robotoMedium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {createLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Guardando…
                  </>
                ) : (
                  isSuperAdmin ? "Guardar" : "Confirmar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review popup (read-only, "¿Estás seguro/a?") ────────────────────── */}
      {reviewEstado && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5">
              <h2 className="text-lg font-robotoMedium text-gray-900 dark:text-white">
                {reviewEstado === "confirmado" ? "Confirmar orden" : "Guardar como borrador"}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Revisa la información antes de continuar. Esta vista no es editable.
              </p>
              <div className="mt-4 space-y-2 text-sm bg-gray-50 dark:bg-gray-900/40 rounded-lg p-4">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Orden</span>
                  <span className="font-medium text-gray-900 dark:text-white">{createFolio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Contenedores</span>
                  <span className="font-medium text-gray-900 dark:text-white">{createTamano || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Fecha de llegada</span>
                  <span className="font-medium text-gray-900 dark:text-white">{createFecha}</span>
                </div>
                {createFechaPedido && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Fecha de pedido</span>
                    <span className="font-medium text-gray-900 dark:text-white">{createFechaPedido}</span>
                  </div>
                )}
                {createImporteFactura && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Importe de factura</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {createImporteFacturaMoneda} {Number(createImporteFactura).toLocaleString("es-MX")}
                    </span>
                  </div>
                )}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                  <span className="text-gray-500 dark:text-gray-400 block mb-1">Productos</span>
                  <ul className="space-y-0.5">
                    {createItems.filter((i) => i.master_sku.trim()).map((i, idx) => (
                      <li key={idx} className="flex justify-between text-gray-800 dark:text-gray-200">
                        <span className="font-mono">{i.master_sku}</span>
                        <span>{i.cantidad}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">¿Estás seguro/a?</p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setReviewEstado(null)}
                disabled={createLoading}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-robotoMedium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleCreateSubmit(reviewEstado)}
                disabled={createLoading}
                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-robotoMedium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {createLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Guardando…
                  </>
                ) : (
                  "Confirmar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ───────────────────────────────────────── */}
      {deleteFolio && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5">
              <h2 className="text-lg font-robotoMedium text-gray-900 dark:text-white">
                Eliminar orden
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                ¿Seguro que deseas eliminar la orden{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {deleteFolio}
                </span>{" "}
                y todos sus productos? Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setDeleteFolio(null)}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-robotoMedium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-robotoMedium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Eliminando…
                  </>
                ) : (
                  "Eliminar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden PDF file input */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handlePdfChange}
      />
    </>
  );
}
