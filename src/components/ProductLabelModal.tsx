import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { fetchAPI } from "../lib/fetch";
import { useDarkMode } from "../context/DarkModeContext";

// Modal that looks up one or more products by SKU and prints their barcode
// labels laid out in a fixed-size grid (see .etiqueta-label-grid in index.css)
// so labels line up consistently on a sheet instead of stretching across the page.
interface ProductoLocal {
  id: number;
  sku: string;
  name: string;
}

interface EtiquetaModalProps {
  visible: boolean;
  masterSkus: string[];
  onClose: () => void;
}

function LabelBarcode({ sku }: { sku: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, sku, {
        format: "CODE128",
        width: 1.3,
        height: 40,
        displayValue: true,
        fontSize: 11,
        margin: 4,
      });
    } catch {
      // sku contains characters CODE128 can't encode, label still renders without the barcode
    }
  }, [sku]);

  return <svg ref={svgRef} style={{ maxWidth: "100%", height: "auto" }} />;
}

export function ProductLabelModal({ visible, masterSkus, onClose }: EtiquetaModalProps) {
  useDarkMode();
  const [productos, setProductos] = useState<ProductoLocal[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || masterSkus.length === 0) return;

    setProductos([]);
    setNotFound([]);
    setError(null);
    setLoading(true);

    Promise.all(
      masterSkus.map(async (sku) => {
        const res = (await fetchAPI(
          `/api/products?search=${encodeURIComponent(sku)}&pageSize=5`
        )) as { items?: ProductoLocal[] };
        return (res.items ?? []).find((p) => p.sku === sku) ?? null;
      })
    )
      .then((results) => {
        const found = results.filter((p): p is ProductoLocal => p !== null);
        const missing = masterSkus.filter((_, i) => results[i] === null);
        setProductos(found);
        setNotFound(missing);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [visible, masterSkus]);

  if (!visible) return null;

  const handlePrint = () => window.print();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Etiquetas de producto {productos.length > 0 && `(${productos.length})`}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none px-1"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6 overflow-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Buscando productos...</p>
            </div>
          ) : error ? (
            <p className="text-center text-red-500 py-8 text-sm">{error}</p>
          ) : productos.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">Sin datos</p>
          ) : (
            <>
              {notFound.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  No encontrado: {notFound.join(", ")}
                </p>
              )}
              <div id="etiqueta-print-area" className="etiqueta-label-grid">
                {productos.map((p) => (
                  <div key={p.id} className="etiqueta-label border border-gray-300 dark:border-gray-600 rounded">
                    <p className="text-xs font-bold text-gray-900 dark:text-white text-center line-clamp-2 px-1">
                      {p.name}
                    </p>
                    <LabelBarcode sku={p.sku} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cerrar
          </button>
          <button
            onClick={handlePrint}
            disabled={productos.length === 0}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
