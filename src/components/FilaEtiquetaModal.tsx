import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { fetchAPI } from "../lib/fetch";
import { useDarkMode } from "../context/DarkModeContext";

// Prints one label for an entire isla (warehouse row): a single barcode for
// the row plus a table of every tarima position in it (in physical order)
// with the products and quantities each position holds. Meant to be stuck on
// the row itself, not on each individual tarima. Reads from our own BD via
// GET /api/islands/:id/pallets and GET /api/pallets/:id/cartons.
interface FilaIsla {
  id_isla: number;
  master_sku: string;
  nombre_isla?: string | null;
}

interface FilaPosicion {
  numero_secuencial: number;
  tarima_sku: string;
  productos: { nombre_producto: string; cantidad: number }[];
}

interface FilaEtiquetaModalProps {
  visible: boolean;
  isla: FilaIsla | null;
  onClose: () => void;
}

export function FilaEtiquetaModal({ visible, isla, onClose }: FilaEtiquetaModalProps) {
  useDarkMode();
  const svgRef = useRef<SVGSVGElement>(null);
  const [posiciones, setPosiciones] = useState<FilaPosicion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !isla) return;

    setPosiciones([]);
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const tarimasRes = (await fetchAPI(
          `/api/islands/${isla.id_isla}/pallets`
        )) as { items: { id_tarima: number; sku: string; numero_secuencial: number }[] };

        const withCartones = await Promise.all(
          tarimasRes.items.map(async (t) => {
            const cartonesRes = (await fetchAPI(
              `/api/pallets/${t.id_tarima}/cartons`
            )) as { items: { nombre_producto: string; cantidad_unidades: number }[] };

            const porProducto = new Map<string, number>();
            for (const c of cartonesRes.items) {
              porProducto.set(
                c.nombre_producto,
                (porProducto.get(c.nombre_producto) ?? 0) + c.cantidad_unidades
              );
            }

            const posicion: FilaPosicion = {
              numero_secuencial: t.numero_secuencial,
              tarima_sku: t.sku,
              productos: Array.from(porProducto, ([nombre_producto, cantidad]) => ({
                nombre_producto,
                cantidad,
              })),
            };
            return posicion;
          })
        );

        setPosiciones(withCartones.sort((a, b) => a.numero_secuencial - b.numero_secuencial));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, isla]);

  useEffect(() => {
    if (!isla || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, isla.master_sku, {
        format: "CODE128",
        width: 2,
        height: 55,
        displayValue: true,
        fontSize: 13,
        margin: 6,
      });
    } catch {
      // master_sku contains characters CODE128 can't encode, label still renders without the barcode
    }
  }, [isla]);

  if (!visible || !isla) return null;

  const handlePrint = () => window.print();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Etiqueta de fila</h2>
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Cargando posiciones de la fila...</p>
            </div>
          ) : error ? (
            <p className="text-center text-red-500 py-8 text-sm">{error}</p>
          ) : (
            <div id="etiqueta-print-area" className="flex flex-col items-center gap-3 border border-gray-300 dark:border-gray-600 rounded p-4">
              <p className="font-bold text-gray-900 dark:text-white text-center">
                {isla.nombre_isla || isla.master_sku}
              </p>
              <svg ref={svgRef} />
              {posiciones.length === 0 ? (
                <p className="text-center text-sm text-gray-400">Esta fila no tiene tarimas registradas</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-300 dark:border-gray-600">
                      <th className="text-left py-1 w-12">Pos.</th>
                      <th className="text-left py-1">Tarima</th>
                      <th className="text-left py-1">Productos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posiciones.map((p) => (
                      <tr key={p.numero_secuencial} className="border-b border-gray-100 dark:border-gray-700 align-top">
                        <td className="py-1.5 font-bold">{p.numero_secuencial}</td>
                        <td className="py-1.5 font-mono">{p.tarima_sku}</td>
                        <td className="py-1.5">
                          {p.productos.length === 0
                            ? "Vacía"
                            : p.productos.map((prod, i) => (
                                <div key={i}>
                                  {prod.nombre_producto}: {prod.cantidad}
                                </div>
                              ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
            disabled={loading || posiciones.length === 0}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
