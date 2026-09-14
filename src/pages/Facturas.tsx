// Facturas page: read-only view over Entradas (contenedores) — click an
// order to see it in full, view the invoice PDF already uploaded there (no
// upload here), and register payments (abonos) against the importe de
// factura captured in Entradas' create/edit form. Access is SuperAdmin only.
import { useEffect, useState } from "react";
import { useDarkMode } from "../context/DarkModeContext";
import { fetchAPI } from "../lib/fetch";
import { auth } from "../lib/firebase";
import { getMonterreyDateISO } from "../lib/dateMx";

interface OrdenRow {
  folio_orden: string;
  total_piezas: number;
  fecha_movimiento: string;
  pdf_filename: string | null;
  importe_factura: number | null;
  importe_factura_moneda: string;
}

interface PagadoRow {
  folio_orden: string;
  pagado: number;
  pagado_mxn: number;
}

interface Pago {
  id_pago: number;
  monto: number;
  tasa: number;
  monto_mxn: number;
  fecha: string;
}

interface OrdenDetalle {
  folio: string;
  tamano?: string | null;
  fecha: string;
  fecha_pedido?: string | null;
  importe_factura?: number | null;
  importe_factura_moneda?: string | null;
  total_piezas: number;
  items: { id_movimiento: number; master_sku: string; nombre_producto: string; cantidad: number }[];
}

interface PagoDetalle {
  folio: string;
  pagos: Pago[];
  pagado: number;
  pagado_mxn: number;
  importe_factura: number | null;
  importe_factura_moneda: string;
}

