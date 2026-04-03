import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Gift, Info, RotateCw } from 'lucide-react';
import { toast } from 'sonner';

interface RouletteProps {
  onSpinComplete: () => void;
}

export default function Roulette({ onSpinComplete }: RouletteProps) {
  const { user, completeSpin } = useAuth();
  
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);

  // Ordem exata dos segmentos no sentido horário
  const segments = [
    { value: 1, label: 'R$ 1', color: '#22c55e' },      // Index 0
    { value: 5, label: 'R$ 5', color: '#15803d' },      // Index 1
    { value: 10, label: 'R$ 10', color: '#16a34a' },    // Index 2
    { value: 15, label: 'R$ 15', color: '#166534' },    // Index 3
    { value: 20, label: 'R$ 20', color: '#22c55e' },    // Index 4
    { value: 35, label: 'R$ 35', color: '#15803d' },    // Index 5
    { value: 50, label: 'R$ 50', color: '#16a34a' },    // Index 6
    { value: 100, label: 'R$ 100', color: '#166534' },  // Index 7
  ];

  const segmentAngle = 360 / segments.length; // 45 graus cada
  
  // ✅ CORRIGIDO: Lê diretamente de girosRoleta
  const girosDisponiveis = user?.girosRoleta || 0;
  const canSpin = girosDisponiveis > 0;

  // Lógica de Probabilidade (Pesos)
  const getPrizeIndex = () => {
    const random = Math.random() * 100;
    
    if (random < 45) return 0;      // 45% de chance para R$ 1
    if (random < 90) return 1;      // 45% de chance para R$ 5
    if (random < 99) return 2;      // 9% de chance para R$ 10
    if (random < 99.5) return 3;    // 0.5% de chance para R$ 15
    if (random < 100) return 4;     // 0.5% de chance para R$ 20
    
    return 0; // Fallback
  };

  const handleSpin = async () => {
    if (!canSpin || isSpinning) return;

    setIsSpinning(true);
    setShowResult(false);

    try {
      const selectedIndex = getPrizeIndex();
      const prize = segments[selectedIndex].value;

      // Cálculo de Rotação Absoluta
      const currentFullTurns = Math.floor(rotation / 360);
      const extraSpins = 10 * 360;
      const stopAngle = 360 - (selectedIndex * segmentAngle);
      
      const safeVariance = (Math.random() - 0.5) * 15;

      const finalRotation = (currentFullTurns * 360) + extraSpins + stopAngle - (segmentAngle / 2) + safeVariance;
      
      setRotation(finalRotation);

      // Espera o tempo da transição CSS (4s)
      setTimeout(async () => {
        try {
            await completeSpin(prize);
            setIsSpinning(false);
            setResult(prize);
            setShowResult(true);
            if(onSpinComplete) onSpinComplete();
            
            toast.success(`🎉 Parabéns! Você ganhou R$ ${prize.toFixed(2)}!`);
        } catch (err) {
            toast.error("Erro ao processar prêmio.");
            setIsSpinning(false);
        }
      }, 4000);

    } catch (err) {
      setIsSpinning(false);
    }
  };

  return (
    <div className="bg-[#111111]/80 backdrop-blur-sm border border-[#1a1a1a] rounded-2xl p-4 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-[#22c55e]" />
          <h3 className="font-bold text-lg text-white">Roleta Premiada</h3>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] px-3 py-1 rounded-full">
          <span className="text-sm text-gray-400">Giros: </span>
          {/* ✅ CORRIGIDO: Mostra o número real do banco */}
          <span className="font-bold text-[#22c55e]">{girosDisponiveis}</span>
        </div>
      </div>

      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 mb-4 flex items-start gap-2">
        <Info className="w-5 h-5 text-[#22c55e] flex-shrink-0 mt-0.5" />
        <div className="text-xs text-gray-400">
          <p className="text-[#22c55e] font-semibold mb-1">Como ganhar giros?</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Novos usuários começam com <span className="text-white font-bold">1 giro grátis</span>.</li>
            <li>Ganhe giros ao realizar um <span className="text-white font-bold">depósito</span>.</li>
            <li>Ganhe giros quando um <span className="text-white font-bold">convidado (Nível 1)</span> depositar.</li>
          </ul>
        </div>
      </div>

      <div className="relative flex justify-center items-center py-6">
        <div className="absolute top-2 z-30">
          <div className="w-0 h-0 border-l-[15px] border-r-[15px] border-t-[25px] border-l-transparent border-r-transparent border-t-[#22c55e] drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
        </div>

        <div className="relative">
          <div className="absolute inset-[-10px] rounded-full bg-[#22c55e]/10 blur-md" />
          
          <div
            className="relative w-64 h-64 rounded-full border-4 border-[#1a1a1a] shadow-2xl overflow-hidden"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning ? 'transform 4.5s cubic-bezier(0.15, 0, 0.15, 1)' : 'none',
            }}
          >
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {segments.map((segment, idx) => {
                const startAngle = idx * segmentAngle - 90;
                const endAngle = (idx + 1) * segmentAngle - 90;
                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;

                const x1 = 100 + 100 * Math.cos(startRad);
                const y1 = 100 + 100 * Math.sin(startRad);
                const x2 = 100 + 100 * Math.cos(endRad);
                const y2 = 100 + 100 * Math.sin(endRad);

                const pathD = `M 100 100 L ${x1} ${y1} A 100 100 0 0 1 ${x2} ${y2} Z`;

                const midAngle = (startAngle + (segmentAngle/2));
                const midRad = (midAngle * Math.PI) / 180;
                const textX = 100 + 65 * Math.cos(midRad);
                const textY = 100 + 65 * Math.sin(midRad);

                return (
                  <g key={idx}>
                    <path d={pathD} fill={segment.color} stroke="#0a0a0a" strokeWidth="1" />
                    <text
                      x={textX} y={textY}
                      fill="white" fontSize="10" fontWeight="900"
                      textAnchor="middle" dominantBaseline="middle"
                      transform={`rotate(${midAngle + 90}, ${textX}, ${textY})`}
                    >
                      {segment.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-[#0a0a0a] rounded-full border-2 border-[#22c55e] flex items-center justify-center shadow-inner">
                <RotateCw className={`w-5 h-5 text-[#22c55e] ${isSpinning ? 'animate-spin' : ''}`} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {showResult && result !== null && (
        <div className="text-center p-4 rounded-xl mb-4 bg-[#22c55e]/10 border border-[#22c55e]/30 animate-bounce">
          <p className="text-white text-3xl font-black">R$ {result.toFixed(2)}</p>
        </div>
      )}

      <button
        onClick={handleSpin}
        disabled={!canSpin || isSpinning}
        className={`w-full py-4 rounded-xl font-black text-lg transition-all ${
          canSpin && !isSpinning
            ? 'bg-[#22c55e] text-black hover:scale-105 active:scale-95 shadow-[0_5px_15px_rgba(34,197,94,0.4)]'
            : 'bg-[#1a1a1a] text-gray-500 cursor-not-allowed'
        }`}
      >
        {isSpinning ? 'SORTEANDO...' : canSpin ? 'GIRAR ROLETA' : 'SEM GIROS DISPONÍVEIS'}
      </button>
    </div>
  );
}
