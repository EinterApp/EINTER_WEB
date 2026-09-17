// Modelo predictivo de reabastecimiento: calcula semáforo de inventario,
// demanda diaria ponderada, pedidos sugeridos y llenado de contenedores.
// ─── Parámetros configurables ─────────────────────────────────────────────────

export interface ModelParams {
  leadTimeDays: number;        // días que tarda llegar un pedido (default 60)
  targetDays: number;          // días de cobertura ideal (default 150)
  redAlertDays: number;        // días < este valor → CRÍTICO (default 60)
  yellowAlertDays: number;     // días < este valor → ALERTA (default 80)
  minPiecesPerSku: number;     // mínimo de piezas por SKU en cualquier pedido (default 2000)
  containerType: '20' | '40' | '40HC';
}

export const DEFAULT_PARAMS: ModelParams = {
  leadTimeDays: 60,
  targetDays: 150,
  redAlertDays: 60,
  yellowAlertDays: 80,
  minPiecesPerSku: 2000,
  containerType: '40HC',
};

export const CONTAINERS: Record<string, { maxWeightKg: number; volumeM3: number }> = {
  '20':   { maxWeightKg: 21_700, volumeM3: 33.0 },
  '40':   { maxWeightKg: 26_500, volumeM3: 67.0 },
  '40HC': { maxWeightKg: 26_500, volumeM3: 76.0 },
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type InventoryStatus = 'rojo' | 'amarillo' | 'verde' | 'sin_datos' | 'sobrestock';

export interface ProductInput {
  sku: string;
  name: string;
  supplier: string;
  supplierId?: number;
  stock: number;
  weightKg: number;
  qtyPerCarton?: number | null;
  dimensionsCm?: { largo: number; ancho: number; alto: number };
  piecesInTransit: number;
  dailyDemand: number; // piezas/día, 0 si no se conoce
  consideraModelo: boolean; // switch "tomar en cuenta en modelo matemático" del producto
  estadoProducto: "activo" | "inactivo" | "special_buy";
}

export interface ProductResult extends ProductInput {
  effectiveInventory: number;
  inventoryDays: number;       // 9999 = sin demanda
  status: InventoryStatus;
  isOverstock: boolean;
  daysToRed: number | null;    // días hasta entrar a zona roja
  redDate: string | null;      // fecha estimada de zona roja
  piecesNeeded: number;        // piezas a pedir (cálculo crudo)
  piecesToOrder: number;       // piezas a pedir (redondeado a cartón)
  weightKg: number;            // peso estimado del pedido
  volumeM3: number;            // volumen estimado del pedido
}

import { getMonterreyNow, MX_TIME_ZONE } from './dateMx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Calcula volumen en m³ a partir de dimensiones en cm (largo × ancho × alto / 1_000_000) */
export function calculateVolumeM3(
  dims?: { largo: number; ancho: number; alto: number }
): number {
  if (!dims) return 0;
  const { largo, ancho, alto } = dims;
  if (!largo || !ancho || !alto) return 0;
  return (largo * ancho * alto) / 1_000_000;
}

// ─── Motor de cálculo principal ───────────────────────────────────────────────

export function calculateResults(
  inputs: ProductInput[],
  params: ModelParams
): ProductResult[] {
  return inputs.map((p) => {
    const demand = p.dailyDemand;
    const transit = p.piecesInTransit;
    const effectiveInventory = p.stock + transit;

    // Días de cobertura basados en inventario efectivo
    const inventoryDays =
      demand > 0 ? Math.round((effectiveInventory / demand) * 10) / 10 : 9999;

    // Sobrestock si supera 2× el objetivo
    const overstockThreshold = params.targetDays * 2;
    const isOverstock =
      demand === 0 ? false : inventoryDays > overstockThreshold;

    // Semáforo
    let status: InventoryStatus;
    if (demand === 0) {
      status = 'sin_datos';
    } else if (isOverstock) {
      status = 'sobrestock';
    } else if (inventoryDays < params.redAlertDays) {
      status = 'rojo';
    } else if (inventoryDays < params.yellowAlertDays) {
      status = 'amarillo';
    } else {
      status = 'verde';
    }

    // Fecha estimada de entrada a zona roja (solo para verdes)
    let daysToRed: number | null = null;
    let redDate: string | null = null;
    if (status === 'verde' && demand > 0) {
      const d = inventoryDays - params.redAlertDays;
      if (d > 0) {
        daysToRed = Math.round(d);
        const date = getMonterreyNow();
        date.setUTCDate(date.getUTCDate() + daysToRed);
        redDate = date.toLocaleDateString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: MX_TIME_ZONE,
        });
      }
    }

    // Cálculo de pedido (solo para rojo/amarillo)
    let piecesNeeded = 0;
    let piecesToOrder = 0;
    let weightKg = 0;
    let volumeM3 = 0;

    if ((status === 'rojo' || status === 'amarillo') && demand > 0) {
      // Inventario proyectado al momento de recepción
      const inventoryAtReceipt = Math.max(
        0,
        effectiveInventory - demand * params.leadTimeDays
      );
      piecesNeeded = Math.max(
        0,
        demand * params.targetDays - inventoryAtReceipt
      );
      // Aplicar mínimo y redondear a múltiplo de cartón (CTN)
      piecesToOrder = Math.max(piecesNeeded, params.minPiecesPerSku);
      if (p.qtyPerCarton && p.qtyPerCarton > 0) {
        piecesToOrder = Math.ceil(piecesToOrder / p.qtyPerCarton) * p.qtyPerCarton;
      } else {
        piecesToOrder = Math.ceil(piecesToOrder);
      }
      weightKg = Math.round(piecesToOrder * p.weightKg * 100) / 100;
      volumeM3 =
        Math.round(piecesToOrder * calculateVolumeM3(p.dimensionsCm) * 10000) /
        10000;
    }

    return {
      ...p,
      piecesInTransit: transit,
      effectiveInventory,
      inventoryDays,
      status,
      isOverstock,
      daysToRed,
      redDate,
      piecesNeeded: Math.round(piecesNeeded),
      piecesToOrder: Math.round(piecesToOrder),
      weightKg,
      volumeM3,
    };
  });
}

