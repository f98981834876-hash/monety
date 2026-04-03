import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Gift, Check, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface CheckInProps {
  onCheckInComplete: () => void;
}

export default function CheckIn({ onCheckInComplete }: CheckInProps) {
  // Pegamos a nova função updateBalance do contexto
  const { updateBalance } = useAuth(); 
  
  const [currentDay, setCurrentDay] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [loading, setLoading] = useState(false);

  const rewards = [
    { day: 1, amount: 1 },
    { day: 2, amount: 2 },
    { day: 3, amount: 3 },
    { day: 4, amount: 5 },
    { day: 5, amount: 8 },
    { day: 6, amount: 13 },
    { day: 7, amount: 20 }
  ];

  useEffect(() => {
    loadLocalCheckInStatus();
  }, []);

  const loadLocalCheckInStatus = () => {
    const storedDay = localStorage.getItem('checkin_day');
    const lastCheckInDate = localStorage.getItem('checkin_last_date');
    const today = new Date().toLocaleDateString();

    if (storedDay) {
      setCurrentDay(parseInt(storedDay));
    }

    if (lastCheckInDate === today) {
      setCheckedInToday(true);
    } else {
      setCheckedInToday(false);
    }
  };

  const handleCheckIn = async () => {
    setLoading(true);

    // Simulando um pequeno delay de rede para UX
    setTimeout(async () => {
      try {
        const today = new Date().toLocaleDateString();
        // Lógica: Se o dia atual no state for 0, o próximo é 1.
        // Se for 7, reseta para 1.
        const nextDay = currentDay < 7 ? currentDay + 1 : 1; 
        
        // Encontrar o valor do prêmio para o dia ATUAL que está sendo reivindicado
        const reward = rewards.find(r => r.day === nextDay)?.amount || 1;

        // 1. ATUALIZAR O SALDO REAL NO FIREBASE E NO CONTEXTO
        await updateBalance(reward);

        // 2. Salvar controle de dias no localStorage
        localStorage.setItem('checkin_last_date', today);
        localStorage.setItem('checkin_day', nextDay.toString());

        // 3. Atualizar estados visuais
        setCheckedInToday(true);
        setCurrentDay(nextDay);
        
        onCheckInComplete();
        
        toast.success('🎉 Parabéns!', {
          description: `Você recebeu R$ ${reward.toFixed(2)} pelo check-in do Dia ${nextDay}`,
          duration: 4000
        });

      } catch (err) {
        console.error('Error checking in:', err);
        toast.error('Erro ao atualizar seu saldo. Tente novamente.');
      } finally {
        setLoading(false);
      }
    }, 800); 
  };

  return (
    <div className="space-y-4">
      {/* Grid de dias */}
      <div className="grid grid-cols-7 gap-2">
        {rewards.map((reward) => {
          const visualCompleted = reward.day <= currentDay;
          // Mostra como atual se não fez checkin hoje e é o próximo dia
          const visualCurrent = !checkedInToday && reward.day === (currentDay + 1);
          // Caso especial: se o ciclo reiniciou (currentDay=7 e checkedIn=true), tudo parece completo
          
          const visualLocked = reward.day > currentDay + 1;

          return (
            <div
              key={reward.day}
              className={`relative flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all ${
                visualCompleted
                  ? 'bg-[#22c55e]/20 border-[#22c55e] shadow-lg shadow-[#22c55e]/10'
                  : visualCurrent
                  ? 'bg-[#22c55e]/10 border-[#22c55e] animate-pulse'
                  : 'bg-[#0a0a0a] border-[#1a1a1a]'
              }`}
            >
              {visualCompleted && (
                <div className="absolute -top-1 -right-1 bg-[#22c55e] rounded-full p-0.5 shadow-lg">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              {visualLocked && (
                <Lock className="w-3 h-3 text-gray-500 mb-1" />
              )}
              <Gift className={`w-5 h-5 mb-1 transition-colors ${
                visualCompleted ? 'text-[#22c55e]' : visualCurrent ? 'text-[#22c55e]/70' : 'text-gray-500'
              }`} />
              <span className={`text-[10px] font-semibold ${
                visualCompleted ? 'text-[#22c55e]' : visualCurrent ? 'text-white' : 'text-gray-500'
              }`}>
                Dia {reward.day}
              </span>
              <span className={`text-[9px] ${
                visualCompleted ? 'text-[#22c55e]' : visualCurrent ? 'text-white' : 'text-gray-500'
              }`}>
                R$ {reward.amount}
              </span>
            </div>
          );
        })}
      </div>

      <Button
        onClick={handleCheckIn}
        disabled={checkedInToday || loading}
        className="w-full bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#22c55e]/20 transition-all py-6 text-base font-semibold"
      >
        {loading ? 'Recebendo prêmio...' : checkedInToday ? '✓ Check-in feito hoje!' : 'Fazer Check-in'}
      </Button>
    </div>
  );
}