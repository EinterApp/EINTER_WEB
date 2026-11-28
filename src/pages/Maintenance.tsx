// Temporary maintenance / under-construction screen shown while production
// backend services are offline or undergoing updates.

export const Maintenance = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/80 p-8 sm:p-10 shadow-2xl backdrop-blur-sm animate-fade-in-up">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600/20 ring-1 ring-indigo-500/40 text-indigo-400">
            <svg
              className="h-9 w-9"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085"
              />
            </svg>
          </div>

          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-medium text-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            Mantenimiento en curso
          </span>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Página en construcción
          </h1>

          <p className="mt-2 text-sm font-medium text-indigo-300">
            Einter · Sistema de Gestión de Bodega
          </p>

          <p className="mt-5 text-sm sm:text-base leading-relaxed text-slate-300">
            Estamos realizando actualizaciones y mantenimiento temporal en nuestros servidores.
            El acceso volverá a estar disponible muy pronto.
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900 cursor-pointer"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"
              />
            </svg>
            Verificar nuevamente
          </button>

          <p className="mt-8 text-xs text-slate-500">
            Gracias por tu paciencia.
          </p>
        </div>
      </div>
    </div>
  );
};