// ─── Resumen por proveedor (llenado de contenedor) ────────────────────────────

export interface ContainerOption {
  type: string;
  maxWeightKg: number;
  maxVolM3: number;
  weightPct: number;
  volPct: number;
  /** El mayor de los dos porcentajes: determina si cabe o no */
  maxPct: number;
  recommended: boolean;
}

export interface ContainerSummary {
  supplier: string;
  totalWeightKg: number;
  totalVolumeM3: number;
  /** Métricas calculadas para cada tipo de contenedor */
  options: ContainerOption[];
  /** Tipo recomendado por el modelo */
  recommendedType: string;
  products: ProductResult[];
}

/** Elige el tipo de contenedor óptimo para un pedido dado su peso y volumen. */
function chooseRecommendedType(
  _weightKg: number,
  _volM3: number,
  options: Omit<ContainerOption, 'recommended'>[]
): string {
  // Contenedores en orden de menor a mayor capacidad
  const ordered = [...options].sort((a, b) => a.maxVolM3 - b.maxVolM3);
  // Entre los que caben (maxPct ≤ 100), elegir el de mayor ocupación (más eficiente)
  const fitting = ordered.filter((o) => o.maxPct <= 100);
  if (fitting.length > 0) {
    return fitting.reduce((best, o) => (o.maxPct > best.maxPct ? o : best)).type;
  }
  // Ninguno cabe → recomendar el más grande para minimizar contenedores
  return ordered[ordered.length - 1].type;
}

export function calculateContainerSummary(
  results: ProductResult[]
): ContainerSummary[] {
  const alerts = results.filter(
    (r) => r.status === 'rojo' || r.status === 'amarillo'
  );

  const bySupplier: Record<string, ProductResult[]> = {};
  for (const r of alerts) {
    const s = r.supplier || 'Sin proveedor';
    if (!bySupplier[s]) bySupplier[s] = [];
    bySupplier[s].push(r);
  }

  return Object.entries(bySupplier)
    .map(([supplier, items]) => {
      const totalWeight = items.reduce((sum, p) => sum + p.weightKg, 0);
      const totalVol  = items.reduce((sum, p) => sum + p.volumeM3, 0);

      const optionsWithoutFlag: Omit<ContainerOption, 'recommended'>[] =
        Object.entries(CONTAINERS).map(([type, cap]) => {
          const weightPct = Math.min(999, Math.round((totalWeight / cap.maxWeightKg) * 1000) / 10);
          const volPct  = Math.min(999, Math.round((totalVol  / cap.volumeM3) * 1000) / 10);
          return {
            type,
            maxWeightKg: cap.maxWeightKg,
            maxVolM3:  cap.volumeM3,
            weightPct,
            volPct,
            maxPct: Math.max(weightPct, volPct),
          };
        });

      const recommendedType = chooseRecommendedType(totalWeight, totalVol, optionsWithoutFlag);

      const options: ContainerOption[] = optionsWithoutFlag.map((o) => ({
        ...o,
        recommended: o.type === recommendedType,
      }));

      return {
        supplier,
        totalWeightKg:  Math.round(totalWeight * 100) / 100,
        totalVolumeM3:  Math.round(totalVol  * 1000) / 1000,
        options,
        recommendedType,
        products: items,
      };
    })
    .sort((a, b) => b.totalWeightKg - a.totalWeightKg);
}

// ─── Utilidades de ordenación ─────────────────────────────────────────────────

const STATUS_ORDER: Record<InventoryStatus, number> = {
  rojo: 0,
  amarillo: 1,
  verde: 2,
  sin_datos: 3,
  sobrestock: 4,
};

/** Ordena: rojo → amarillo → verde → sin_datos → sobrestock; dentro de c/u por días asc. */
export function sortResults(
  results: ProductResult[]
): ProductResult[] {
  return [...results].sort((a, b) => {
    const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (diff !== 0) return diff;
    return a.inventoryDays - b.inventoryDays;
  });
}
