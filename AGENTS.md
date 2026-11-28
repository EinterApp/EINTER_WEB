# AGENTS.md — EinterWeb

Frontend React + TypeScript + Vite. **Es la fuente de verdad del sistema**: sus llamadas a `EINTER_API` son las que el cliente ya usa y valida en producción. Al 2026-11-28, los tres repos (`EINTER_API`, `EINTER_WEB` y `EINTER_MOBILE`) están alineados sobre las rutas REST estandarizadas en inglés.

## Arrancar en local

```bash
npm install
npm run dev   # Vite, puerto 5173
```

## Probar en local sin datos reales

```bash
(cd ../EINTER_API && npm run local:up)   # MySQL + Auth emulado + API en :3055
npm run dev:local                        # esta web contra ese entorno (.env.docker)
```

"Iniciar sesión con Google" debe abrir el emulador para elegir una cuenta de prueba. **No verificado en un navegador real:** el inicio de sesión contra el emulador se probó por consola.

## Bug: editar un producto podía "no guardar" (corregido 2026-10-02)

Reporte de usuaria: edita un producto, guarda, y la ficha sigue mostrando los datos viejos. Causa: `openEditModal` en `Productos.tsx` abría el modal **instantáneamente** con el item de la lista (que no trae `category`, por eso existe un segundo fetch a `GET /api/productos?id=` para completarlo) y luego, cuando ese fetch resolvía en segundo plano, volvía a hacer `setSelectedProduct(...)` con los datos frescos — lo cual re-disparaba el `useEffect` de `ProductModal.tsx` que repuebla `formData` desde `product`. Si la usuaria ya había empezado a escribir antes de que ese segundo fetch resolviera, su edición se pisaba silenciosamente con los datos (sin cambios) del servidor, y al día siguiente guardaba exactamente lo mismo que ya había — sin ningún error, porque técnicamente no hubo conflicto de `updated_at`, solo se perdió la edición antes de llegar al PUT.

Fix: `openEditModal` ahora espera (`await`) el fetch de `GET /api/productos?id=` **antes** de mostrar el modal, en vez de abrirlo con datos viejos y refrescarlo por debajo. El botón "Editar" se deshabilita (muestra "...") mientras carga, vía el nuevo estado `editLoadingId`. Ya no hay una segunda escritura a `selectedProduct` después de que el modal es visible, así que no hay ventana para que un fetch en segundo plano pise lo que la usuaria está escribiendo.

## Más bugs latentes corregidos (auditoría 2026-10-02)

- **`Entradas.tsx` `handleOpenEdit` tenía el mismo bug que `Productos.tsx`** (ver arriba): abría el modal de inmediato con campos vacíos/viejos y los llenaba después de un `await fetchAPI(/api/contenedores/${folio})`, sin ningún `disabled` en los inputs mientras tanto — editar un campo antes de que ese fetch resolviera se perdía en silencio. Mismo fix: ahora espera el fetch antes de abrir el modal (nuevo estado `editLoadingFolio`, deshabilita el botón ✏️ mientras carga). Si el fetch falla, el modal sí se abre (sin datos) para mostrar el error, ya que `createError` solo se renderiza dentro del modal.
- **`Salidas.tsx` "Confirmar"/"Botar" tragaban el error en silencio** (`catch {}` vacío, con un comentario que literalmente decía "toast pattern not present in this page"). Si el `PATCH` fallaba, el botón solo dejaba de girar sin avisar nada — el usuario creía que había funcionado. Se le agregó el mismo patrón de toast que ya usa `Entradas.tsx` (estado `toast`, auto-dismiss a 3.5s, notificación verde/roja abajo a la derecha).

Pendiente, no resuelto en esta pasada: solo `Productos.tsx` tiene el chequeo de conflicto por `updated_at` — `Categorias.tsx`, `Proveedores.tsx` y los flujos de Entradas/Salidas no lo tienen, así que dos personas editando lo mismo a la vez se pisan sin aviso. No se tocó porque requiere decidir primero si vale la pena extender el patrón a esos dominios (y confirmar que el backend lo soporta en cada uno) antes de implementarlo.

## Roles simplificados a 2 (2026-10-01)

