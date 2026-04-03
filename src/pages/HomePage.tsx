import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import CheckIn from '../components/CheckIn';
import Roulette from '../components/Roulette';
import { TrendingUp, Users, Wallet } from 'lucide-react';

export default function HomePage() {
  const { user, token } = useAuth();
  const [stats, setStats] = useState({ todayEarnings: 0, newInvites: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Endpoint corrigido para o padrão do Netlify Functions
      const response = await fetch('/.netlify/functions/stats-today', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Garante que o estado receba os dados ou mantenha os zeros caso o backend mande vazio
        setStats({
          todayEarnings: data.todayEarnings || 0,
          newInvites: data.newInvites || 0
        });
      } else {
        // Se a resposta não for 200 OK, define como 0 e loga o erro sem quebrar o app
        console.error('Falha ao buscar estatísticas. Status:', response.status);
        setStats({ todayEarnings: 0, newInvites: 0 });
      }
    } catch (err) {
      // Se der erro de rede, CORS ou falha de parse (como o Unexpected token <), cai aqui e zera
      console.error('Error fetching stats:', err);
      setStats({ todayEarnings: 0, newInvites: 0 });
    } finally {
      setLoading(false);
    }
  };

  const getUserInitial = () => {
    return user?.email?.charAt(0).toUpperCase() || 'M';
  };

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="flex items-center justify-between animate-slide-down">
        <div>
          <p className="text-gray-400 text-sm">Bem-vindo de volta</p>
          <h1 className="text-xl font-bold text-white">
            {user?.email?.split('@')[0] || 'Usuário'}
          </h1>
        </div>
        <div className="w-12 h-12 bg-gradient-to-br from-[#22c55e] to-[#16a34a] rounded-full flex items-center justify-center shadow-lg shadow-[#22c55e]/30">
          <span className="text-xl font-bold text-white">{getUserInitial()}</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a] animate-fade-in">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-[#22c55e]/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-[#22c55e]" />
              </div>
              <span className="text-gray-400 text-sm">Ganhos Hoje</span>
            </div>
            <p className="text-2xl font-bold text-[#22c55e]">
              R$ {stats.todayEarnings.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a] animate-fade-in">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-[#22c55e]/20 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-[#22c55e]" />
              </div>
              <span className="text-gray-400 text-sm">Convidados</span>
            </div>
            <p className="text-2xl font-bold text-[#22c55e]">{stats.newInvites}</p>
          </CardContent>
        </Card>
      </div>

      {/* Balance Card */}
      <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#22c55e]/30 animate-fade-in">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-5 h-5 text-[#22c55e]" />
            <span className="text-gray-400 text-sm">Saldo Disponível</span>
          </div>
          <p className="text-3xl font-extrabold text-white mb-3">
            R$ {(Number(user?.balance) || 0).toFixed(2)}
          </p>
          <div className="pt-3 border-t border-[#1a1a1a]">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Ganhos</span>
              <span className="text-[#22c55e] font-semibold">
                R$ {(Number(user?.totalEarned) || 0).toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Check-in */}
      <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a] animate-fade-in">
        <CardContent className="pt-6">
          <h3 className="text-white font-bold mb-4">Login Diário</h3>
          <CheckIn onCheckInComplete={fetchStats} />
        </CardContent>
      </Card>

      {/* Roulette */}
      <div className="animate-fade-in">
        <Roulette onSpinComplete={fetchStats} />
      </div>
    </div>
  );
}
