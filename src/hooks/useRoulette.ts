import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  increment
} from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { useAuth } from '../contexts/AuthContext';

// Probabilidades (Restaurado com todos os valores originais)
const PRIZES = [
  { value: 1, weight: 40 },
  { value: 5, weight: 35 },
  { value: 10, weight: 20 },
  { value: 15, weight: 3 },
  { value: 20, weight: 2 },
  { value: 35, weight: 0 },
  { value: 50, weight: 0 },
  { value: 100, weight: 0 }
];

export function useRoulette() {
  const { user } = useAuth();

  const [canSpin, setCanSpin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [girosDisponiveis, setGirosDisponiveis] = useState(0);

  useEffect(() => {
    checkCanSpin();
  }, [user]);

  // Mantive a sua função original para checar os giros
  const checkCanSpin = async () => {
    if (!user) {
      setGirosDisponiveis(0);
      setCanSpin(false);
      setLoading(false);
      return;
    }

    try {
      // ✅ CORREÇÃO: Agora ele lê do campo certo no banco (girosRoleta)
      const giros = user.girosRoleta || 0;

      setGirosDisponiveis(giros);
      setCanSpin(giros > 0);
    } catch (error) {
      console.error('Error checking roulette status:', error);
    } finally {
      setLoading(false);
    }
  };

  const spin = async (): Promise<{ success: boolean; prize?: number }> => {
    if (!user || girosDisponiveis <= 0) {
      return { success: false };
    }

    try {
      // calcular prêmio
      const totalWeight = PRIZES.reduce((sum, p) => sum + p.weight, 0);
      let random = Math.random() * totalWeight;
      let prize = 1;

      for (const p of PRIZES) {
        random -= p.weight;
        if (random <= 0) {
          prize = p.value;
          break;
        }
      }

      const userRef = doc(db, 'users', user.id);

      // ✅ consome giro + adiciona saldo e ganho total
      await updateDoc(userRef, {
        girosRoleta: increment(-1),
        balance: increment(prize),
        totalEarned: increment(prize)
      });

      // ✅ RESTAURADO: Seu registro original e isolado apenas dos giros da roleta
      await addDoc(collection(db, 'users', user.id, 'rouletteSpins'), {
        prize,
        createdAt: serverTimestamp()
      });

      // ✅ ADICIONADO: Registra também na coleção geral de transações (para aparecer no extrato do usuário)
      await addDoc(collection(db, 'users', user.id, 'transactions'), {
        type: 'roulette',
        amount: prize,
        status: 'completed',
        description: 'Prêmio da roleta',
        createdAt: serverTimestamp()
      });

      return { success: true, prize };
    } catch (error) {
      console.error('Error spinning roulette:', error);
      return { success: false };
    }
  };

  return {
    canSpin,
    loading,
    spin,
    prizes: PRIZES,
    girosDisponiveis
  };
}
