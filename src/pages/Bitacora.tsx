// Bitácora (audit log) page: read-only history of who did what, when, and
// on which module. SuperAdmin only.
import { useEffect, useState } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";

interface BitacoraRow {
  id_bitacora: number;
  usuario_id: string;
  usuario_email: string | null;
  modulo: string;
  accion: string;
  entidad: string | null;
  detalle: string | null;
  fecha: string;
}

const MODULOS = ["entradas", "salidas", "facturas", "productos", "usuarios"];

function formatFecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

export function Bitacora() {
  useDarkMode();

  const [rows, setRows] = useState<BitacoraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [usuario, setUsuario] = useState("");
  const [modulo, setModulo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "200" });
    if (usuario.trim()) params.set("usuario", usuario.trim());
    if (modulo) params.set("modulo", modulo);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);

    fetchAPI(`/api/bitacora?${params.toString()}`)
      .then((raw) => { if (!cancelled) setRows((raw as { data: BitacoraRow[] }).data ?? []); })
      .catch((err) => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [usuario, modulo, desde, hasta]);

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6">
        <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white mb-4">Bitácora</h1>

        <div className="flex flex-wrap items-center gap-3">
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Buscar por usuario..."
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm w-56"
          />
          <select
            value={modulo}
            onChange={(e) => setModulo(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="">Todos los módulos</option>
            {MODULOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
          <span className="text-xs text-gray-500 dark:text-gray-400">a</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
        </div>
      </div>

      <div className="flex-1 bg-white dark:bg-gray-800 mx-8 mt-4 mb-8 border border-gray-400 dark:border-gray-700 overflow-hidden flex flex-col rounded-lg">
        <div className="grid grid-cols-[10rem_1fr_8rem_10rem_10rem] bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">
          <div className="py-3 px-3 border-r border-gray-400 dark:border-gray-600">Fecha</div>
          <div className="py-3 px-3 border-r border-gray-400 dark:border-gray-600">Usuario</div>
          <div className="py-3 px-3 border-r border-gray-400 dark:border-gray-600">Módulo</div>
          <div className="py-3 px-3 border-r border-gray-400 dark:border-gray-600">Acción</div>
          <div className="py-3 px-3">Entidad</div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-20 text-red-500">{error}</div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-gray-500 dark:text-gray-400">
              Sin registros de bitácora
            </div>
          ) : (
            rows.map((r, idx) => (
              <div key={r.id_bitacora}>
                <div
                  onClick={() => setExpandedId(expandedId === r.id_bitacora ? null : r.id_bitacora)}
                  className={`grid grid-cols-[10rem_1fr_8rem_10rem_10rem] border-b border-gray-200 dark:border-gray-700 cursor-pointer ${
                    idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700/40"
                  } hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}
                >
                  <div className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400">
                    {formatFecha(r.fecha)}
                  </div>
                  <div className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-600 text-sm truncate" title={r.usuario_email ?? r.usuario_id}>
                    {r.usuario_email ?? r.usuario_id}
                  </div>
                  <div className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-600 text-sm">{r.modulo}</div>
                  <div className="py-2.5 px-3 border-r border-gray-200 dark:border-gray-600 text-sm">{r.accion}</div>
                  <div className="py-2.5 px-3 text-sm font-mono truncate">{r.entidad || "-"}</div>
                </div>
                {expandedId === r.id_bitacora && r.detalle && (
                  <div className="px-6 py-2 bg-gray-50 dark:bg-gray-900/40 text-xs text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    {r.detalle}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
