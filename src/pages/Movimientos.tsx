// Page listing inventory movements between locations.
import { useState, useEffect, useCallback } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import type { Movement as Movimiento } from "../lib/types";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { ColumnFilter, distinctValues } from "../components/ColumnFilter";

const COL_ACCESSORS: Record<string, (m: Movimiento) => string> = {
  nombre: (m) => m.nombre_usuario || "",
  from: (m) => String(m.id_ubicacion_origen || ""),
  to: (m) => String(m.id_ubicacion_destino || ""),
  oldMasterSku: (m) => m.old_masterSKU || "",
  newMasterSku: (m) => m.new_masterSKU || "",
  cantidad: (m) => String(m.cantidad ?? ""),
  date: (m) => (m.fecha ? new Date(m.fecha).toLocaleDateString() : ""),
};

const COLUMN_DEFS: { key: string; label: string }[] = [
  { key: "nombre", label: "Nombre" },
  { key: "from", label: "Desde" },
  { key: "to", label: "Hacia" },
  { key: "oldMasterSku", label: "MOD Antiguo" },
  { key: "newMasterSku", label: "MOD Nuevo" },
  { key: "cantidad", label: "Cantidad" },
  { key: "date", label: "Fecha" },
];

const TABLE_GRID_COLUMNS =
  "minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.5fr) minmax(0,1.5fr) minmax(0,1fr) minmax(0,1.2fr)";

export function Movimientos() {
  useDarkMode();
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [filteredMovimientos, setFilteredMovimientos] = useState<Movimiento[]>(
    []
  );
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
      // Fetch both entradas and salidas from Odoo endpoints
      const [entradasRes, salidasRes] = await Promise.all([
        fetchAPI("/api/catalogo/entradas"),
        fetchAPI("/api/catalogo/salidas"),
      ]) as [{ items?: Record<string, unknown>[] }, { items?: Record<string, unknown>[] }];

      // Map Odoo fields to Movement type
      const mapItem = (item: Record<string, unknown>): Movimiento => ({
        id_movimiento: Number(item.id_movimiento) || 0,
        id_usuario: 0,
        id_ubicacion_origen: 0,
        id_ubicacion_destino: 0,
        tipo: item.tipo === "entrada" || item.tipo === "compra" ? 1 : 2,
        id_tarima: 0,
        id_articulo: 0,
        cantidad: Number(item.cantidad) || 0,
        old_masterSKU: String(item.master_sku || ""),
        new_masterSKU: String(item.master_sku || ""),
        fecha: String(item.fecha_movimiento || ""),
        nombre_usuario: String(item.nombre_producto || ""),
      });

      const allItems = [
        ...(entradasRes.items || []).map(mapItem),
        ...(salidasRes.items || []).map(mapItem),
      ].sort((a, b) => b.id_movimiento - a.id_movimiento);

      setMovimientos(allItems);
      setFilteredMovimientos(allItems);
    } catch (err) {
      console.error("Error fetching movimientos from database:", err);
      setError(
        err instanceof Error ? err.message : "Error connecting to database"
      );
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
          m.old_masterSKU?.toLowerCase().includes(query) ||
          m.new_masterSKU?.toLowerCase().includes(query) ||
          m.nombre_usuario?.toLowerCase().includes(query) ||
          String(m.id_ubicacion_origen || "").includes(query) ||
          String(m.id_ubicacion_destino || "").includes(query) ||
          m.fecha?.toLowerCase().includes(query)
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
          case "nombre":
            aValue = (a.nombre_usuario || "").toLowerCase();
            bValue = (b.nombre_usuario || "").toLowerCase();
            break;
          case "from":
            aValue = a.id_ubicacion_origen || 0;
            bValue = b.id_ubicacion_origen || 0;
            break;
          case "to":
            aValue = a.id_ubicacion_destino || 0;
            bValue = b.id_ubicacion_destino || 0;
            break;
          case "oldMasterSku":
            aValue = (a.old_masterSKU || "").toLowerCase();
            bValue = (b.old_masterSKU || "").toLowerCase();
            break;
          case "newMasterSku":
            aValue = (a.new_masterSKU || "").toLowerCase();
            bValue = (b.new_masterSKU || "").toLowerCase();
            break;
          case "cantidad":
            aValue = a.cantidad || 0;
            bValue = b.cantidad || 0;
            break;
          case "date":
            aValue = a.fecha || "";
            bValue = b.fecha || "";
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
            filteredMovimientos.map((m, index) => (
              <div
                key={m.id_movimiento}
                className={`grid [&>*]:min-w-0 border-b border-gray-300 dark:border-gray-700 ${
                  index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"
                }`}
                style={{ gridTemplateColumns: TABLE_GRID_COLUMNS }}
              >
                <div className="flex-[1.5] py-4 px-4 border-r border-gray-300 dark:border-gray-700 flex items-center justify-center">
                  <span className="text-gray-900 dark:text-white font-robotoRegular text-lg text-center">
                    {m.nombre_usuario}
                  </span>
                </div>
                <div className="flex-1 py-4 px-4 border-r border-gray-300 dark:border-gray-700 flex items-center justify-center">
                  <span className="text-gray-900 dark:text-white font-robotoRegular text-lg text-center">
                    {m.id_ubicacion_origen || "-"}
                  </span>
                </div>
                <div className="flex-1 py-4 px-4 border-r border-gray-300 dark:border-gray-700 flex items-center justify-center">
                  <span className="text-gray-900 dark:text-white font-robotoRegular text-lg text-center">
                    {m.id_ubicacion_destino || "-"}
                  </span>
                </div>
                <div className="flex-[1.5] py-4 px-4 border-r border-gray-300 dark:border-gray-700 flex items-center justify-center">
                  <span className="text-gray-900 dark:text-white font-robotoRegular text-lg text-center">
                    {m.old_masterSKU || "-"}
                  </span>
                </div>
                <div className="flex-[1.5] py-4 px-4 border-r border-gray-300 dark:border-gray-700 flex items-center justify-center">
                  <span className="text-gray-900 dark:text-white font-robotoRegular text-lg text-center">
                    {m.new_masterSKU || "-"}
                  </span>
                </div>
                <div className="flex-1 py-4 px-4 border-r border-gray-300 dark:border-gray-700 flex items-center justify-center">
                  <span className="text-gray-900 dark:text-white font-robotoRegular text-lg text-center">
                    {m.cantidad || "-"}
                  </span>
                </div>
                <div className="flex-[1.2] py-4 px-4 flex items-center justify-center">
                  <span className="text-gray-900 dark:text-white font-robotoRegular text-lg text-center">
                    {m.fecha ? new Date(m.fecha).toLocaleDateString() : "-"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return WebView;
}