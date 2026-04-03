import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Pickaxe, TrendingUp, Calendar, DollarSign } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  price: number;
  daily_return: number;
  duration_days: number;
  total_return: number;
  image_url: string;
}

interface ProductCardProps {
  product: Product;
  onInvest: (productId: string) => void;
}

// Cores por plano baseadas nas imagens
const planColors: { [key: string]: { bg: string; border: string; icon: string } } = {
  'Plano Starter': { bg: 'from-blue-500/20 to-blue-600/20', border: 'border-blue-500/50', icon: 'text-blue-400' },
  'Plano Básico': { bg: 'from-green-500/20 to-green-600/20', border: 'border-green-500/50', icon: 'text-green-400' },
  'Plano Bronze': { bg: 'from-orange-500/20 to-orange-600/20', border: 'border-orange-500/50', icon: 'text-orange-400' },
  'Plano Prata': { bg: 'from-gray-400/20 to-gray-500/20', border: 'border-gray-400/50', icon: 'text-gray-300' },
  'Plano Ouro': { bg: 'from-yellow-500/20 to-yellow-600/20', border: 'border-yellow-500/50', icon: 'text-yellow-400' },
  'Plano Platina': { bg: 'from-cyan-500/20 to-cyan-600/20', border: 'border-cyan-500/50', icon: 'text-cyan-400' },
  'Plano Diamante': { bg: 'from-purple-500/20 to-purple-600/20', border: 'border-purple-500/50', icon: 'text-purple-400' },
  'Plano VIP': { bg: 'from-red-500/20 to-red-600/20', border: 'border-red-500/50', icon: 'text-red-400' },
};

export default function ProductCard({ product, onInvest }: ProductCardProps) {
  const colors = planColors[product.name] || { 
    bg: 'from-[#22c55e]/20 to-[#16a34a]/20', 
    border: 'border-[#22c55e]/50', 
    icon: 'text-[#22c55e]' 
  };

  return (
    <Card className={`bg-gradient-to-br ${colors.bg} border-2 ${colors.border} overflow-hidden backdrop-blur-sm hover:scale-105 transition-all shadow-lg`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          <Pickaxe className={`w-8 h-8 ${colors.icon}`} />
          <div className={`px-4 py-2 rounded-full bg-black/30 border ${colors.border}`}>
            <span className={`text-lg font-black ${colors.icon}`}>20% ao dia</span>
          </div>
        </div>
        <CardTitle className="text-white text-lg">{product.name}</CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Investimento</span>
          <span className="text-white font-bold text-lg">R$ {Number(product.price).toFixed(2)}</span>
        </div>
        
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-gray-400">
            <TrendingUp className="w-3 h-3" />
            <span>Retorno Diário (20%)</span>
          </div>
          <span className={`font-bold ${colors.icon}`}>
            R$ {Number(product.daily_return).toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-gray-400">
            <Calendar className="w-3 h-3" />
            <span>Duração</span>
          </div>
          <span className="text-white font-bold">{product.duration_days} dias</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-gray-400">
            <DollarSign className="w-3 h-3" />
            <span>Retorno Total</span>
          </div>
          <span className={`font-bold ${colors.icon}`}>
            R$ {Number(product.total_return).toFixed(2)}
          </span>
        </div>

        <div className={`bg-black/20 border ${colors.border} rounded-lg p-3 my-2`}>
          <p className="text-center text-white font-semibold text-sm">
            Ganhe 20% do valor investido por dia durante 60 dias
          </p>
        </div>

        <Button
          onClick={() => onInvest(product.id)}
          className={`w-full bg-gradient-to-r ${colors.bg} border-2 ${colors.border} hover:scale-105 text-white font-semibold mt-2 shadow-lg transition-all`}
        >
          Investir Agora
        </Button>
      </CardContent>
    </Card>
  );
}
