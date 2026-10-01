// Defines user roles, their permission hierarchy, and display labels.
// Only two roles exist: EMPLEADO can operate the system (incl. editing
// products/proveedores/categorias/ventas); SUPERADMIN additionally manages
// users, views the audit log (bitacora), and handles facturas.
export const USER_ROLES = {
  SUPERADMIN: 'superadmin',
  EMPLEADO: 'empleado'
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// Role hierarchy (higher number = more permissions)
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [USER_ROLES.SUPERADMIN]: 2,
  [USER_ROLES.EMPLEADO]: 1
};

// Role labels for display
export const ROLE_LABELS: Record<UserRole, string> = {
  [USER_ROLES.SUPERADMIN]: 'Super Administrador',
  [USER_ROLES.EMPLEADO]: 'Empleado'
};

// User data stored in Firestore
export interface UserData {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

// Check if a role has permission (equal or higher in hierarchy)
export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// Check if user is superadmin
export function isSuperAdmin(role: UserRole): boolean {
  return role === USER_ROLES.SUPERADMIN;
}
