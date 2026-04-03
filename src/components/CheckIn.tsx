import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Gift, Check, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

interface CheckInProps {
  onCheckInComplete: () => void;
}

export default function CheckIn({ onCheckInComplete }: CheckInProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // 📉 VALORES REDUZIDOS: Max R$ 5.00 no Dia 7
  const rewards = [
    { day: 1, amount: 0.5 },
    { day: 2, amount: 1.0 },
    { day: 3, amount: 1.5 },
    { day: 4, amount: 2.0 },
    { day: 5, amount: 3.0 },
    { day: 6, amount: 4.0 },
    { day: 7, amount: 5.0 }
  ];

  // --- LÓGICA DE VERIFICAÇÃO VIA BANCO DE DADOS ---
  
  // 1. Verifica se já fez check-in hoje comparando a data do servidor com a data local
  const lastCheckInDate = user?.lastCheckIn?.toDate ? user.lastCheckIn.toDate().toDateString() : null;
  const todayDate = new Date().toDateString();
  const checkedInToday = lastCheckInDate === todayDate;

  // 2. Define qual é o dia atual do ciclo (1 a 7)
  const currentStreak = user?.checkInStreak || 0;

  const handleCheckIn = async () => {
    if (!user || checkedInToday || loading) return;

    setLoading(true);

    try {
      // Calcula o próximo dia do ciclo
      const nextDay = currentStreak < 7 ? currentStreak + 1 : 1;
      const reward = rewards.find(r => r.day === nextDay)?.amount || 0.5;

      const userRef = doc(db, 'users', user.id);

      // 3. ATUALIZAÇÃO DIRETA NO FIRESTORE (A prova de falhas)
      await updateDoc(userRef, {
        balance: increment(reward),
        totalEarned: increment(reward),
        checkInStreak: nextDay,
        lastCheckIn: serverTimestamp() // Usa a hora do servidor, não do PC do usuário
      });

      onCheckInComplete();
      
      toast.success('🎉 Check-in Realizado!', {
        description: `R$ ${reward.toFixed(2).replace('.', ',')} adicionados ao seu saldo.`,
        duration: 4000
      });

    } catch (err) {
      console.error('Erro no check-in:', err);
      toast.error('Erro ao processar check-in no servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Grid de dias */}
      <div className="grid grid-cols-7 gap-2">
        {rewards.map((reward) => {
          // Um dia está completo se o streak for maior ou igual a ele
          const isCompleted = reward.day <= currentStreak;
          
          // O dia atual é o próximo após o streak, mas só se não tiver feito hoje
          const isCurrent = !checkedInToday && reward.day === (currentStreak < 7 ? currentStreak + 1 : 1);
          
          const isLocked = reward.day > (checkedInToday ? currentStreak : currentStreak + 1);

          return (
            <div
              key={reward.day}
              className={`relative flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all ${
                isCompleted
                  ? 'bg-[#22c55e]/20 border-[#22c55e] shadow-lg shadow-[#22c55e]/10'
                  : isCurrent
                  ? 'bg-[#22c55e]/10 border-[#22c55e] animate-pulse'
                  : 'bg-[#0a0a0a] border-[#1a1a1a]'
              }`}
            >
              {isCompleted && (
                <div className="absolute -top-1 -right-1 bg-[#22c55e] rounded-full p-0.5 shadow-lg">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              {isLocked && !isCompleted && (
                <Lock className="w-3 h-3 text-gray-500 mb-1" />
              )}
              <Gift className={`w-5 h-5 mb-1 transition-colors ${
                isCompleted ? 'text-[#22c55e]' : isCurrent ? 'text-[#22c55e]/70' : 'text-gray-500'
              }`} />
              <span className={`text-[10px] font-semibold ${
                isCompleted ? 'text-[#22c55e]' : isCurrent ? 'text-white' : 'text-gray-500'
              }`}>
                Dia {reward.day}
              </span>
              <span className={`text-[9px] ${
                isCompleted ? 'text-[#22c55e]' : isCurrent ? 'text-white' : 'text-gray-500'
              }`}>
                R$ {reward.amount.toFixed(2).replace('.', ',')}
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
        {loading ? 'Processando...' : checkedInToday ? '✓ Já resgatado hoje' : 'Resgatar Prémio Diário'}
      </Button>
    </div>
  );
}