function formatDate(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatMoney(v: number, moneda = "MXN") {
  return v.toLocaleString("es-MX", { style: "currency", currency: moneda, minimumFractionDigits: 2 });
}

export function Facturas() {
  useDarkMode();

  const [ordenes, setOrdenes] = useState<OrdenRow[]>([]);
  const [pagados, setPagados] = useState<Record<string, PagadoRow>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [viewingPdfFolio, setViewingPdfFolio] = useState<string | null>(null);

  const [ordenDetalle, setOrdenDetalle] = useState<OrdenDetalle | null>(null);
  const [ordenDetalleLoading, setOrdenDetalleLoading] = useState(false);

  const [saldoOrden, setSaldoOrden] = useState<OrdenRow | null>(null);
  const [showSaldoGlobal, setShowSaldoGlobal] = useState(false);

  const [pagoFolio, setPagoFolio] = useState<string | null>(null);
  const [pagoDetalle, setPagoDetalle] = useState<PagoDetalle | null>(null);
  const [pagoDetalleLoading, setPagoDetalleLoading] = useState(false);
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoTasa, setPagoTasa] = useState("");
  const [pagoFecha, setPagoFecha] = useState(getMonterreyDateISO());
  const [pagoSaving, setPagoSaving] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchAPI("/api/contenedores?page=1&limit=100000"),
      fetchAPI("/api/facturas"),
    ])
      .then(([contenedoresRaw, pagadosRaw]) => {
        if (cancelled) return;
        setOrdenes((contenedoresRaw as { data: OrdenRow[] }).data ?? []);
        const map: Record<string, PagadoRow> = {};
        for (const p of (pagadosRaw as { data: PagadoRow[] }).data ?? []) {
          map[p.folio_orden] = { ...p, pagado: Number(p.pagado), pagado_mxn: Number(p.pagado_mxn) };
        }
        setPagados(map);
      })
      .catch((err) => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const openOrdenDetalle = async (folio: string) => {
    setOrdenDetalle(null);
    setOrdenDetalleLoading(true);
    try {
      const raw = (await fetchAPI(`/api/contenedores/${encodeURIComponent(folio)}`)) as OrdenDetalle;
      setOrdenDetalle(raw);
    } catch (err) {
      setToast({ ok: false, text: (err as Error).message });
    } finally {
      setOrdenDetalleLoading(false);
    }
  };

  const handleViewPdf = async (folio: string) => {
    setViewingPdfFolio(folio);
    try {
      const token = await auth.currentUser!.getIdToken(true);
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const res = await fetch(`${apiBase}/api/contenedores/${encodeURIComponent(folio)}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      setToast({ ok: false, text: `Error al abrir factura: ${(err as Error).message}` });
    } finally {
      setViewingPdfFolio(null);
    }
  };

  const openPago = async (folio: string) => {
    setPagoFolio(folio);
    setPagoDetalle(null);
    setPagoDetalleLoading(true);
    setPagoMonto(""); setPagoTasa(""); setPagoFecha(getMonterreyDateISO()); setPagoError(null);
    try {
      const raw = (await fetchAPI(`/api/facturas/${encodeURIComponent(folio)}`)) as PagoDetalle;
      setPagoDetalle(raw);
    } catch (err) {
      setToast({ ok: false, text: (err as Error).message });
    } finally {
      setPagoDetalleLoading(false);
    }
  };

  const closePago = () => { setPagoFolio(null); setPagoDetalle(null); };

  const montoMxnPreview = (Number(pagoMonto) || 0) * (Number(pagoTasa) || 0);

  const handleAddPago = async () => {
    if (!pagoFolio) return;
    if (!pagoMonto || Number(pagoMonto) <= 0) { setPagoError("Monto inválido"); return; }
    if (!pagoTasa || Number(pagoTasa) <= 0) { setPagoError("Tasa inválida"); return; }
    setPagoSaving(true);
    setPagoError(null);
    try {
      await fetchAPI(`/api/facturas/${encodeURIComponent(pagoFolio)}/pagos`, {
        method: "POST",
        body: JSON.stringify({ monto: Number(pagoMonto), tasa: Number(pagoTasa), fecha: pagoFecha }),
      });
      setPagoMonto(""); setPagoTasa("");
      await openPago(pagoFolio);
      setReload((c) => c + 1);
      setToast({ ok: true, text: "Abono registrado" });
    } catch (err) {
      setPagoError((err as Error).message);
    } finally {
      setPagoSaving(false);
    }
  };

  // Same as handleAddPago, but for the compact saldo popup: stays open and
  // just refreshes the pagados totals instead of opening the full detail.
  const handleAddPagoRapido = async (folio: string) => {
    if (!pagoMonto || Number(pagoMonto) <= 0) { setPagoError("Monto inválido"); return; }
    if (!pagoTasa || Number(pagoTasa) <= 0) { setPagoError("Tasa inválida"); return; }
    setPagoSaving(true);
    setPagoError(null);
    try {
      await fetchAPI(`/api/facturas/${encodeURIComponent(folio)}/pagos`, {
        method: "POST",
        body: JSON.stringify({ monto: Number(pagoMonto), tasa: Number(pagoTasa), fecha: pagoFecha }),
      });
      const [pagadosRaw] = await Promise.all([fetchAPI("/api/facturas")]);
      const map: Record<string, PagadoRow> = {};
      for (const p of (pagadosRaw as { data: PagadoRow[] }).data ?? []) {
        map[p.folio_orden] = { ...p, pagado: Number(p.pagado), pagado_mxn: Number(p.pagado_mxn) };
      }
      setPagados(map);
      setPagoMonto(""); setPagoTasa("");
      setToast({ ok: true, text: "Dinero agregado" });
    } catch (err) {
      setPagoError((err as Error).message);
    } finally {
      setPagoSaving(false);
    }
  };

  const ordenesConSaldo = ordenes
    .filter((o) => o.importe_factura != null && o.importe_factura_moneda === "USD")
    .map((o) => ({
      orden: o,
      saldo: Math.max(0, (o.importe_factura as number) - (pagados[o.folio_orden]?.pagado ?? 0)),
    }))
    .filter((x) => x.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);

  const saldoTotalUsd = ordenesConSaldo.reduce((s, x) => s + x.saldo, 0);

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col min-h-screen">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-wide text-gray-900 dark:text-white">Facturas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Órdenes de Entradas — consulta la factura subida y registra abonos.
          </p>
        </div>

        <button
          onClick={() => setShowSaldoGlobal(true)}
          className="text-right rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-5 py-3 hover:bg-gray-100 dark:hover:bg-gray-900/70 transition-colors"
        >
          <p className="text-xs text-gray-500 dark:text-gray-400">Saldo pendiente (USD)</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatMoney(saldoTotalUsd, "USD")}
          </p>
          <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">Ver transacciones →</p>
        </button>
      </div>

      <div className="flex-1 bg-white dark:bg-gray-800 mx-8 mt-4 mb-8 border border-gray-400 dark:border-gray-700 overflow-hidden flex flex-col rounded-lg">
        <div className="grid grid-cols-[minmax(0,1.3fr)_6rem_8rem_7rem_9rem_9rem_11rem] [&>*]:min-w-0 bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">
          <div className="py-4 px-4 border-r border-gray-400 dark:border-gray-600 text-center">Orden</div>
          <div className="py-4 px-4 border-r border-gray-400 dark:border-gray-600 text-center">Piezas</div>
          <div className="py-4 px-4 border-r border-gray-400 dark:border-gray-600 text-center">Fecha llegada</div>
          <div className="py-4 px-4 border-r border-gray-400 dark:border-gray-600 text-center">Factura</div>
          <div className="py-4 px-4 border-r border-gray-400 dark:border-gray-600 text-center">Importe</div>
          <div className="py-4 px-4 border-r border-gray-400 dark:border-gray-600 text-center">Pago</div>
          <div className="py-4 px-4 text-center">% Avance</div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-red-500">{error}</div>
          ) : ordenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <p className="text-gray-500 dark:text-gray-400 text-lg">Sin órdenes en Entradas todavía</p>
            </div>
          ) : (
            ordenes.map((orden, idx) => {
              const pago = pagados[orden.folio_orden];
              const pagado = pago?.pagado ?? 0;
              const pctRaw = orden.importe_factura ? (pagado / orden.importe_factura) * 100 : 0;
              const pct = Math.min(100, Math.max(0, pctRaw));
              return (
                <div
                  key={orden.folio_orden}
                  className={`grid grid-cols-[minmax(0,1.3fr)_6rem_8rem_7rem_9rem_9rem_11rem] [&>*]:min-w-0 border-b border-gray-200 dark:border-gray-700 ${
                    idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700/40"
                  }`}
                >
                  <div className="py-4 px-4 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <button
                      onClick={() => openOrdenDetalle(orden.folio_orden)}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm truncate"
                      title="Ver orden completa"
                    >
                      {orden.folio_orden}
                    </button>
                  </div>
                  <div className="py-4 px-4 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm">
                    {orden.total_piezas.toLocaleString("es-MX")}
                  </div>
                  <div className="py-4 px-4 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(orden.fecha_movimiento)}
                  </div>
                  <div className="py-4 px-4 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    {orden.pdf_filename ? (
                      <button
                        onClick={() => handleViewPdf(orden.folio_orden)}
                        disabled={viewingPdfFolio === orden.folio_orden}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors disabled:opacity-50"
                      >
                        {viewingPdfFolio === orden.folio_orden ? "…" : "📄 Ver"}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">Sin factura</span>
                    )}
                  </div>
                  <div className="py-4 px-4 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm font-semibold">
                    {orden.importe_factura != null ? (
                      <button
                        onClick={() => {
                          setSaldoOrden(orden);
                          setPagoMonto(""); setPagoTasa(""); setPagoFecha(getMonterreyDateISO()); setPagoError(null);
                        }}
                        className="hover:underline decoration-dotted"
                        title="Ver saldo"
                      >
                        {formatMoney(orden.importe_factura, orden.importe_factura_moneda)}
                      </button>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 font-normal">-</span>
                    )}
                  </div>
                  <div className="py-4 px-4 border-r border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <button
                      onClick={() => openPago(orden.folio_orden)}
                      className="text-xs px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap"
                    >
                      Registrar pago
                    </button>
                  </div>
                  <div className="py-4 px-4 flex items-center justify-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                      <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-9 text-right shrink-0">{pct.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-sm w-full p-4 rounded-lg shadow-lg border ${
            toast.ok
              ? "bg-green-50 dark:bg-green-900/80 border-green-300 dark:border-green-600 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-900/80 border-red-300 dark:border-red-600 text-red-800 dark:text-red-200"
          }`}
        >
          <span className="text-sm">{toast.text}</span>
        </div>
      )}

      {/* Orden detalle modal (read-only) */}
      {(ordenDetalle || ordenDetalleLoading) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOrdenDetalle(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl flex flex-col max-h-[80vh] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-medium text-gray-900 dark:text-white">{ordenDetalle?.folio ?? "Cargando…"}</h2>
                {ordenDetalle && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Llegada: {formatDate(ordenDetalle.fecha)}
                    {ordenDetalle.fecha_pedido ? ` · Pedido: ${formatDate(ordenDetalle.fecha_pedido)}` : ""}
                  </p>
                )}
              </div>
              <button onClick={() => setOrdenDetalle(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              {ordenDetalleLoading || !ordenDetalle ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300 dark:border-gray-600 text-left text-xs text-gray-500 dark:text-gray-400">
                      <th className="py-2 pr-3">Modelo</th>
                      <th className="py-2 pr-3">Nombre</th>
                      <th className="py-2 text-right">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenDetalle.items.map((it) => (
                      <tr key={it.id_movimiento} className="border-b border-gray-100 dark:border-gray-700">
                        <td className="py-2 pr-3 font-mono text-xs">{it.master_sku}</td>
                        <td className="py-2 pr-3">{it.nombre_producto}</td>
                        <td className="py-2 text-right font-medium">{it.cantidad.toLocaleString("es-MX")}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                      <td colSpan={2} className="py-2 pr-3 text-right font-semibold">Total piezas:</td>
                      <td className="py-2 text-right font-bold">{ordenDetalle.total_piezas.toLocaleString("es-MX")}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Saldo global (esquina superior derecha) */}
      {showSaldoGlobal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSaldoGlobal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Saldo pendiente (USD)</h2>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{formatMoney(saldoTotalUsd, "USD")}</p>
              </div>
              <button onClick={() => setShowSaldoGlobal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
            </div>
            <div className="max-h-80 overflow-auto">
              {ordenesConSaldo.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 p-6 text-center">Sin saldos pendientes en USD.</p>
              ) : (
                ordenesConSaldo.map(({ orden, saldo }) => (
                  <button
                    key={orden.folio_orden}
                    onClick={() => { setShowSaldoGlobal(false); openPago(orden.folio_orden); }}
                    className="w-full flex items-center justify-between px-6 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                  >
                    <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{orden.folio_orden}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatMoney(saldo, "USD")}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mini ventana de saldo */}
      {saldoOrden && saldoOrden.importe_factura != null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSaldoOrden(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-5">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mb-1">{saldoOrden.folio_orden}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Saldo pendiente</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {formatMoney(
                  Math.max(0, saldoOrden.importe_factura - (pagados[saldoOrden.folio_orden]?.pagado ?? 0)),
                  saldoOrden.importe_factura_moneda
                )}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                de {formatMoney(saldoOrden.importe_factura, saldoOrden.importe_factura_moneda)} total
              </p>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Agregar dinero (abono)</h3>
              {pagoError && <p className="text-sm text-red-500 mb-2">{pagoError}</p>}
              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Monto</label>
                  <input type="number" min="0" step="0.01" value={pagoMonto} onChange={(e) => setPagoMonto(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tasa</label>
                  <input type="number" min="0" step="0.0001" value={pagoTasa} onChange={(e) => setPagoTasa(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
                  <input type="date" value={pagoFecha} onChange={(e) => setPagoFecha(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Equivalente en MXN: <span className="font-semibold text-gray-600 dark:text-gray-300">{formatMoney(montoMxnPreview)}</span>
              </p>
              <button
                onClick={() => handleAddPagoRapido(saldoOrden.folio_orden)}
                disabled={pagoSaving}
                className="w-full mt-3 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {pagoSaving ? "Guardando…" : "+ Agregar dinero"}
              </button>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { const folio = saldoOrden.folio_orden; setSaldoOrden(null); openPago(folio); }}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium"
              >
                Ver todas las transacciones
              </button>
              <button onClick={() => setSaldoOrden(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Registrar pago modal */}
      {pagoFolio && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl flex flex-col max-h-[85vh] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-medium text-gray-900 dark:text-white">Pagos — {pagoFolio}</h2>
              <button onClick={closePago} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
              {pagoDetalleLoading || !pagoDetalle ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : (
                <>
                  {pagoDetalle.importe_factura != null && (
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-3 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, (pagoDetalle.pagado / (pagoDetalle.importe_factura || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {formatMoney(pagoDetalle.pagado, pagoDetalle.importe_factura_moneda)} / {formatMoney(pagoDetalle.importe_factura, pagoDetalle.importe_factura_moneda)}
                      </span>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Abonos</h3>
                    {pagoDetalle.pagos.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Sin abonos registrados todavía.</p>
                    ) : (
                      <div className="space-y-1">
                        {pagoDetalle.pagos.map((p) => (
                          <div key={p.id_pago} className="flex justify-between text-sm py-1.5 px-3 rounded bg-gray-50 dark:bg-gray-900/40">
                            <span className="text-gray-600 dark:text-gray-400">{p.fecha?.slice(0, 10)}</span>
                            <span className="text-gray-900 dark:text-gray-100">{p.monto.toLocaleString("es-MX")} × {p.tasa}</span>
                            <span className="font-semibold text-green-600 dark:text-green-400">{formatMoney(p.monto_mxn)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Agregar abono</h3>
                    {pagoError && <p className="text-sm text-red-500 mb-2">{pagoError}</p>}
                    <div className="grid grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Monto</label>
                        <input type="number" min="0" step="0.01" value={pagoMonto} onChange={(e) => setPagoMonto(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tasa</label>
                        <input type="number" min="0" step="0.0001" value={pagoTasa} onChange={(e) => setPagoTasa(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
                        <input type="date" value={pagoFecha} onChange={(e) => setPagoFecha(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                      </div>
                      <button onClick={handleAddPago} disabled={pagoSaving}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50">
                        {pagoSaving ? "…" : "Agregar"}
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      Equivalente en MXN: <span className="font-semibold text-gray-600 dark:text-gray-300">{formatMoney(montoMxnPreview)}</span>
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={closePago}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
