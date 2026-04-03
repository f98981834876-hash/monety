import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from 'sonner';
import { Home, ShoppingBag, Users, User } from 'lucide-react';

// Importação das páginas
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import ProfilePage from './pages/ProfilePage';
import TeamPage from './pages/TeamPage';

// Importação do novo componente de Depósito
import DepositScreen from './components/DepositScreen';

// Layout para rotas protegidas
function PrivateLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      {/* Header */}
      <header className="bg-[#111111] border-b border-[#1a1a1a] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#22c55e] to-[#16a34a] rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold text-white">M</span>
            </div>
            <span className="text-2xl font-bold text-white">Monety</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Navegação Inferior */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#111111] border-t border-[#1a1a1a] z-50">
        <div className="max-w-7xl mx-auto px-2">
          <div className="grid grid-cols-4 gap-1">
            <button onClick={() => navigate('/home')} className={`flex flex-col items-center justify-center py-3 rounded-lg transition-all ${isActive('/home') ? 'bg-[#22c55e] text-white' : 'text-gray-400'}`}>
              <Home className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Início</span>
            </button>
            <button onClick={() => navigate('/products')} className={`flex flex-col items-center justify-center py-3 rounded-lg transition-all ${isActive('/products') ? 'bg-[#22c55e] text-white' : 'text-gray-400'}`}>
              <ShoppingBag className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Produtos</span>
            </button>
            <button onClick={() => navigate('/team')} className={`flex flex-col items-center justify-center py-3 rounded-lg transition-all ${isActive('/team') ? 'bg-[#22c55e] text-white' : 'text-gray-400'}`}>
              <Users className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Equipe</span>
            </button>
            <button onClick={() => navigate('/profile')} className={`flex flex-col items-center justify-center py-3 rounded-lg transition-all ${isActive('/profile') ? 'bg-[#22c55e] text-white' : 'text-gray-400'}`}>
              <User className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Perfil</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Rotas Públicas */}
      <Route path="/" element={!user ? <LoginPage /> : <Navigate to="/home" replace />} />
      <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/home" replace />} />

      {/* Rotas Privadas */}
      <Route element={<PrivateLayout />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/deposit" element={<DepositScreen />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  useEffect(() => {
    // Captura o código da URL: exemplo.com/?code=ABC123
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    
    if (code) {
      // Salva no localStorage para uso posterior no registro
      localStorage.setItem("inviteCode", code);
      console.log("Código de convite detectado e salvo:", code);
    }
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
