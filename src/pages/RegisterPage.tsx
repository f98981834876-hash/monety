import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Mail, Lock, Users, AlertCircle, CheckCircle, User } from 'lucide-react';
import { toast } from 'sonner';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // EFEITO PARA CAPTURAR CÓDIGO DO LOCALSTORAGE
  useEffect(() => {
    const savedCode = localStorage.getItem("inviteCode");
    if (savedCode) {
      setInviteCode(savedCode.toUpperCase());
    }
  }, []);

  const passwordsMatch = password === confirmPassword;
  const showPasswordError = confirmPassword.length > 0 && !passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Digite seu nome');
      toast.error('Aviso', { description: 'Digite seu nome completo' });
      return;
    }

    if (!passwordsMatch) {
      setError('As senhas não coincidem');
      toast.error('Aviso', { description: 'As senhas não coincidem' });
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      toast.error('Aviso', { description: 'A senha deve ter pelo menos 6 caracteres' });
      return;
    }

    setIsLoading(true);

    try {
      // Passamos o inviteCode para a função de registro
      // A lógica de busca do referido será feita dentro do AuthContext
      await register(email, password, name, inviteCode || undefined);
      
      toast.success('🎉 Conta criada!', {
        description: 'Parabéns! Seu cadastro foi realizado com sucesso',
        duration: 2000
      });

      // Limpa o convite usado após o sucesso
      localStorage.removeItem("inviteCode");

      setTimeout(() => {
        navigate('/home'); // Redireciona para home após o registro
      }, 2000);
    } catch (err: any) {
      // Pega o código ou a mensagem de erro que vem do Firebase
      const errorString = err?.code || err?.message || '';
      let errorMsg = 'Ocorreu um erro inesperado ao criar a conta. Tente novamente.';

      // Mapeia os erros de registro do Firebase para mensagens profissionais
      if (errorString.includes('auth/email-already-in-use')) {
        errorMsg = 'Este e-mail já está cadastrado. Tente fazer login ou use outro e-mail.';
      } else if (errorString.includes('auth/invalid-email')) {
        errorMsg = 'O endereço de e-mail fornecido é inválido.';
      } else if (errorString.includes('auth/weak-password')) {
        errorMsg = 'A senha escolhida é muito fraca. Escolha uma senha mais segura.';
      } else if (errorString.includes('auth/network-request-failed')) {
        errorMsg = 'Erro de conexão. Verifique sua internet e tente novamente.';
      } else if (errorString.includes('auth/too-many-requests')) {
        errorMsg = 'Muitas tentativas. Por segurança, aguarde alguns minutos e tente novamente.';
      }

      setError(errorMsg);
      toast.error('Falha no Cadastro', {
        description: errorMsg
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#0f0f0f] to-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[#22c55e] to-[#16a34a] rounded-2xl flex items-center justify-center shadow-2xl shadow-[#22c55e]/30">
            <span className="text-5xl font-bold text-white">M</span>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">Monety</h1>
          <p className="text-gray-400">Crie sua conta gratuita</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3 animate-slide-down">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome completo"
              className="w-full bg-[#111111]/80 backdrop-blur-sm border border-[#1a1a1a] rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#22c55e] transition-all"
              required
            />
          </div>

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Seu e-mail"
              className="w-full bg-[#111111]/80 backdrop-blur-sm border border-[#1a1a1a] rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#22c55e] transition-all"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Criar senha"
              className="w-full bg-[#111111]/80 backdrop-blur-sm border border-[#1a1a1a] rounded-xl py-4 pl-12 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-[#22c55e] transition-all"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400 transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmar senha"
              className={`w-full bg-[#111111]/80 backdrop-blur-sm border rounded-xl py-4 pl-12 pr-12 text-white placeholder-gray-500 focus:outline-none transition-all ${
                showPasswordError ? 'border-red-500' : confirmPassword && passwordsMatch ? 'border-[#22c55e]' : 'border-[#1a1a1a] focus:border-[#22c55e]'
              }`}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400 transition-colors"
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {showPasswordError && (
            <div className="flex items-center gap-2 text-red-400 text-sm animate-slide-down">
              <AlertCircle className="w-4 h-4" />
              <span>As senhas não coincidem</span>
            </div>
          )}

          {confirmPassword && passwordsMatch && (
            <div className="flex items-center gap-2 text-[#22c55e] text-sm animate-slide-down">
              <CheckCircle className="w-4 h-4" />
              <span>Senhas coincidem</span>
            </div>
          )}

          <div className="relative">
            <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="Código de convite (opcional)"
              className="w-full bg-[#111111]/80 backdrop-blur-sm border border-[#1a1a1a] rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#22c55e] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || showPasswordError}
            className="w-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white font-bold py-4 rounded-xl hover:from-[#16a34a] hover:to-[#22c55e] transition-all disabled:opacity-50 shadow-lg shadow-[#22c55e]/30"
          >
            {isLoading ? 'Criando conta...' : 'CRIAR CONTA'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-400">
            Já tem uma conta?{' '}
            <Link
              to="/"
              className="text-[#22c55e] font-semibold hover:text-[#16a34a] transition-colors"
            >
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
