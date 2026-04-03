import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Clock, TrendingUp } from 'lucide-react';

interface Investment {
  id: string;
  product_name: string;
  amount: number;
  daily_return: number;
  days_remaining: number;
  created_at: string;
  image_url: string;
}

export default function InvestmentHistory() {
  const { token } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvestments();
  }, []);

  const fetchInvestments = async () => {
    try {
      const response = await fetch('/api/investments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setInvestments(data);
      }
    } catch (err) {
      console.error('Error fetching investments:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <p className="text-gray-400 text-center py-8">Carregando...</p>;
  }

  if (investments.length === 0) {
    return (
      <p className="text-gray-400 text-center py-8">
        Nenhum investimento ainda. Comece agora!
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {investments.map((investment) => (
        <div
          key={investment.id}
          className="flex items-center gap-4 p-4 bg-[#0a0a0a] rounded-lg border border-[#1a1a1a] hover:border-[#22c55e]/30 transition-all animate-slide-up"
        >
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] flex-shrink-0">
            <img
              src={investment.image_url}
              alt={investment.product_name}
              className="w-full h-full object-cover opacity-40"
            />
          </div>
          
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-1">
              {investment.product_name}
            </h3>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span>R$ {Number(investment.amount).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{investment.days_remaining} dias restantes</span>
              </div>
            </div>
            <p className="text-[#22c55e] text-xs mt-1">
              Retorno diário: R$ {Number(investment.daily_return).toFixed(2)}
            </p>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-[#22c55e]">
              {investment.days_remaining}
            </div>
            <p className="text-xs text-gray-400">dias</p>
          </div>
        </div>
      ))}
    </div>
  );
}
