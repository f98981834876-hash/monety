import { useState } from 'react';
import { useAuth } from './useAuth';

export function useWithdraw() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const canWithdrawNow = (): { allowed: boolean; message?: string } => {
    const now = new Date();
    const brasiliaOffset = -3 * 60; // UTC-3 em minutos
    const localOffset = now.getTimezoneOffset();
    const brasiliaTime = new Date(now.getTime() + (localOffset + brasiliaOffset) * 60000);
    const hour = brasiliaTime.getHours();
    
    if (hour < 9 || hour >= 17) {
      return { 
        allowed: false, 
        message: 'Saques permitidos apenas das 09:00 às 17:00 (horário de Brasília)' 
      };
    }
    return { allowed: true };
  };

  const initiateWithdraw = async (
    amount: number, 
    pixKey: string, 
    pixType: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Usuário não autenticado' };

    const withdrawCheck = canWithdrawNow();
    if (!withdrawCheck.allowed) {
      return { success: false, error: withdrawCheck.message };
    }

    if (amount < 35) {
      return { success: false, error: 'Saque mínimo é R$ 35,00' };
    }

    if (!pixKey.trim()) {
      return { success: false, error: 'Informe a chave PIX' };
    }

    const totalWithFee = amount * 1.1;
    if (user.balance < totalWithFee) {
      return { 
        success: false, 
        error: `Saldo insuficiente. Necessário R$ ${totalWithFee.toFixed(2)} (valor + taxa de 10%)` 
      };
    }

    setLoading(true);

    try {
      // Chamar Netlify Function para criar saque
      const response = await fetch('/.netlify/functions/create-withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          amount,
          pixKey,
          pixType
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar saque');
      }

      return { success: true };
    } catch (error: any) {
      console.error('Erro ao iniciar saque:', error);
      return { success: false, error: error.message || 'Erro desconhecido' };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    canWithdrawNow,
    initiateWithdraw
  };
}
