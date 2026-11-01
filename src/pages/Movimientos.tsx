// Page listing the unified history of goods in/out and between ubicaciones, read from
// GET /api/historial (contenedores, salidas THD, ordenes, transferencias and merma).
import { useState, useEffect, useCallback } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { ColumnFilter, distinctValues } from "../components/ColumnFilter";

interface HistorialItem {
  origen: "contenedor" | "thd_salida" | "orden" | "movimiento" | "merma";
  tipo: "entrada" | "salida" | "transferencia" | "merma";
  fecha: string | null;
  referencia: string | null;
  id_articulo: number | null;
  sku: string | null;
  producto_nombre: string | null;
  cantidad: number | null;
  estado: string | null;
  ubicacion_origen_nombre: string | null;
  ubicacion_destino_nombre: string | null;
  usuario: string | null;
}

const ORIGEN_LABEL: Record<HistorialItem["origen"], string> = {
  contenedor: "Contenedor",
  thd_salida: "Salida THD",
  orden: "Orden",
  movimiento: "Transferencia",
  merma: "Merma",
};

const TIPO_LABEL: Record<HistorialItem["tipo"], string> = {
  entrada: "Entrada",
  salida: "Salida",
  transferencia: "Transferencia",
  merma: "Merma",
};

const TIPO_BADGE: Record<HistorialItem["tipo"], string> = {
  entrada: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  salida: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  transferencia: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  merma: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

const ubicacionText = (m: HistorialItem) =>
  m.ubicacion_origen_nombre || m.ubicacion_destino_nombre
    ? `${m.ubicacion_origen_nombre ?? "-"} → ${m.ubicacion_destino_nombre ?? "-"}`
    : "";

const fechaText = (m: HistorialItem) => (m.fecha ? new Date(m.fecha).toLocaleDateString() : "");

const COL_ACCESSORS: Record<string, (m: HistorialItem) => string> = {
  date: fechaText,
  tipo: (m) => TIPO_LABEL[m.tipo] ?? m.tipo,
  origen: (m) => ORIGEN_LABEL[m.origen] ?? m.origen,
  referencia: (m) => m.referencia || "",
  sku: (m) => m.sku || "",
  producto: (m) => m.producto_nombre || "",
  cantidad: (m) => String(m.cantidad ?? ""),
  ubicacion: ubicacionText,
};

const COLUMN_DEFS: { key: string; label: string }[] = [
  { key: "date", label: "Fecha" },
  { key: "tipo", label: "Tipo" },
  { key: "origen", label: "Documento" },
  { key: "referencia", label: "Referencia" },
  { key: "sku", label: "SKU" },
  { key: "producto", label: "Producto" },
  { key: "cantidad", label: "Cantidad" },
  { key: "ubicacion", label: "Ubicación" },
];

const TABLE_GRID_COLUMNS =
  "minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,1.3fr) minmax(0,2fr) minmax(0,0.9fr) minmax(0,1.6fr)";

export function Movimientos() {
  useDarkMode();
  const [movimientos, setMovimientos] = useState<HistorialItem[]>([]);
  const [filteredMovimientos, setFilteredMovimientos] = useState<HistorialItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<{
    column: string;
    direction: "asc" | "desc";
  } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});

  const fetchMovimientos = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = (await fetchAPI("/api/historial?pageSize=100000")) as {
        items?: HistorialItem[];
      };
      const items = res.items || [];
      setMovimientos(items);
      setFilteredMovimientos(items);
    } catch (err) {
      console.error("Error fetching historial from database:", err);
      setError(err instanceof Error ? err.message : "Error connecting to database");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovimientos();
  }, []);

  useRefetchOnFocus(fetchMovimientos);

  const applyFilters = useCallback(() => {
    let filtered = [...movimientos];

    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.referencia?.toLowerCase().includes(query) ||
          m.sku?.toLowerCase().includes(query) ||
          m.producto_nombre?.toLowerCase().includes(query) ||
          ubicacionText(m).toLowerCase().includes(query) ||
          (TIPO_LABEL[m.tipo] ?? "").toLowerCase().includes(query)
      );
    }

    // Excel-style per-column value filters
    for (const [key, vals] of Object.entries(colFilters)) {
      if (vals.length) {
        const accessor = COL_ACCESSORS[key];
        filtered = filtered.filter((m) => vals.includes(accessor(m)));
      }
    }

    if (sortBy) {
      filtered.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (sortBy.column) {
          case "date":
            aValue = a.fecha || "";
            bValue = b.fecha || "";
            break;
          case "cantidad":
            aValue = a.cantidad || 0;
            bValue = b.cantidad || 0;
            break;
          case "tipo":
          case "origen":
          case "referencia":
          case "sku":
          case "producto":
          case "ubicacion":
            aValue = COL_ACCESSORS[sortBy.column](a).toLowerCase();
            bValue = COL_ACCESSORS[sortBy.column](b).toLowerCase();
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortBy.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortBy.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    setFilteredMovimientos(filtered);
  }, [movimientos, searchText, sortBy, colFilters]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const clearFilters = () => {
    setSearchText("");
    setSortBy(null);
    setColFilters({});
  };

  const hasColFilters = Object.values(colFilters).some((v) => v.length > 0);

  const WebView = (
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
        <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white">
          Movimientos
        </h1>

        <div className="flex-row items-center mt-4 gap-3">
          {(searchText || sortBy || hasColFilters) && (
            <button
              onClick={clearFilters}
              className="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium"
            >
              Limpiar Filtros
            </button>
          )}
          {searchText && (
            <div className="bg-blue-100 dark:bg-blue-900 px-3 py-2 rounded-lg">
              <span className="text-blue-700 dark:text-blue-300 text-sm font-medium">
                Buscando: "{searchText}"
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg">
            <p className="text-red-700 dark:text-red-300">Error: {error}</p>
            <button
              onClick={() => fetchMovimientos()}
              className="mt-2"
            >
              <span className="text-red-600 dark:text-red-400 underline">Reintentar</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 bg-white dark:bg-gray-800 mx-8 mt-4 border border-gray-400 dark:border-gray-700 overflow-hidden flex flex-col rounded-lg">
        <div
          className="grid [&>*]:min-w-0 bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-600"
          style={{ gridTemplateColumns: TABLE_GRID_COLUMNS }}
        >
          {COLUMN_DEFS.map((col, i) => (
            <div
              key={col.key}
              className={`py-4 px-2 flex items-center justify-center ${
                i < COLUMN_DEFS.length - 1 ? "border-r border-gray-400 dark:border-gray-600" : ""
              }`}
            >
              <ColumnFilter
                label={col.label}
                textClass="text-base"
                options={distinctValues(movimientos, COL_ACCESSORS[col.key])}
                selected={colFilters[col.key] ?? []}
                onChange={(next) =>
                  setColFilters((prev) => ({ ...prev, [col.key]: next }))
                }
                sortDir={sortBy?.column === col.key ? sortBy.direction : null}
                onSort={(dir) => setSortBy({ column: col.key, direction: dir })}
              />
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {loading && movimientos.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 font-robotoRegular mt-4">
                  Cargando movimientos...
                </p>
              </div>
            </div>
          ) : filteredMovimientos.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-20">
              <p className="text-gray-500 font-robotoRegular">
                No se encontraron movimientos
              </p>
            </div>
          ) : (
            filteredMovimientos.map((m, index) => {
              const cell = "py-4 px-4 border-r border-gray-300 dark:border-gray-700 flex items-center justify-center";
              const text = "text-gray-900 dark:text-white font-robotoRegular text-lg text-center break-words";
              return (
                <div
                  key={`${m.origen}-${m.referencia}-${m.id_articulo}-${index}`}
                  className={`grid [&>*]:min-w-0 border-b border-gray-300 dark:border-gray-700 ${
                    index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"
                  }`}
                  style={{ gridTemplateColumns: TABLE_GRID_COLUMNS }}
                >
                  <div className={cell}>
                    <span className={text}>{fechaText(m) || "-"}</span>
                  </div>
                  <div className={cell}>
                    <span
                      className={`px-2 py-1 rounded-full text-sm font-medium ${TIPO_BADGE[m.tipo] ?? ""}`}
                    >
                      {TIPO_LABEL[m.tipo] ?? m.tipo}
                    </span>
                  </div>
                  <div className={cell}>
                    <span className={text}>{ORIGEN_LABEL[m.origen] ?? m.origen}</span>
                  </div>
                  <div className={cell}>
                    <span className={text}>{m.referencia || "-"}</span>
                  </div>
                  <div className={cell}>
                    <span className={text}>{m.sku || "-"}</span>
                  </div>
                  <div className={cell}>
                    <span className={text}>{m.producto_nombre || "-"}</span>
                  </div>
                  <div className={cell}>
                    <span className={text}>{m.cantidad || "-"}</span>
                  </div>
                  <div className="py-4 px-4 flex items-center justify-center">
                    <span className={text}>{ubicacionText(m) || "-"}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return WebView;
}