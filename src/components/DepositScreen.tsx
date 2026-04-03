import React, { useState } from 'react';
import { useDeposit } from '../hooks/useDeposit'; // Ajuste o caminho se necessário
import { toast } from 'sonner';
import { Copy } from 'lucide-react';

const DepositScreen: React.FC = () => {
  const [amount, setAmount] = useState<string>('');
  const { loading, pixCode, qrImage, initiateDeposit } = useDeposit();

  const handleGeneratePix = async () => {
    const value = parseFloat(amount);
    
    // Validação básica do valor mínimo de R$ 30,00 que você configurou no backend
    if (isNaN(value) || value < 30) {
      toast.error('O valor mínimo de depósito é R$ 30,00');
      return;
    }

    try {
      await initiateDeposit(value);
    } catch (error) {
      toast.error('Erro ao gerar o PIX. Tente novamente.');
    }
  };

  const handleCopy = () => {
    if (pixCode) {
      navigator.clipboard.writeText(pixCode);
      toast.success('Código PIX copiado com sucesso!');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto mt-8 p-6 bg-[#111111] rounded-2xl border border-[#1a1a1a]">
      <h2 className="text-2xl font-bold text-white mb-6">Depósito via PIX</h2>

      {!pixCode || !qrImage ? (
        // TELA 1: ANTES DO PAGAMENTO GERADO
        <div className="w-full flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="amount" className="text-sm text-gray-400">
              Valor do Depósito
            </label>
            <input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex: 50.00"
              className="w-full bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded-lg px-4 py-3 focus:outline-none focus:border-[#22c55e]"
              min="30"
              step="0.01"
            />
          </div>

          <button
            onClick={handleGeneratePix}
            disabled={loading || !amount}
            className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Gerando...' : 'Gerar PIX'}
          </button>
        </div>
      ) : (
        // TELA 2: DEPOIS DO PAGAMENTO GERADO
        <div className="w-full flex flex-col items-center gap-6">
          <div className="bg-white p-3 rounded-xl">
            <img 
              src={qrImage} 
              alt="QR Code PIX" 
              style={{ width: '250px', height: '250px' }} 
              className="object-cover"
            />
          </div>

          <div className="w-full flex flex-col gap-2">
            <label className="text-sm text-gray-400">Código PIX (Copia e Cola)</label>
            <textarea
              readOnly
              value={pixCode}
              className="w-full bg-[#0a0a0a] text-gray-300 border border-[#2a2a2a] rounded-lg px-4 py-3 text-sm h-24 resize-none focus:outline-none"
            />
          </div>

          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold py-3 rounded-lg transition-colors"
          >
            <Copy className="w-5 h-5" />
            Copiar Código PIX
          </button>
        </div>
      )}
    </div>
  );
};

export default DepositScreen;
