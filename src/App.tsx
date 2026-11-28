// Root component: handles auth gating and renders the active page based on
// the current navigation state.
// Wraps the app shell (navbar, sidebar) once the user is authenticated.
import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DarkModeProvider } from './context/DarkModeContext'
import { Sidebar } from './components/Sidebar'
import { Navbar } from './components/NavBar'
import { Login } from './pages/Login'
import { Maintenance } from './pages/Maintenance'
import { Home } from './pages/Home'
import { Products } from './pages/Products'
import { Suppliers } from './pages/Suppliers'
import { Locations } from './pages/Locations'
import { Movements } from './pages/Movements'
import { Exits } from './pages/Exits'
import { HomeDepotSales } from './pages/HomeDepotSales'
import { VariableCosts } from './pages/VariableCosts'
import { SmartInventory } from './pages/SmartInventory'
import { CustomOrder } from './pages/CustomOrder'
import { ThdComparison } from './pages/ThdComparison'
import { Categories } from './pages/Categories'
import Profile from './components/Profile'
import { UserManagement } from './pages/UserManagement'
import { Entries } from './pages/Entries'
import { Shrinkage } from './pages/Shrinkage'
import { Invoices } from './pages/Invoices'
import { AuditLogs } from './pages/AuditLogs'
import { RoleGuard } from './components/RoleGuard'

const ACCESO_DENEGADO = (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <h2 className="text-2xl font-bold text-red-600 mb-2">Acceso Denegado</h2>
      <p className="text-gray-600">No tienes permisos para acceder a esta página.</p>
    </div>
  </div>
)

// Temporary maintenance mode while production backend hosting (Railway) is restored.
// Set VITE_MAINTENANCE_MODE=false (or change to false) once the API is back online.
const MAINTENANCE_MODE = import.meta.env.VITE_MAINTENANCE_MODE !== 'false'

function AuthenticatedApp() {
  const { user, loading } = useAuth()
  const [currentPage, setCurrentPage] = useState('home')

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home />
      case 'productos':
        return <Products />
      case 'proveedores':
        return <Suppliers />
      case 'ubicaciones':
        return <Locations />
      case 'movimientos':
        return <Movements />
      case 'salidas':
        return <Exits />
      case 'ventas-homedepot':
        return <HomeDepotSales />
      case 'costos-variables':
        return <VariableCosts />
      case 'inventario-inteligente':
        return <SmartInventory />
      case 'pedido-personalizado':
        return <CustomOrder />
      case 'thd-comparativo':
        return <ThdComparison />
      case 'entradas':
        return <Entries />
      case 'merma':
        return <Shrinkage />
      case 'facturas':
        return (
          <RoleGuard requireSuperAdmin={true} fallback={ACCESO_DENEGADO}>
            <Invoices />
          </RoleGuard>
        )
      case 'bitacora':
        return (
          <RoleGuard requireSuperAdmin={true} fallback={ACCESO_DENEGADO}>
            <AuditLogs />
          </RoleGuard>
        )
      case 'categorias':
        return <Categories />
      case 'profile':
        return <Profile />
      case 'users':
        return (
          <RoleGuard requireSuperAdmin={true} fallback={ACCESO_DENEGADO}>
            <UserManagement />
          </RoleGuard>
        )
      default:
        return <Home />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600">Cargando...</div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <DarkModeProvider>
      <div className="flex flex-col min-h-screen transition-colors duration-300">
        <Navbar onNavigateToProfile={() => setCurrentPage('profile')} />
        <div className="flex flex-1 pt-16 min-h-0">
          <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
          <main className="flex-1 md:ml-64 transition-all duration-300 flex flex-col min-h-0 overflow-hidden">
            {renderPage()}
          </main>
        </div>
      </div>
    </DarkModeProvider>
  )
}

function App() {
  if (MAINTENANCE_MODE) {
    return <Maintenance />
  }

  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}

export default App