`src/lib/roles.ts` (`USER_ROLES`/`ROLE_HIERARCHY`/`ROLE_LABELS`) ya solo tiene `superadmin` y `empleado` — se quitaron `owner`/`admin`/`secretaria`/`trabajador`, que existían en el código pero nunca se usaron en producción (todos los usuarios reales ya estaban en superadmin o empleado). `src/lib/rolePermissions.ts` sigue dando acceso total a ambos roles a nivel de módulo (la restricción real vive en el backend, ver `EINTER_API/AGENTS.md`). `RoleGuard.tsx` no cambió — ya usaba el booleano `requireSuperAdmin`, no nombres de rol intermedios.

`.env` necesita `VITE_API_BASE_URL` apuntando al backend (`http://localhost:3000` en dev).

## Dos clientes HTTP coexisten — usa `fetchAPI`, no `api.*`

- **`src/lib/fetch.ts`** (`fetchAPI`) — el que usa prácticamente toda la app. Firebase ID token se refresca (`forceRefresh: true`) en cada request.
- **`src/lib/api.ts`** (`api.*`) — implementación más vieja y parcial, con token cacheado manualmente vía `setAuthToken`. Solo sigue viva para `auth`/`users`/`dashboard` (`AuthContext.tsx`, `UserManagement.tsx`, `Home.tsx`). **Se depuraron sus funciones muertas el 2026-08-09** (`getProductos`, `createProducto`, `updateProducto`, `deleteProducto`, `getProveedores`, `createProveedor`, `updateUserRole` — ninguna tenía caller). Si vas a agregar una llamada nueva, usa `fetchAPI`, no extiendas `api.ts`.
- `fetchAPI` normaliza un prefijo `/(api)/` (sintaxis de route-group de Next.js, ya sin sentido aquí) a `/api/` — si haces `grep` de rutas literales en `Productos.tsx`/`Proveedores.tsx` verás `/(api)/...`, es cosmético, no un bug.

## Patrones de acceso a datos que conviene conocer

- **`products`/`suppliers` se leen de dos formas distintas según la pantalla**: `/api/catalog/products` (y `/api/catalog/suppliers`, catálogo paginado de lectura usado en `Products.tsx`/`CustomOrder.tsx`/autocompletados) vs. `/api/products` (CRUD directo contra nuestra BD, usado en edición/creación).
- Varias pantallas (`Products.tsx`, `CustomOrder.tsx`, etc.) tienen su propio loop de paginación contra `/api/catalog/products` — si tocas ese endpoint, revisa todos los consumidores.
- Subida/descarga de PDF (`Entradas`/`THD`) usa `fetch()` nativo en vez de `fetchAPI`, porque necesitan `FormData`/blob. Es intencional, no un descuido — no lo "arregles" migrándolo a `fetchAPI` sin más, tendrías que replicar el manejo de auth manualmente.

## Componentes eliminados 2026-08-10

`src/components/ReciboModal.tsx` y `src/components/VentaDetailModal.tsx` existían pero no se importaban en ninguna página — confirmado sin uso y borrados. Si el dominio `recibos` o el detalle de venta por `id_orden` se necesitan en el futuro, hay que reconstruirlos: el backend real para detalle de venta es `GET /api/ventas/:id` (por `id_venta`, no `id_orden`), que ya devuelve el detalle embebido — `VentaDetailModal.tsx` tenía esto mal (apuntaba a `/api/ventas-web/...`, ruta que no existe).

## Impresión de etiquetas — construida 2026-08-10, arquitectura corregida el mismo día

**El barcode siempre se lee de la BD, nunca de Odoo.** El `master_sku` de un producto nace en nuestra BD al darlo de alta — Odoo no lo genera (ni siquiera sincronizamos su campo `barcode`, solo `default_code`). Un endpoint `GET /api/odoo/barcode/:code` que consultaba Odoo en vivo se construyó y se **borró el mismo día** al caer en cuenta de esto — si ves referencias a él en el historial, es ese experimento fallido.

Cuatro modales de impresión, todos con el mismo patrón (`jsbarcode` `CODE128` + `window.print()` + `#etiqueta-print-area` con CSS `@media print` en `src/index.css`) y **verificados contra el escáner ML Kit universal de `EINTER_MOBILE`** (`GET /api/warehouse/code-lookup?code=`):

- **`src/components/ProductLabelModal.tsx`** — un producto (`master_sku`).
- **`src/components/ContainerLabelModal.tsx`** — barcode "master" de un contenedor (`folio` → productos con cantidad).
- **`src/components/PalletLabelModal.tsx`** — barcode "master" de una tarima (`sku` → cartones, potencialmente de varios productos).
- **`src/components/RowLabelModal.tsx`** — barcode de una fila/isla (`master_sku`).

