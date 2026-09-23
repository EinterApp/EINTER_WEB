// Top navigation bar with the app title and profile dropdown menu.
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDarkMode } from '../context/DarkModeContext'
import LogoutButton from './LogoutButton'

interface NavbarProps {
  onNavigateToProfile: () => void
}

export function Navbar({ onNavigateToProfile }: NavbarProps) {
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 h-16 z-40 shadow-lg ${
        darkMode
          ? 'bg-gray-900 border-b border-gray-800'
          : 'bg-white border-b border-gray-200'
      }`}
    >
      <div className="h-full px-6 flex items-center justify-between">
        <div className="w-24" />

        <div className="flex-1 text-center">
          <h1
            className={`text-3xl font-bold tracking-wider ${
              darkMode ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            EINTER
          </h1>
        </div>

        <div className="w-24 flex items-center justify-end gap-4">
          <div ref={profileMenuRef} className="relative">
            <button
              onClick={() => {
                setShowProfileMenu(!showProfileMenu)
              }}
              className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                darkMode
                  ? 'hover:bg-gray-800 text-gray-300'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
              title="Perfil"
            >
              <img
                src={
                  user?.photoURL ||
                  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 110 110'%3E%3Ccircle cx='55' cy='55' r='55' fill='%2363b3ed'/%3E%3Cpath d='M55 50c8.28 0 15-6.72 15-15s-6.72-15-15-15-15 6.72-15 15 6.72 15 15 15zm0 7.5c-10 0-30 5.02-30 15v3.75c0 2.07 1.68 3.75 3.75 3.75h52.5c2.07 0 3.75-1.68 3.75-3.75V72.5c0-9.98-20-15-30-15z' fill='%23fff'/%3E%3C/svg%3E`
                }
                alt={user?.displayName || 'User'}
                className="w-8 h-8 rounded-full object-cover"
              />
            </button>

            {/* Profile Dropdown Menu */}
            {showProfileMenu && (
              <div
                className={`absolute right-0 mt-2 w-64 rounded-lg shadow-xl ${
                  darkMode
                    ? 'bg-gray-800 border border-gray-700'
                    : 'bg-white border border-gray-200'
                }`}
              >
                {/* User Info Section */}
                <div
                  className={`p-4 border-b ${
                    darkMode ? 'border-gray-700' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        user?.photoURL ||
                        `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 110 110'%3E%3Ccircle cx='55' cy='55' r='55' fill='%2363b3ed'/%3E%3Cpath d='M55 50c8.28 0 15-6.72 15-15s-6.72-15-15-15-15 6.72-15 15 6.72 15 15 15zm0 7.5c-10 0-30 5.02-30 15v3.75c0 2.07 1.68 3.75 3.75 3.75h52.5c2.07 0 3.75-1.68 3.75-3.75V72.5c0-9.98-20-15-30-15z' fill='%23fff'/%3E%3C/svg%3E`
                      }
                      alt={user?.displayName || 'User'}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-semibold truncate ${
                          darkMode ? 'text-white' : 'text-gray-900'
                        }`}
                      >
                        {user?.displayName || 'Usuario'}
                      </p>
                      <p
                        className={`text-xs truncate ${
                          darkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        {user?.email || 'email@example.com'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div>
                  <button
                    onClick={() => {
                      onNavigateToProfile()
                      setShowProfileMenu(false)
                    }}
                    className={`w-full text-left px-4 py-3 transition-all flex items-center gap-3 ${
                      darkMode
                        ? 'hover:bg-gray-700 text-gray-200'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="text-lg">👤</span>
                    <span className="font-medium">Ver Perfil</span>
                  </button>

                  <button
                    className={`w-full text-left px-4 py-3 transition-all flex items-center gap-3 ${
                      darkMode
                        ? 'hover:bg-gray-700 text-gray-200'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="text-lg">🔐</span>
                    <span className="font-medium">Cambiar Contraseña</span>
                  </button>

                  <div
                    className={`border-t ${
                      darkMode ? 'border-gray-700' : 'border-gray-200'
                    }`}
                  >
                    <LogoutButton
                      onLoggedOut={() => setShowProfileMenu(false)}
                      className={`w-full text-left px-4 py-3 transition-all flex items-center gap-3 ${
                        darkMode
                          ? 'hover:bg-red-900 hover:bg-opacity-30 text-red-400'
                          : 'hover:bg-red-50 text-red-600'
                      }`}
                    >
                      <span className="text-lg">🚪</span>
                      <span className="font-medium">Cerrar Sesión</span>
                    </LogoutButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
