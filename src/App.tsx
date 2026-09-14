// Root component: handles auth gating and renders the active page based on
// the current navigation state.
// Wraps the app shell (navbar, sidebar) once the user is authenticated.
import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import { DarkModeProvider } from './context/DarkModeContext'
import { Sidebar } from './components/Sidebar'
import { Navbar } from './components/NavBar'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { Productos } from './pages/Productos'
import { Proveedores } from './pages/Proveedores'
import { Ubicaciones } from './pages/Ubicaciones'
import { Movimientos } from './pages/Movimientos'
import { Salidas } from './pages/Salidas'
import { VentasHomeDepot } from './pages/VentasHomeDepot'
import { CostosVariables } from './pages/CostosVariables'
import { InventarioInteligente } from './pages/InventarioInteligente'
import { PedidoPersonalizado } from './pages/PedidoPersonalizado'
import { THDComparativo } from './pages/THDComparativo'
import { Categorias } from './pages/Categorias'
import Profile from './components/Profile'
import { UserManagement } from './pages/UserManagement'
import { Entradas } from './pages/Entradas'
import { Merma } from './pages/Merma'
import { Facturas } from './pages/Facturas'
import { Bitacora } from './pages/Bitacora'
import { RoleGuard } from './components/RoleGuard'

const ACCESO_DENEGADO = (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <h2 className="text-2xl font-bold text-red-600 mb-2">Acceso Denegado</h2>
      <p className="text-gray-600">No tienes permisos para acceder a esta página.</p>
    </div>
  </div>
)

function App() {
  const { user, loading } = useAuth()
  const [currentPage, setCurrentPage] = useState('home')

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home />
      case 'productos':
        return <Productos />
      case 'proveedores':
        return <Proveedores/>
      case 'ubicaciones':
        return <Ubicaciones/>
      case 'movimientos':
        return <Movimientos/>
      case 'salidas':
        return <Salidas/>
      case 'ventas-homedepot':
        return <VentasHomeDepot/>
      case 'costos-variables':
        return <CostosVariables/>
      case 'inventario-inteligente':
        return <InventarioInteligente />
      case 'pedido-personalizado':
        return <PedidoPersonalizado />
      case 'thd-comparativo':
        return <THDComparativo />
      case 'entradas':
        return <Entradas />
      case 'merma':
        return <Merma />
      case 'facturas':
        return (
          <RoleGuard requireSuperAdmin={true} fallback={ACCESO_DENEGADO}>
            <Facturas />
          </RoleGuard>
        )
      case 'bitacora':
        return (
          <RoleGuard requireSuperAdmin={true} fallback={ACCESO_DENEGADO}>
            <Bitacora />
          </RoleGuard>
        )
      case 'categorias':
        return <Categorias/>
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

export default App

