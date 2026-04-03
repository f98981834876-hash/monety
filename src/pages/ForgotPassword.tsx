import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await resetPassword(email);
      setSuccess(true);
      toast.success('E-mail enviado!', {
        description: 'Verifique a sua caixa de entrada para redefinir a sua senha.'
      });
    } catch (err: any) {
      const errorString = err?.code || err?.message || '';
      let errorMsg = 'Ocorreu um erro ao tentar redefinir a senha.';

      if (errorString.includes('auth/invalid-email')) {
        errorMsg = 'O endereço de e-mail fornecido é inválido.';
      } else if (errorString.includes('auth/user-not-found')) {
        errorMsg = 'Não encontrámos nenhuma conta com este e-mail.';
      }

      setError(errorMsg);
      toast.error('Erro na recuperação', {
        description: errorMsg
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#0f0f0f] to-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        
        <div className="bg-[#111111]/80 backdrop-blur-sm border border-[#1a1a1a] rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center mb-6">
            <Link to="/login" className="text-gray-400 hover:text-white transition-colors mr-3">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h2 className="text-2xl font-bold text-white">Recuperar Senha</h2>
          </div>

          <p className="text-gray-400 mb-6 text-sm">
            Introduza o seu e-mail abaixo e enviar-lhe-emos as instruções para redefinir a sua senha.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2 animate-slide-down">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-2 animate-slide-down">
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-200">E-mail de recuperação enviado com sucesso! Verifique também a sua pasta de spam.</p>
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

            <button
              type="submit"
              disabled={loading || success}
              className="w-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] hover:from-[#16a34a] hover:to-[#22c55e] text-white font-semibold py-4 text-lg shadow-lg shadow-[#22c55e]/30 transition-all rounded-xl disabled:opacity-50 mt-2"
            >
              {loading ? 'A enviar...' : 'Enviar link de recuperação'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
