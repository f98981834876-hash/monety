import { useState } from 'react';
import { useAuth } from './useAuth'; // Assumindo seu hook de autenticação

export function useDeposit() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);

  const initiateDeposit = async (amount: number): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Usuário não autenticado' };

    setLoading(true);
    setPixCode(null);
    setQrImage(null);
    setTransactionId(null);

    try {
      const response = await fetch('/.netlify/functions/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount,
          userId: user.id,
          userName: user.email?.split('@')[0] || 'Usuário',
          userDocument: user.document || '02499967315' // Certifique-se de passar o documento se exigido
        })
      });

      // Garantindo que recebemos um JSON válido
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar PIX');
      }

      if (!data.success || !data.pixCode) {
        throw new Error('Código PIX não retornado pelo servidor');
      }

      // -------------------------------------------------------------
      // Fallback de Segurança para a Imagem do QR Code
      // -------------------------------------------------------------
      const qr = data.qrImage || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.pixCode)}`;

      // Atualizando os estados corretamente
      setPixCode(data.pixCode);
      setQrImage(qr);
      if (data.transactionId) setTransactionId(data.transactionId);

      return { success: true };
    } catch (error: any) {
      console.error('Erro ao iniciar depósito:', error);
      return { success: false, error: error.message || 'Erro desconhecido' };
    } finally {
      setLoading(false);
    }
  };

  const resetDeposit = () => {
    setPixCode(null);
    setQrImage(null);
    setTransactionId(null);
  };

  return {
    loading,
    pixCode,
    qrImage,
    transactionId,
    initiateDeposit,
    resetDeposit
  };
}
