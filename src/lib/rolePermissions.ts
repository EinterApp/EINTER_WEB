// Explicit mapping of app modules/actions to roles. Today every role points
// at the same full permission set (paridad funcional) — this only prepares
// the structure so future permission changes are just edits to this map,
// without touching UI. No enforcement is added yet.
import { USER_ROLES, type UserRole } from './roles';

export const APP_MODULES = [
  'home', 'productos', 'categorias', 'proveedores', 'ubicaciones', 'movimientos',
  'entradas', 'salidas', 'ventas-homedepot', 'thd-comparativo',
  'inventario-inteligente', 'pedido-personalizado', 'merma',
  'facturas', 'bitacora', 'users',
] as const;

export type AppModule = typeof APP_MODULES[number];

const FULL_ACCESS: readonly AppModule[] = APP_MODULES;

export const ROLE_MODULE_ACCESS: Record<UserRole, readonly AppModule[]> = {
  [USER_ROLES.SUPERADMIN]: FULL_ACCESS,
  [USER_ROLES.OWNER]: FULL_ACCESS,
  [USER_ROLES.ADMIN]: FULL_ACCESS,
  [USER_ROLES.SECRETARIA]: FULL_ACCESS,
  [USER_ROLES.TRABAJADOR]: FULL_ACCESS,
  [USER_ROLES.EMPLEADO]: FULL_ACCESS,
};

export function roleCanAccessModule(role: UserRole, mod: AppModule): boolean {
  return ROLE_MODULE_ACCESS[role].includes(mod);
}