Si agregas impresión de etiquetas en otra pantalla, reusa uno de estos cuatro patrones en vez de reimplementar `jsbarcode`/`window.print()` desde cero.

## `src/pages/Ubicaciones.tsx` — mayormente mock, no lo confundas con datos reales

Todo el árbol Ubicación→Master QR→Sub-QR de esta página usa `sampleData` hardcodeado en el propio archivo — no llama a ningún endpoint, no refleja la BD real. El único bloque real en esta página es `TarimaBarcodeSearch` (agregado 2026-08-10, arriba del header del árbol mock), que sí habla con el backend. Si vas a conectar el resto de la página a datos reales, probablemente quieras generalizar ese mismo patrón a islas/tarimas reales en vez de mantener `sampleData`.

## Limpieza final 2026-09-23

Pase de cierre del proyecto: se borraron `src/components/VentaModal.tsx` (sin importers; era un modal viejo de venta manual, distinto de `VentaDetailModal.tsx` ya borrado en 2026-08-10), `src/App.css` (no se importaba, superado por Tailwind/`index.css`), `src/assets/react.svg` (no referenciado) y `public/404.html` junto con el script de redirect inline en `index.html` que lo acompañaba (truco de SPA para GitHub Pages — el deploy real es Vercel, ver `vercel.json`, no aplica).

`src/components/LogoutButton.tsx` tenía 0 importers y ahora está en uso: se le agregaron props `className`/`children`/`onLoggedOut` y `NavBar.tsx` lo importa en el dropdown del ícono de perfil (esquina superior derecha) en vez de reimplementar su propio `onClick` con `logout()` de `AuthContext` — la lógica de sign-out vive en un solo lugar.

`src/components/UnderConstruction.tsx` se deja intacto a propósito aunque tiene 0 importers hoy — utilidad reusable para features futuras, no borrar.

`PDF_Implementation.txt` (raíz) quedó desactualizado: documenta `components/ReciboModal.tsx`, que ya no existe (borrado 2026-08-10, ver arriba). No se borró el archivo, pero es nota vieja, no documentación vigente — no confiar en él para features de PDF nuevas (ver el patrón real en `Entradas.tsx`/`THDComparativo.tsx` mencionado arriba).

## Antes de tocar algo, ten en cuenta

- `EINTER_MOBILE` (Android) es un cliente separado del mismo backend. Un cambio de contrato en `EINTER_API` que afecte al móvil no se propaga solo — hay que mantener sincronizados `EINTER_MOBILE/app/src/main/java/com/einter/dev/movil/api/ApiService.kt` y sus pruebas (`EINTER_MOBILE/AGENTS.md`).

## Estandarización de rutas REST a inglés — 2026-11-28
- Todas las llamadas HTTP de `EINTER_WEB` se migraron a los endpoints REST en inglés de `EINTER_API`: `/api/products`, `/api/suppliers`, `/api/categories`, `/api/catalog/*`, `/api/dashboard`, `/api/locations`, `/api/islands`, `/api/pallets`, `/api/cartons`, `/api/warehouse/*`, `/api/containers`, `/api/movements`, `/api/history`, `/api/shrinkage`, `/api/thd/exits`, `/api/hd-sales`, `/api/invoices`, `/api/customer-invoices`, `/api/variable-costs`, `/api/replenishment` y `/api/audit-logs`.
- Los componentes de etiquetas (`ProductLabelModal`, `ContainerLabelModal`, `PalletLabelModal`, `RowLabelModal`) generan `CODE128` verificado de extremo a extremo con el escáner universal de `EINTER_MOBILE`.

## Movimientos ahora lee el historial unificado — 2026-11-01
El módulo de Movimientos ya no usa `/api/catalogo/entradas` ni `/api/catalogo/salidas` (leían la tabla `movimientos`, que ya no recibe entradas/salidas nuevas). Lee `GET /api/history?pageSize=100000` (antes `/api/historial`, con contenedores, salidas THD, transferencias y merma) con columnas Fecha, Tipo, Documento, Referencia, SKU, Producto, Cantidad y Ubicación.
Además `src/index.css` pinta `html.dark`/`body` con el mismo fondo oscuro de la página (`#111827`) y `color-scheme: dark`, para que el rebote al hacer scroll de más no deje ver el blanco del navegador (aplica a toda la web).
