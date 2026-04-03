import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      toast.success('🎉 Bem-vindo ao Monety!', {
        description: 'Login realizado com sucesso',
        duration: 3000
      });
      navigate('/home');
    } catch (err: any) {
      const errorString = err?.code || err?.message || '';
      let errorMsg = 'Ocorreu um erro inesperado ao fazer login. Tente novamente.';

      if (errorString.includes('auth/invalid-credential') || errorString.includes('auth/user-not-found') || errorString.includes('auth/wrong-password')) {
        errorMsg = 'E-mail ou senha incorretos. Verifique os seus dados e tente novamente.';
      } else if (errorString.includes('auth/invalid-email')) {
        errorMsg = 'O endereço de e-mail fornecido é inválido.';
      } else if (errorString.includes('auth/too-many-requests')) {
        errorMsg = 'Muitas tentativas falhadas. Por segurança, aguarde alguns minutos e tente novamente.';
      } else if (errorString.includes('auth/network-request-failed')) {
        errorMsg = 'Erro de ligação. Verifique a sua internet e tente novamente.';
      }

      setError(errorMsg);
      toast.error('Falha na Autenticação', {
        description: errorMsg
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#0f0f0f] to-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo M */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[#22c55e] to-[#16a34a] rounded-2xl flex items-center justify-center shadow-2xl shadow-[#22c55e]/30">
            <span className="text-5xl font-bold text-white">M</span>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">Monety</h1>
          <p className="text-gray-400">Plataforma de Investimentos</p>
        </div>

        {/* Login Form */}
        <div className="bg-[#111111]/80 backdrop-blur-sm border border-[#1a1a1a] rounded-2xl p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-6">Entrar</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2 animate-slide-down">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#22c55e] transition-all"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl py-4 pl-12 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-[#22c55e] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Link para recuperar senha */}
            <div className="flex justify-end">
              <Link 
                to="/forgot-password" 
                className="text-sm text-gray-400 hover:text-[#22c55e] transition-colors"
              >
                Esqueci a minha senha?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] hover:from-[#16a34a] hover:to-[#22c55e] text-white font-semibold py-6 text-lg shadow-lg shadow-[#22c55e]/30 transition-all rounded-xl disabled:opacity-50 mt-2"
            >
              {loading ? 'A entrar...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Não tem uma conta?{' '}
              <Link
                to="/register"
                className="text-[#22c55e] hover:text-[#16a34a] font-semibold transition-colors hover:underline"
              >
                Registar
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
