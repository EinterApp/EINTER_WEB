// Warehouse locations page: browses the real Ubicación -> Isla -> Tarima
// hierarchy from the DB and prints row/pallet labels directly from the list,
// plus a quick barcode lookup for when the SKU is already known.
import { useEffect, useState } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import { TarimaEtiquetaModal, type TarimaRef } from "../components/TarimaEtiquetaModal";
import { FilaEtiquetaModal } from "../components/FilaEtiquetaModal";

interface Ubicacion {
  id_ubicacion: number;
  nombre_ubicacion: string;
}

interface Isla {
  id_isla: number;
  master_sku: string;
  nombre_isla?: string | null;
  nombre_producto?: string;
  producto_sku?: string;
  tarimas_actuales?: number;
}

interface Tarima {
  id_tarima: number;
  sku: string;
  numero_secuencial: number;
  nombre_producto?: string;
  cartones_actuales?: number;
}

// Quick barcode lookup for a tarima, for when the SKU is already known
// (e.g. scanned with a handheld reader) instead of browsing the list.
function TarimaBarcodeSearch() {
  const [skuInput, setSkuInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etiquetaVisible, setEtiquetaVisible] = useState(false);
  const [tarima, setTarima] = useState<TarimaRef | null>(null);

  const handleSearch = async () => {
    const sku = skuInput.trim();
    if (!sku) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await fetchAPI(`/api/pallets?sku=${encodeURIComponent(sku)}`)) as {
        id_tarima: number;
        sku: string;
        isla_master_sku?: string | null;
      };
      setTarima({ id_tarima: res.id_tarima, sku: res.sku, isla_master_sku: res.isla_master_sku });
      setEtiquetaVisible(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={skuInput}
        onChange={(e) => setSkuInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        placeholder="Buscar tarima por MOD..."
        className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
      />
      <button
        onClick={handleSearch}
        disabled={loading || !skuInput.trim()}
        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-robotoMedium disabled:opacity-50 whitespace-nowrap"
      >
        {loading ? "Buscando..." : "Buscar tarima"}
      </button>
      {error && <p className="text-red-500 text-sm">{error}</p>}

      <TarimaEtiquetaModal
        visible={etiquetaVisible}
        tarima={tarima}
        onClose={() => setEtiquetaVisible(false)}
      />
    </div>
  );
}

// Quick barcode lookup for an isla (row), same idea as above.
function FilaBarcodeSearch() {
  const [skuInput, setSkuInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etiquetaVisible, setEtiquetaVisible] = useState(false);
  const [isla, setIsla] = useState<{ id_isla: number; master_sku: string; nombre_isla?: string | null } | null>(
    null
  );

  const handleSearch = async () => {
    const sku = skuInput.trim();
    if (!sku) return;
    setLoading(true);
    setError(null);
    try {
      const islaRes = (await fetchAPI(`/api/islands?sku=${encodeURIComponent(sku)}`)) as {
        id_isla: number;
        master_sku: string;
        nombre_isla?: string | null;
      };
      setIsla(islaRes);
      setEtiquetaVisible(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={skuInput}
        onChange={(e) => setSkuInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        placeholder="Buscar fila (isla) por MOD..."
        className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
      />
      <button
        onClick={handleSearch}
        disabled={loading || !skuInput.trim()}
        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-robotoMedium disabled:opacity-50 whitespace-nowrap"
      >
        {loading ? "Buscando..." : "Buscar fila"}
      </button>
      {error && <p className="text-red-500 text-sm">{error}</p>}

      <FilaEtiquetaModal visible={etiquetaVisible} isla={isla} onClose={() => setEtiquetaVisible(false)} />
    </div>
  );
}

// One isla row inside the detail panel: shows its own info, a print button
// for the row label, and expands on click to load and list its tarimas.
function IslaRow({ isla, onPrintFila, onPrintTarima }: {
  isla: Isla;
  onPrintFila: (isla: Isla) => void;
  onPrintTarima: (tarima: Tarima, isla: Isla) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tarimas, setTarimas] = useState<Tarima[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && tarimas === null) {
      setLoading(true);
      setError(null);
      try {
        const res = (await fetchAPI(`/api/islands/${isla.id_isla}/pallets`)) as { items: Tarima[] };
        setTarimas(res.items);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 cursor-pointer"
        onClick={toggle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gray-400 text-xs">{expanded ? "▼" : "▶"}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {isla.nombre_isla || isla.master_sku}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
              {isla.master_sku} · {isla.nombre_producto} · {isla.tarimas_actuales ?? 0} tarimas
            </p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrintFila(isla);
          }}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded hover:border-black dark:hover:border-white hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-sm shrink-0"
          title="Imprimir etiqueta de fila"
        >
          🖨️ Fila
        </button>
      </div>

      {expanded && (
        <div className="px-4 py-2">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Cargando tarimas...</p>
          ) : error ? (
            <p className="text-sm text-red-500 py-2">{error}</p>
          ) : tarimas && tarimas.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  <th className="text-left py-1.5 font-medium w-12">Pos.</th>
                  <th className="text-left py-1.5 font-medium">MOD</th>
                  <th className="text-left py-1.5 font-medium">Producto</th>
                  <th className="text-left py-1.5 font-medium">Cartones</th>
                  <th className="text-right py-1.5 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {tarimas.map((t) => (
                  <tr key={t.id_tarima} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 font-bold text-gray-900 dark:text-white">{t.numero_secuencial}</td>
                    <td className="py-2 font-mono text-gray-700 dark:text-gray-300">{t.sku}</td>
                    <td className="py-2 text-gray-700 dark:text-gray-300">{t.nombre_producto}</td>
                    <td className="py-2 text-gray-700 dark:text-gray-300">{t.cartones_actuales ?? 0}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => onPrintTarima(t, isla)}
                        className="px-2.5 py-1 border border-gray-300 dark:border-gray-600 rounded hover:border-black dark:hover:border-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xs"
                        title="Imprimir etiqueta de tarima"
                      >
                        🖨️ Tarima
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400 py-2">Esta fila no tiene tarimas registradas</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Ubicaciones() {
  useDarkMode();
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loadingUbicaciones, setLoadingUbicaciones] = useState(true);
  const [ubicacionesError, setUbicacionesError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [islas, setIslas] = useState<Isla[] | null>(null);
  const [loadingIslas, setLoadingIslas] = useState(false);
  const [islasError, setIslasError] = useState<string | null>(null);

  const [filaEtiquetaVisible, setFilaEtiquetaVisible] = useState(false);
  const [filaEtiquetaIsla, setFilaEtiquetaIsla] = useState<{
    id_isla: number;
    master_sku: string;
    nombre_isla?: string | null;
  } | null>(null);

  const [tarimaEtiquetaVisible, setTarimaEtiquetaVisible] = useState(false);
  const [tarimaEtiquetaTarima, setTarimaEtiquetaTarima] = useState<TarimaRef | null>(null);

  useEffect(() => {
    setLoadingUbicaciones(true);
    setUbicacionesError(null);
    fetchAPI("/api/locations?pageSize=200")
      .then((res: unknown) => {
        const data = res as { items: Ubicacion[] };
        setUbicaciones(data.items);
      })
      .catch((err: Error) => setUbicacionesError(err.message))
      .finally(() => setLoadingUbicaciones(false));
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setIslas(null);
      return;
    }
    setIslas(null);
    setLoadingIslas(true);
    setIslasError(null);
    fetchAPI(`/api/islands?locationId=${selectedId}&pageSize=200`)
      .then((res: unknown) => {
        const data = res as { items: Isla[] };
        setIslas(data.items);
      })
      .catch((err: Error) => setIslasError(err.message))
      .finally(() => setLoadingIslas(false));
  }, [selectedId]);

  const filtered = ubicaciones.filter((u) =>
    u.nombre_ubicacion.toLowerCase().includes(search.trim().toLowerCase())
  );

  const selectedUbicacion = ubicaciones.find((u) => u.id_ubicacion === selectedId) ?? null;

  const handlePrintFila = (isla: Isla) => {
    setFilaEtiquetaIsla({ id_isla: isla.id_isla, master_sku: isla.master_sku, nombre_isla: isla.nombre_isla });
    setFilaEtiquetaVisible(true);
  };

  const handlePrintTarima = (tarima: Tarima, isla: Isla) => {
    setTarimaEtiquetaTarima({ id_tarima: tarima.id_tarima, sku: tarima.sku, isla_master_sku: isla.master_sku });
    setTarimaEtiquetaVisible(true);
  };

  return (
    <div className="flex-1 bg-gray-50 dark:bg-gray-900 h-screen flex flex-col overflow-hidden">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
        <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white">Ubicaciones</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-4 flex flex-col md:flex-row gap-3">
        <TarimaBarcodeSearch />
        <FilaBarcodeSearch />
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 px-8 py-6 overflow-hidden">
        <aside className="md:w-80 shrink-0 flex flex-col bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar ubicación..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-3 top-2.5 text-gray-400 text-sm pointer-events-none">🔍</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingUbicaciones ? (
              <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">Cargando...</p>
            ) : ubicacionesError ? (
              <p className="px-4 py-6 text-sm text-red-500 text-center">{ubicacionesError}</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
                No hay ubicaciones
              </p>
            ) : (
              filtered.map((ubicacion) => {
                const active = selectedId === ubicacion.id_ubicacion;
                return (
                  <div
                    key={ubicacion.id_ubicacion}
                    onClick={() => setSelectedId(active ? null : ubicacion.id_ubicacion)}
                    className={`flex items-center px-4 py-3 cursor-pointer border-l-4 transition-colors ${
                      active
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                        : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/60"
                    }`}
                  >
                    <span
                      className={`text-sm truncate ${
                        active
                          ? "text-blue-700 dark:text-blue-300 font-semibold"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {ubicacion.nombre_ubicacion}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex-1 overflow-y-auto">
          {selectedUbicacion ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <h3 className="text-lg font-medium text-gray-800 dark:text-white">
                  {selectedUbicacion.nombre_ubicacion}
                </h3>
              </div>

              <div className="p-6">
                {loadingIslas ? (
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                    Cargando islas...
                  </p>
                ) : islasError ? (
                  <p className="text-center text-sm text-red-500 py-8">{islasError}</p>
                ) : islas && islas.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {islas.map((isla) => (
                      <IslaRow
                        key={isla.id_isla}
                        isla={isla}
                        onPrintFila={handlePrintFila}
                        onPrintTarima={handlePrintTarima}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 italic py-8">
                    No hay islas registradas en esta ubicación
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center h-full flex items-center justify-center">
              <div className="max-w-md mx-auto">
                <h2 className="text-xl font-light text-gray-600 dark:text-gray-400 mb-4">
                  Selecciona una ubicación
                </h2>
                <p className="text-base text-gray-500 dark:text-gray-500 leading-relaxed">
                  Haz click en una ubicación de la lista para ver sus islas y tarimas.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <FilaEtiquetaModal
        visible={filaEtiquetaVisible}
        isla={filaEtiquetaIsla}
        onClose={() => setFilaEtiquetaVisible(false)}
      />
      <TarimaEtiquetaModal
        visible={tarimaEtiquetaVisible}
        tarima={tarimaEtiquetaTarima}
        onClose={() => setTarimaEtiquetaVisible(false)}
      />
    </div>
  );
}
