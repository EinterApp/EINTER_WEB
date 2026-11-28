# OrdenHD · ComparativoHD · Salidas — Referencia Completa

> Documento de referencia técnica extraído directamente del código fuente.
> Generado: 2026-06-18

---

## Tabla de Contenidos

1. [Arquitectura General](#1-arquitectura-general)
2. [OrdenHD — Entradas](#2-ordenhd--entradas)
3. [ComparativoHD — THD Comparativo](#3-comparativohd--thd-comparativo)
4. [Salidas](#4-salidas)
5. [Componentes Compartidos](#5-componentes-compartidos)
6. [Utilidades Compartidas](#6-utilidades-compartidas)

---

## 1. Arquitectura General

| Item | Detalle |
|---|---|
| Framework | Vite + React 18 + TypeScript |
| Estilos | Tailwind CSS |
| Auth | Firebase (ID token en cada request) |
| HTTP | `fetchAPI()` en `src/lib/fetch.ts` |
| Estado | `useState` / `useEffect` local por componente |
| Routing | Controlado por `src/App.tsx` con prop `currentPage` |

### `fetchAPI` — cliente HTTP global

**Archivo:** `src/lib/fetch.ts`

```typescript
fetchAPI(path: string, options?: RequestInit): Promise<unknown>
```

- Base URL: variable de entorno `VITE_API_BASE_URL` (vacío en dev = relativo)
- Convierte `/(api)/` → `/api/` automáticamente
- Inyecta `Authorization: Bearer <firebase-id-token>` en cada request
- Lanza `Error` con mensaje descriptivo si la respuesta no es JSON o el status no es 2xx

---

## 2. OrdenHD — Entradas

**Archivo:** `src/pages/Entradas.tsx`  
**Ruta en app:** `entradas`  
**Propósito:** Gestión de órdenes de compra / contenedores entrantes. Registra qué productos llegan, en qué cantidad, en qué contenedor y cuándo.

---

### 2.1 Tipos TypeScript

```typescript
type StatusEnvio = 'pendiente' | 'en_transito' | 'entregado' | 'cancelado';

interface ContenedorRow {
  folio_orden: string;          // Identificador completo (ej. "Contenedor MAD0301 2X40")
  fecha_movimiento: string;     // Fecha de llegada (ISO YYYY-MM-DD)
  fecha_pedido?: string | null; // Fecha del pedido (ISO YYYY-MM-DD)
  total_piezas: number;         // Suma de piezas en todos los items
  num_productos: number;        // Número de SKUs distintos
  id_movimiento: number;        // ID representativo (llave React)
  skus: string | null;          // SKUs agregados separados por coma
  productos: string | null;     // Descripciones agregadas
  pdf_filename?: string | null; // Nombre del archivo de factura
  pdf_uploaded_at?: string | null;
  status_envio?: StatusEnvio | null;
  tamano?: string | null;       // Tamaño del contenedor (DB column)
  // Computados en cliente:
  orden: string;                // Token de orden (sin prefijo "ORDEN" ni tamaño)
  contenedores: string;         // Tamaño normalizado para mostrar
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
  fecha: string;              // Fecha de llegada
  fecha_pedido?: string | null;
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
  cantidad: string;           // String en el form, se parsea a number al enviar
}
```

---

### 2.2 Endpoints de API

#### GET `/api/contenedores`

Lista paginada de órdenes/contenedores.

**Query params:**

| Param | Tipo | Requerido | Descripción |
|---|---|---|---|
| `page` | number | Sí | Siempre `1` (datos cargados completos en cliente) |
| `limit` | number | Sí | `100000` (trae todo) |
| `anio` | string | Sí | Año a filtrar (ej. `"2026"`) |
| `mes` | string | No | Mes numérico `1–12`; omitir = todos |

**Ejemplo de llamada:**
```
GET /api/contenedores?page=1&limit=100000&anio=2026&mes=3
```

**Response `200`:**
```typescript
{
  data: ContenedorRow[],   // sin campos "orden" ni "contenedores"
  pagination: {
    page: number,
    limit: number,
    total: number,
    pages: number
  }
}
```

---

#### POST `/api/contenedores`

Crea una nueva orden de entrada.

**Request body (JSON):**
```typescript
{
  folio_orden: string;              // Obligatorio. Ej: "Contenedor MAD0301"
  tamano: string | null;            // Tamaño del contenedor. Ej: "2X40", null si vacío
  fecha_movimiento: string;         // Obligatorio. Fecha de llegada ISO: "YYYY-MM-DD"
  fecha_pedido: string | null;      // Fecha del pedido ISO: "YYYY-MM-DD", o null
  items: Array<{
    master_sku: string;             // SKU/MOD del producto (debe existir en articulos)
    cantidad: number;               // Min 1
  }>;
}
```

**Ejemplo:**
```json
{
  "folio_orden": "Contenedor MAD0301",
  "tamano": "2X40",
  "fecha_movimiento": "2026-03-15",
  "fecha_pedido": "2026-02-20",
  "items": [
    { "master_sku": "BOF001", "cantidad": 120 },
    { "master_sku": "DUC002", "cantidad": 48 }
  ]
}
```

**Response `201`:** objeto creado (forma similar a `ContenedorDetail`).

**Validación cliente antes de enviar:**
- `folio_orden` no puede estar vacío
- `fecha_movimiento` no puede estar vacía
- Al menos un item con `master_sku` no vacío
- Si el catálogo local de SKUs está cargado, verifica que todos los SKUs existan; si no, muestra error inmediato sin llamar a la API

---

#### GET `/api/contenedores/:folio`

Detalle de una orden específica (productos + cantidades).

**Path param:** `folio` — URL-encoded. Ej: `Contenedor%20MAD0301`

**Response `200`:**
```typescript
{
  folio: string;
  tamano?: string | null;
  fecha: string;             // fecha_movimiento
  fecha_pedido?: string | null;
  items: Array<{
    id_movimiento: number;
    id_articulo: number;
    master_sku: string;
    nombre_producto: string;
    cantidad: number;
  }>;
  total_piezas: number;
}
```

---

#### PUT `/api/contenedores/:folio`

Actualiza una orden existente. Mismo body que el POST.

**Request body:** idéntico a `POST /api/contenedores`.

**Response `200`:** objeto actualizado.

---

#### DELETE `/api/contenedores/:folio`

Elimina la orden y todos sus items. **Irreversible.**

**Response `200` / `204`:** confirmación.

---

#### POST `/api/contenedores/:folio/pdf`

Sube (o reemplaza) la factura PDF de una orden.

**Request:** `multipart/form-data`
```
file: <PDF File>
```

**Headers requeridos:**
```
Authorization: Bearer <firebase-id-token>
Content-Type: multipart/form-data  (lo pone el browser automáticamente)
```

**Implementación cliente:**
```typescript
const form = new FormData();
form.append("file", file);
const res = await fetch(`${apiBase}/api/contenedores/${encodeURIComponent(folio)}/pdf`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

**Response `200`:** confirmación.

---

#### GET `/api/contenedores/:folio/pdf`

Descarga / visualiza la factura PDF de la orden.

**Response:** `application/pdf` blob.

**Implementación cliente:**
```typescript
const res = await fetch(`${apiBase}/api/contenedores/${encodeURIComponent(folio)}/pdf`, {
  headers: { Authorization: `Bearer ${token}` },
});
const blob = await res.blob();
window.open(URL.createObjectURL(blob), "_blank");
```

---

#### PATCH `/api/contenedores/:folio/status`

Actualiza el estado de envío de la orden.

**Request body (JSON):**
```typescript
{
  status_envio: 'pendiente' | 'en_transito' | 'entregado' | 'cancelado';
}
```

**Response `200`:** confirmación.

---

#### GET `/api/productos`

Catálogo de SKUs disponibles para el combobox del modal de creación.

**Query params:**

| Param | Tipo | Descripción |
|---|---|---|
| `pageSize` | number | `100000` (trae todo) |

**Response `200`:**
```typescript
{
  items: Array<{
    sku: string;
    name: string;
  }>
}
```

---

### 2.3 Estado local / filtros

| Estado | Tipo | Descripción |
|---|---|---|
| `anio` | `string` | Año activo (`"2025"` o `"2026"`) |
| `mes` | `string` | Mes activo (`"0"` = todos, `"1"`–`"12"`) |
| `searchText` | `string` | Búsqueda libre (folio, SKU, descripción) |
| `dateDesde` / `dateHasta` | `string` | Rango de `fecha_movimiento` ISO |
| `tamanoFilter` | `string[]` | Multi-select de tamaños (ej. `["2X40", "FULL"]`) |
| `skuFilter` | `string[]` | Multi-select de SKUs de la tabla |
| `facturaFilter` | `"todos" \| "con" \| "sin"` | Filtro por presencia de PDF |
| `sortColumn` / `sortDir` | `SortColumn \| null`, `"asc"\|"desc"` | Columna y dirección de ordenamiento |

**Paginación:** 25 filas por página (`LIMIT = 25`), lado cliente.

**Tamaños de contenedor sugeridos:** `["1X20", "1X40", "2X40", "FULL", "SENCILLO"]` (se admite texto libre).

---

### 2.4 Colores de status

| Status | Color badge |
|---|---|
| `pendiente` | Amarillo |
| `en_transito` | Azul |
| `entregado` | Verde |
| `cancelado` | Rojo |

---

## 3. ComparativoHD — THD Comparativo

**Archivo:** `src/pages/THDComparativo.tsx`  
**Ruta en app:** `thd-comparativo`  
**Propósito:** Comparar órdenes de compra de Home Depot contra las salidas reales registradas, identificar discrepancias por SKU y registrar cantidades reales cuando hay diferencias.

---

### 3.1 Tipos TypeScript

```typescript
type ComparativoStatus = "completo" | "parcial" | "sin_entrega" | "sin_pedido";

interface ComparativoRow {
  master_sku: string;              // MOD / SKU interno
  sku_thd: string;                 // SKU Home Depot
  descripcion: string;             // Descripción del producto
  total_pedido: number;            // Total de unidades pedidas (en el Excel THD)
  total_salida: number;            // Total de unidades con salida registrada en el sistema
  diferencia: number;              // total_salida - total_pedido
  pct_cumplimiento: number;        // Porcentaje de cumplimiento (0–100+)
  status: ComparativoStatus;
  numero_folio: string | null;     // Folio de salida asociado
  cantidad_real: number | null;    // Cantidad real ingresada manualmente por usuario
  discrepancia_resuelta: boolean;  // Si la discrepancia fue confirmada/resuelta
}

interface ComparativoSummary {
  total_productos: number;
  total_pedido: number;
  total_salida: number;
  pct_cumplimiento_general: number;
}
```

---

### 3.2 Definición de Status

| Status | Label | Color | Condición |
|---|---|---|---|
| `completo` | Completo | Verde | cumplimiento = 100% |
| `parcial` | Parcial | Ámbar | cumplimiento 50–99% |
| `sin_entrega` | Sin Entrega | Rojo | cumplimiento < 50% |
| `sin_pedido` | Sin Pedido | Gris | No existe orden de compra THD |

---

### 3.3 Endpoints de API

#### GET `/api/thd/comparativo`

Obtiene los datos comparativos para el período y categoría seleccionados.

**Query params:**

| Param | Tipo | Requerido | Descripción |
|---|---|---|---|
| `anio` | number | Sí | Año (ej. `2026`) |
| `mes` | number | No | Mes `1–12`; omitir o `0` = todos |
| `categoria` | string | Sí | Categoría (actualmente solo `"baños"`) |

**Ejemplo de llamada:**
```
GET /api/thd/comparativo?anio=2026&mes=3&categoria=baños
GET /api/thd/comparativo?anio=2026&categoria=baños
```

**Response `200`:**
```typescript
{
  data?: ComparativoRow[];    // puede venir también como .rows o .items
  rows?: ComparativoRow[];
  items?: ComparativoRow[];
  summary?: ComparativoSummary;
}
```

El cliente normaliza el array con:
```typescript
const rows = (raw.data ?? raw.rows ?? raw.items ?? []) as ComparativoRow[];
```

---

#### POST `/api/thd/upload`

Importa el archivo Excel de pedidos THD (Home Depot).

**Request:** `multipart/form-data`
```
file: <XLSX File>
```

**Headers requeridos:**
```
Authorization: Bearer <firebase-id-token>
Content-Type: multipart/form-data
```

**Implementación cliente:**
```typescript
const form = new FormData();
form.append("file", file);
const res = await fetch(`${apiBase}/api/thd/upload`, {
  method: "POST",
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: form,
});
```

**Response `200`:** confirmación. Después de subir exitosamente, el cliente hace re-fetch del comparativo.

**Tipo de archivo:** `.xlsx` únicamente.

---

#### PATCH `/api/thd/discrepancia/:folio`

Registra la cantidad real que salió para un folio con discrepancia.

**Path param:** `folio` — URL-encoded.

**Request body (JSON):**
```typescript
{
  cantidad_real: number;    // Cantidad real que salió (requerido)
  notas: string;            // Notas sobre la discrepancia (opcional, puede ser "")
}
```

**Ejemplo:**
```json
{
  "cantidad_real": 85,
  "notas": "Faltaron 15 piezas por daño en tránsito"
}
```

**Response `200`:** confirmación. El cliente hace re-fetch del comparativo.

**Restricciones UI:**
- Solo se puede registrar si `row.numero_folio` existe (no null)
- El panel expandido solo se muestra si `status !== "sin_pedido"`
- Si `status === "completo"`, el toggle aparece activado y deshabilitado (sin campo editable)

---

### 3.4 Filtros y estado local

| Estado | Tipo | Valor inicial | Descripción |
|---|---|---|---|
| `anio` | `number` | `2026` | Año del comparativo |
| `mes` | `number` | `0` | `0` = todos los meses |
| `categoria` | `string` | `"baños"` | Categoría THD |
| `search` | `string` | `""` | Texto libre (MOD, SKU THD, descripción) |
| `sortCol` | `SortCol` | `"total_pedido"` | Columna de ordenamiento |
| `sortDir` | `"asc"\|"desc"` | `"desc"` | Dirección de sort |
| `colFilters` | `Record<string, string[]>` | `{}` | Filtros excel por columna |
| `expandedKey` | `string \| null` | `null` | Clave de fila expandida: `"${master_sku}-${sku_thd}"` |

**Columnas ordenables:** `master_sku`, `sku_thd`, `descripcion`, `total_pedido`, `total_salida`, `diferencia`, `pct_cumplimiento`, `status`

**Columnas con filtro Excel:** `master_sku`, `sku_thd`, `descripcion`, `status`

**Colores de % cumplimiento:**
- ≥ 100%: verde
- 50–99%: ámbar
- < 50%: rojo

---

### 3.5 Panel expandido de discrepancia

Al hacer click en una fila (con `status !== "sin_pedido"`), se expande un panel inline con:

- **Datos de solo lectura:** número de folio, pedido, salida registrada, diferencia, % cumplimiento
- **Toggle:** "¿Coincide con salida registrada?" (deshabilitado si `status === "completo"`)
- **Formulario (si toggle = NO):**
  - `cantidad_real` (number, requerido)
  - `notas` (textarea, opcional)
  - Botón "Guardar salida real" → llama a `PATCH /api/thd/discrepancia/:folio`

---

## 4. Salidas

**Archivo:** `src/pages/Salidas.tsx`  
**Componentes:** `src/components/VentaModal.tsx`, `src/components/VentaDetailModal.tsx`  
**Ruta en app:** `salidas`  
**Propósito:** Gestión de órdenes de venta (salidas de inventario a clientes). Soporta múltiples folios por orden y adjunto de PDF.

---

### 4.1 Tipos TypeScript

```typescript
// En Salidas.tsx
interface LineItem {
  master_sku: string | null;
  nombre_producto: string | null;
  cantidad: number;
  precio: number;
  costo: number;
}

interface Venta {
  id_venta: number;
  odoo_id: number | null;         // ID en sistema Odoo (si existe sincronización)
  id_orden: string | number | null;
  cliente: string | null;
  total: number | string;
  fecha: string | Date;
  pdf_data: string | null;        // Indica si hay PDF (se descarga por endpoint separado)
  pdf_filename: string | null;
  lineItems: LineItem[];
}

interface VentasResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Venta[];
}

// En VentaModal.tsx (tipos exportados)
export interface Producto {
  id: string;
  nombre: string;
  sku: string;
  cantidad: number;
  precio: number;
}

export interface Folio {
  id: string;           // ID local temporal (Date.now().toString())
  numero_folio: string;
  productos: Producto[];
}

export interface OrdenVenta {
  id_orden: string;
  cliente: string;
  fecha: string;        // ISO "YYYY-MM-DD"
  folios: Folio[];
  pdf?: string | null;  // Base64 del PDF (sin prefijo "data:...")
}

// En VentaDetailModal.tsx (tipos exportados)
export interface LineItem {
  master_sku: string | null;
  nombre_producto: string | null;
  cantidad: number;
  precio: number;
  subtotal?: number;
  costo?: number;
}

export interface VentaDetail {
  id_venta: number;
  odoo_id: number | null;
  id_orden: string | number | null;
  cliente: string | null;
  fecha: string | Date;
  total: number | string;
  lineItems: LineItem[];
}
```

---

### 4.2 Endpoints de API

#### GET `/api/odoo/ventas`

Lista todas las ventas (carga total para filtrado cliente).

**Query params:**

| Param | Tipo | Valor usado | Descripción |
|---|---|---|---|
| `page` | number | `1` | Página |
| `pageSize` | number | `99999` | Trae todos los registros |

**Ejemplo:**
```
GET /api/odoo/ventas?page=1&pageSize=99999
```

**Response `200`:**
```typescript
{
  page: number;
  pageSize: number;
  total: number;
  items: Venta[];
}
```

---

#### POST `/(api)/ventas`

Crea una nueva orden de venta con sus line items.

> `/(api)/` es normalizado a `/api/` por `fetchAPI`.

**Request body (JSON):**
```typescript
{
  id_orden: string;              // Número de orden (ej. "ORD-12345")
  cliente: string;               // Nombre del cliente
  fecha: string;                 // ISO "YYYY-MM-DD"
  total: number;                 // Calculado: suma(cantidad * precio) de todos los folios
  items: Array<{
    id_articulo: number;         // parseInt(producto.id)
    cantidad: number;
    numero_folio: string;        // Número de folio al que pertenece este item
  }>;
  pdf: string | null;            // Base64 del PDF (sin prefijo data:...) o null
}
```

**Ejemplo:**
```json
{
  "id_orden": "ORD-20260101",
  "cliente": "Home Depot",
  "fecha": "2026-01-15",
  "total": 45000.00,
  "items": [
    { "id_articulo": 123, "cantidad": 10, "numero_folio": "FOL-001" },
    { "id_articulo": 456, "cantidad": 5,  "numero_folio": "FOL-001" },
    { "id_articulo": 789, "cantidad": 20, "numero_folio": "FOL-002" }
  ],
  "pdf": "JVBERi0xLjQK..."
}
```

**Cálculo del total en cliente:**
```typescript
const total = ordenData.folios.reduce((sum, folio) =>
  sum + folio.productos.reduce((s, p) => s + p.cantidad * p.precio, 0), 0
);
```

**Response `201`:** objeto creado.

---

#### PUT `/(api)/ventas/:id`

Actualiza datos básicos de una venta existente. **No modifica line items** (para ventas Odoo-synced, los items viven en Odoo).

**Path param:** `id` — `id_venta` numérico.

**Request body (JSON):**
```typescript
{
  cliente?: string;
  fecha?: string;          // ISO "YYYY-MM-DD"
  pdf?: string;            // Base64, solo si se adjunta nuevo PDF
}
```

**Ejemplo:**
```json
{
  "cliente": "Home Depot México",
  "fecha": "2026-01-20"
}
```

**Response `200`:** objeto actualizado.

---

#### DELETE `/(api)/ventas/:id`

Elimina la venta y **devuelve el stock** de sus productos. **Irreversible.**

**Response `200` / `204`:** confirmación.

**Aviso UI:** "Se devolverá el stock de sus productos."

---

#### GET `/api/ventas/:id/pdf`

Descarga el PDF adjunto de la venta.

**Implementación cliente:**
```typescript
window.open(`/api/ventas/${ventaId}/pdf`, "_blank");
```

**Response:** `application/pdf` blob / stream.

---

#### GET `/api/odoo/ventas/:odoo_id/lines`

Obtiene los line items de una venta desde Odoo (usado por `VentaDetailModal` cuando no hay `lineItems` locales).

**Path param:** `odoo_id` — ID de la venta en Odoo.

**Response `200`:**
```typescript
{
  lines: Array<{
    master_sku: string | null;
    nombre_producto: string | null;
    cantidad: number;
    precio: number;
    subtotal?: number;
    costo?: number;
  }>
}
```

---

#### GET `/api/odoo/productos`

Catálogo de productos Odoo para búsqueda por SKU en el modal de creación.

**Query params:**

| Param | Valor |
|---|---|
| `pageSize` | `1000` |

**Response `200`:**
```typescript
{
  items: Array<{
    id_articulo: number | string;
    nombre_producto: string;
    master_sku: string;
    precio?: number;
    price?: number;
    id?: number;
  }>
}
```

**Búsqueda cliente:** filtra por `master_sku` o `nombre_producto` (contains, case-insensitive).

---

### 4.3 Flujo del modal de creación (`VentaModal`)

```
1. Usuario abre "Nueva Orden de Salida"
2. Ingresa: id_orden, cliente, fecha
3. Agrega folios (número de folio manual)
4. En cada folio: busca SKU → llama GET /api/odoo/productos → agrega producto
5. Ajusta cantidad y precio por producto
6. Opcionalmente adjunta PDF (< 10MB, solo PDF)
   → Se convierte a Base64 con FileReader
7. Click "Crear" → construye payload → POST /(api)/ventas
```

**Validaciones en VentaModal antes de guardar:**
- `id_orden` no puede estar vacío
- `cliente` no puede estar vacío
- `fecha` no puede estar vacía
- Al menos un folio
- Cada folio debe tener al menos un producto
- PDF: solo `application/pdf`, máximo 10MB

---

### 4.4 Estado local / filtros

| Estado | Tipo | Descripción |
|---|---|---|
| `filterYear` | `number \| ""` | Año (derivado de los datos) |
| `filterMonth` | `number \| ""` | Mes 1–12 |
| `searchOrden` | `string` | Búsqueda por número de orden |
| `filterCliente` | `string` | Cliente exacto (select) |
| `colFilters` | `Record<string, string[]>` | Filtros Excel por columna |

**Columnas con filtro Excel:** `id_orden`, `cliente`, `total`, `fecha`

**Paginación:** 20 filas por página, lado cliente.

---

## 5. Componentes Compartidos

### `VentaModal` (`src/components/VentaModal.tsx`)

Modal de crear/editar ventas. Exporta tipos `Producto`, `Folio`, `OrdenVenta`.

**Props:**
```typescript
{
  visible: boolean;
  orden: OrdenVenta | null;     // null = modo create
  onClose: () => void;
  onSave: (orden: OrdenVenta) => Promise<void>;
  mode: "create" | "edit";
}
```

### `VentaDetailModal` (`src/components/VentaDetailModal.tsx`)

Modal de solo lectura con los line items de una venta. Si hay `lineItems` locales los usa directamente; si hay `odoo_id`, los fetcha de Odoo.

**Props:**
```typescript
{
  visible: boolean;
  venta: VentaDetail | null;
  onClose: () => void;
}
```

### `ColumnFilter` (`src/components/ColumnFilter.tsx`)

Filtro estilo Excel multi-select. Usado en las tres páginas.

**Función utilitaria:**
```typescript
distinctValues<T>(rows: T[], accessor: (row: T) => string): string[]
```

---

## 6. Utilidades Compartidas

### `fetchAPI` (`src/lib/fetch.ts`)

```typescript
fetchAPI(path: string, options?: RequestInit): Promise<unknown>
```

- Normaliza `/(api)/` → `/api/`
- Base: `VITE_API_BASE_URL` env var (vacío en dev)
- Auth: `Authorization: Bearer <token>` con Firebase `getIdToken(true)`
- Content-Type: `application/json` por defecto (no aplicar a multipart)
- Lanza `Error` descriptivo en respuestas no-JSON o errores HTTP

### `useFetch<T>` (`src/lib/fetch.ts`)

Hook React para fetching con `data`, `loading`, `error`. No usado por las páginas principales (usan `fetchAPI` directamente).

---

## Resumen de Endpoints

| Módulo | Método | Endpoint | Propósito |
|---|---|---|---|
| **OrdenHD** | GET | `/api/contenedores` | Listar órdenes |
| **OrdenHD** | POST | `/api/contenedores` | Crear orden |
| **OrdenHD** | GET | `/api/contenedores/:folio` | Detalle de orden |
| **OrdenHD** | PUT | `/api/contenedores/:folio` | Editar orden |
| **OrdenHD** | DELETE | `/api/contenedores/:folio` | Eliminar orden |
| **OrdenHD** | POST | `/api/contenedores/:folio/pdf` | Subir factura PDF |
| **OrdenHD** | GET | `/api/contenedores/:folio/pdf` | Ver/descargar factura |
| **OrdenHD** | PATCH | `/api/contenedores/:folio/status` | Cambiar status envío |
| **OrdenHD** | GET | `/api/productos` | Catálogo SKUs |
| **ComparativoHD** | GET | `/api/thd/comparativo` | Datos comparativos |
| **ComparativoHD** | POST | `/api/thd/upload` | Subir Excel THD |
| **ComparativoHD** | PATCH | `/api/thd/discrepancia/:folio` | Registrar cantidad real |
| **Salidas** | GET | `/api/odoo/ventas` | Listar ventas |
| **Salidas** | POST | `/(api)/ventas` | Crear venta |
| **Salidas** | PUT | `/(api)/ventas/:id` | Editar venta |
| **Salidas** | DELETE | `/(api)/ventas/:id` | Eliminar venta |
| **Salidas** | GET | `/api/ventas/:id/pdf` | Descargar PDF |
| **Salidas** | GET | `/api/odoo/ventas/:odooId/lines` | Line items desde Odoo |
| **Salidas** | GET | `/api/odoo/productos` | Catálogo productos Odoo |
