// Superadmin page for managing user accounts and roles.
import { useState, useEffect } from 'react';
import { useDarkMode } from '../context/DarkModeContext';
import { api } from '../lib/api';
import type { BackendUserData } from '../lib/api';
import { USER_ROLES, ROLE_LABELS } from '../lib/roles';
import type { UserRole } from '../lib/roles';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';

const emptyForm = { email: '', nombre: '', apellido: '' };
const emptyEditForm = { nombre: '', apellido: '', email: '', isActive: true, role: USER_ROLES.EMPLEADO as UserRole };

export function UserManagement() {
  const { darkMode } = useDarkMode();
  const [users, setUsers] = useState<BackendUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<BackendUserData | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const allUsers = await api.getAllUsers();
      setUsers(allUsers);
    } catch (error: unknown) {
      console.error('Error loading users:', error);
      setError(error instanceof Error ? error.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useRefetchOnFocus(loadUsers);

  const handleDelete = async (id: number, email: string) => {
    if (!confirm(`¿Eliminar al usuario ${email}? Esta acción no se puede deshacer.`)) return;

    try {
      await api.deleteUser(id);
      await loadUsers();
    } catch (error: unknown) {
      console.error('Error deleting user:', error);
      alert(error instanceof Error ? error.message : 'Error al eliminar el usuario');
    }
  };

  const openEdit = (user: BackendUserData) => {
    setEditingUser(user);
    setEditForm({ nombre: user.nombre, apellido: user.apellido, email: user.email, isActive: user.isActive, role: user.role });
    setEditError(null);
  };

  const closeEdit = () => {
    setEditingUser(null);
    setEditForm(emptyEditForm);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSavingEdit(true);
    setEditError(null);
    try {
      await api.updateUserProfile(editingUser.id_usuario, {
        nombre: editForm.nombre,
        apellido: editForm.apellido,
        email: editForm.email,
      });
      if (editForm.isActive !== editingUser.isActive) {
        await api.toggleUserActive(editingUser.id_usuario, editForm.isActive);
      }
      if (editForm.role !== editingUser.role) {
        await api.assignRole(editForm.email, editForm.role);
      }
      closeEdit();
      await loadUsers();
    } catch (error: unknown) {
      setEditError(error instanceof Error ? error.message : 'Error al actualizar el usuario');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await api.createUser(form);
      setShowCreateModal(false);
      setForm(emptyForm);
      await loadUsers();
    } catch (error: unknown) {
      setCreateError(error instanceof Error ? error.message : 'Error al crear el usuario');
    } finally {
      setCreating(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case USER_ROLES.SUPERADMIN:
        return 'bg-purple-500 text-white';
      case USER_ROLES.OWNER:
        return 'bg-red-500 text-white';
      case USER_ROLES.ADMIN:
        return 'bg-blue-500 text-white';
      case USER_ROLES.SECRETARIA:
        return 'bg-pink-500 text-white';
      case USER_ROLES.TRABAJADOR:
        return 'bg-green-500 text-white';
      case USER_ROLES.EMPLEADO:
        return 'bg-gray-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  const inputClass = `w-full px-3 py-2 rounded-lg border transition-colors ${
    darkMode
      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
  }`;

  return (
    <div className={`min-h-screen p-6 transition-colors ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Gestión de Usuarios
            </h1>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Administra el acceso de los usuarios al sistema
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            + Nuevo Usuario
          </button>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Buscar por email o nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
            <button
              onClick={loadUsers}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Cargando usuarios...</p>
          </div>
        ) : !error ? (
          <div className={`rounded-lg shadow-lg overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-100'}>
                  <tr>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Nombre
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Apellido
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Email
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Rol
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Estado
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {filteredUsers.map((user) => (
                    <tr key={user.id_usuario} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {user.nombre || '-'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {user.apellido || '-'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                          {ROLE_LABELS[user.role]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {user.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(user)}
                            className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(user.id_usuario, user.email)}
                            className={`px-3 py-1 rounded ${
                              darkMode
                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                  No se encontraron usuarios
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-lg shadow-lg p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h2 className={`text-xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Nuevo Usuario
            </h2>
            <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Dale acceso al sistema con su correo de Einter.
            </p>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                type="email"
                required
                placeholder="Email (@einter.mx)"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
              />
              <input
                type="text"
                required
                placeholder="Nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Apellido"
                value={form.apellido}
                onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                className={inputClass}
              />

              {createError && (
                <p className="text-sm text-red-500">{createError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setForm(emptyForm);
                    setCreateError(null);
                  }}
                  className={`px-4 py-2 rounded ${
                    darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-lg shadow-lg p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Editar Usuario
            </h2>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <input
                type="email"
                required
                placeholder="Email (@einter.mx)"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className={inputClass}
              />
              <input
                type="text"
                required
                placeholder="Nombre"
                value={editForm.nombre}
                onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Apellido"
                value={editForm.apellido}
                onChange={(e) => setEditForm({ ...editForm, apellido: e.target.value })}
                className={inputClass}
              />

              <div>
                <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Rol</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                  className={inputClass}
                >
                  {Object.values(USER_ROLES).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              <label className={`flex items-center gap-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  className="w-4 h-4"
                />
                Usuario activo (tiene acceso al sistema)
              </label>

              {editError && (
                <p className="text-sm text-red-500">{editError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className={`px-4 py-2 rounded ${
                    darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingEdit ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
