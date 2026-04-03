import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { TrendingUp, History, X, Timer, Pickaxe, Gem, Crown, Sparkles, Star, Award, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// Importações do Firebase
import { 
  collection, 
  getDocs, 
  addDoc, 
  query, 
  where, 
  doc, 
  updateDoc, 
  increment, 
  serverTimestamp, 
  writeBatch,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

/* ==================================================================================
   INTERFACES & CONFIGURAÇÃO VISUAL
   ================================================================================== */

interface Product {
  id: string;
  name: string;
  price: number;
  daily_return: number;
  duration_days: number;
  total_return: number;
  image_url: string;
  tier: string;
  icon: string;
}

interface Investment {
  id: string;
  product_name: string;
  amount: number;
  daily_return: number;
  days_remaining: number;
  days_elapsed: number;
  created_at: any;
  days_paid?: number;
}

const tierColors: Record<string, { bg: string; border: string; icon: string }> = {
  bronze: { bg: 'from-amber-900/20 to-amber-800/20', border: 'border-amber-700/30', icon: 'text-amber-500' },
  silver: { bg: 'from-gray-500/20 to-gray-600/20', border: 'border-gray-500/30', icon: 'text-gray-400' },
  gold: { bg: 'from-yellow-600/20 to-yellow-700/20', border: 'border-yellow-600/30', icon: 'text-yellow-500' },
  platinum: { bg: 'from-cyan-600/20 to-cyan-700/20', border: 'border-cyan-600/30', icon: 'text-cyan-400' },
  diamond: { bg: 'from-blue-600/20 to-blue-700/20', border: 'border-blue-600/30', icon: 'text-blue-400' },
  emerald: { bg: 'from-emerald-600/20 to-emerald-700/20', border: 'border-emerald-600/30', icon: 'text-emerald-400' },
  elite: { bg: 'from-[#22c55e]/20 to-[#16a34a]/20', border: 'border-[#22c55e]/30', icon: 'text-[#22c55e]' },
};

const getIcon = (iconName: string, className: string) => {
  const icons: Record<string, JSX.Element> = {
    pickaxe: <Pickaxe className={className} />,
    gem: <Gem className={className} />,
    crown: <Crown className={className} />,
    sparkles: <Sparkles className={className} />,
    star: <Star className={className} />,
    award: <Award className={className} />,
  };
  return icons[iconName] || <Pickaxe className={className} />;
};

const DEFAULT_PRODUCTS: Product[] = [
  { id: 'prod_1', name: 'Minerador Starter', price: 30, daily_return: 6, duration_days: 60, total_return: 360, image_url: '', tier: 'bronze', icon: 'pickaxe' },
  { id: 'prod_2', name: 'Minerador Básico', price: 50, daily_return: 10, duration_days: 60, total_return: 600, image_url: '', tier: 'silver', icon: 'pickaxe' },
  { id: 'prod_3', name: 'Minerador Pro', price: 100, daily_return: 20, duration_days: 60, total_return: 1200, image_url: '', tier: 'gold', icon: 'gem' },
  { id: 'prod_4', name: 'Minerador Master', price: 300, daily_return: 60, duration_days: 60, total_return: 3600, image_url: '', tier: 'platinum', icon: 'sparkles' },
  { id: 'prod_5', name: 'Minerador VIP', price: 500, daily_return: 100, duration_days: 60, total_return: 6000, image_url: '', tier: 'diamond', icon: 'gem' },
  { id: 'prod_6', name: 'Minerador Supreme', price: 1000, daily_return: 200, duration_days: 60, total_return: 12000, image_url: '', tier: 'emerald', icon: 'star' },
  { id: 'prod_7', name: 'Minerador Legend', price: 3000, daily_return: 600, duration_days: 60, total_return: 36000, image_url: '', tier: 'elite', icon: 'crown' },
];

/* ==================================================================================
   COMPONENTE PRINCIPAL
   ================================================================================== */

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  
  // NOVO ESTADO: Guarda qual produto o usuário clicou para comprar
  const [productToConfirm, setProductToConfirm] = useState<Product | null>(null);

  useEffect(() => {
    const init = async () => {
      await fetchProducts();
      if (user?.id) {
        await processInvestments();
      }
      setLoading(false);
    };
    init();

    const interval = setInterval(() => {
       if (user?.id) processInvestments(false);
    }, 60000);

    return () => clearInterval(interval);
  }, [user?.id]);

  const fetchProducts = async () => {
    try {
      const productsRef = collection(db, 'products');
      const snapshot = await getDocs(productsRef);
      
      if (!snapshot.empty) {
        const data = snapshot.docs.map((doc, idx) => {
          const pData = doc.data();
          return {
            id: doc.id,
            ...pData,
            tier: pData.tier || ['bronze', 'silver', 'gold'][idx % 3],
            icon: pData.icon || 'pickaxe'
          } as Product;
        });
        setProducts(data);
      } else {
        setProducts(DEFAULT_PRODUCTS);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setProducts(DEFAULT_PRODUCTS);
    }
  };

  const processInvestments = async (fetchFromDb = true) => {
    if (!user?.id) return;

    try {
      let currentData = investments;

      if (fetchFromDb) {
        const q = query(collection(db, 'investments'), where('userId', '==', user.id));
        const snapshot = await getDocs(q);
        currentData = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        })) as any[];
      }

      const now = new Date();
      const batch = writeBatch(db);
      let totalEarnings = 0;
      let updatesCount = 0;

      const processed = currentData.map(inv => {
        let createdAt: Date;
        if (inv.created_at?.toDate) {
            createdAt = inv.created_at.toDate();
        } else if (inv.created_at instanceof Date) {
            createdAt = inv.created_at;
        } else {
            createdAt = new Date();
        }

        const duration = inv.duration_days || 60;
        
        const diffMs = Math.max(0, now.getTime() - createdAt.getTime());
        const daysElapsed = Math.floor(diffMs / 86400000);
        
        const effectiveDays = Math.min(daysElapsed, duration);
        const daysRemaining = Math.max(0, duration - effectiveDays);

        const daysPaid = inv.days_paid || 0;
        
        if (effectiveDays > daysPaid && inv.status === 'active') {
            const daysToPay = effectiveDays - daysPaid;
            const profit = daysToPay * (inv.daily_return || 0);

            if (profit > 0) {
                totalEarnings += profit;
                updatesCount++;
                
                const invRef = doc(db, 'investments', inv.id);
                batch.update(invRef, { days_paid: effectiveDays });
                
                inv.days_paid = effectiveDays;
            }
        }

        return {
            ...inv,
            days_remaining: daysRemaining,
            days_elapsed: effectiveDays,
            created_at: createdAt
        };
      });

      setInvestments(processed);

      if (updatesCount > 0) {
        const userRef = doc(db, 'users', user.id);
        batch.update(userRef, {
            balance: increment(totalEarnings),
            totalEarned: increment(totalEarnings)
        });

        await batch.commit();
        showProfitNotification(totalEarnings);
      }

    } catch (err) {
      console.error('Error processing investments:', err);
    }
  };

  const showProfitNotification = (amount: number) => {
    toast.custom((t) => (
      <div className="bg-[#111111] border border-[#22c55e]/30 rounded-lg p-4 shadow-lg shadow-[#22c55e]/10 flex items-center gap-4 animate-in slide-in-from-top-2 fade-in duration-300 pointer-events-auto">
        <div className="bg-[#22c55e]/20 p-2 rounded-full">
          <AlertCircle className="w-6 h-6 text-[#22c55e]" /> 
        </div>
        <div>
          <h4 className="font-bold text-white text-sm">Rendimento Recebido!</h4>
          <p className="text-gray-300 text-xs mt-1">
            Você recebeu <span className="text-[#22c55e] font-bold">R$ {amount.toFixed(2)}</span> dos seus produtos.
          </p>
        </div>
        <button onClick={() => toast.dismiss(t)} className="ml-auto text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
        </button>
      </div>
    ), { duration: 5000 });
  };

  const handleInvestment = async (product: Product) => {
    const userBalance = Number(user?.balance) || 0;
    
    if (userBalance < product.price) {
      toast.error('Saldo insuficiente', {
        description: 'Faça um depósito para continuar'
      });
      setProductToConfirm(null); // Fecha o modal se falhar
      return;
    }

    if (!user?.id) {
      toast.error('Erro de autenticação');
      setProductToConfirm(null);
      return;
    }

    try {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        balance: increment(-product.price)
      });

      await addDoc(collection(db, 'investments'), {
        userId: user.id,
        productId: product.id,
        product_name: product.name,
        amount: product.price,
        daily_return: product.daily_return,
        duration_days: product.duration_days,
        status: 'active',
        created_at: serverTimestamp(),
        days_paid: 0
      });

      toast.success('🎉 Compra realizada!', {
        description: `Você adquiriu o ${product.name} com sucesso`
      });
      
      setProductToConfirm(null); // FECHA O MODAL APÓS O SUCESSO
      processInvestments(true);

    } catch (err) {
      console.error('Error investing:', err);
      toast.error('Erro ao realizar investimento');
      setProductToConfirm(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#22c55e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Carregando produtos...</p>
        </div>
      </div>
    );
  }

  /* ==================================================================================
     RENDERIZAÇÃO
     ================================================================================== */
  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-down">
        <div>
          <h1 className="text-2xl font-bold text-white">Produtos</h1>
          <p className="text-gray-400 text-sm">Invista e receba 20% de retorno diário</p>
        </div>
        <Button
          onClick={() => setShowHistory(true)}
          className="bg-[#111111] border border-[#1a1a1a] text-white hover:bg-[#1a1a1a]"
        >
          <History className="w-4 h-4 mr-2" />
          Histórico
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-[#111111]/80 backdrop-blur-sm border border-[#22c55e]/20 rounded-xl p-3 flex items-center gap-3">
        <TrendingUp className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
        <p className="text-sm text-gray-300">
          Todos os mineradores rendem <span className="text-[#22c55e] font-bold">20% ao dia</span> sobre o valor investido
        </p>
      </div>

      {/* Saldo Card */}
      <div className="bg-[#111111]/80 backdrop-blur-sm border border-[#1a1a1a] rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">Seu saldo</p>
          <p className="text-xl font-bold text-white">R$ {(Number(user?.balance) || 0).toFixed(2)}</p>
        </div>
        <div className="w-10 h-10 bg-[#22c55e]/20 rounded-lg flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-[#22c55e]" />
        </div>
      </div>

      {/* Products Grid */}
      <div className="space-y-3">
        {products.map((product, index) => {
          const colors = tierColors[product.tier] || tierColors.bronze;
          const userBalance = Number(user?.balance) || 0;
          const canBuy = userBalance >= Number(product.price);

          return (
            <div
              key={product.id}
              className={`bg-gradient-to-br ${colors.bg} border ${colors.border} rounded-xl overflow-hidden animate-fade-in`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="p-4">
                {/* Header do Card */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 bg-gradient-to-br ${colors.bg} rounded-lg flex items-center justify-center`}>
                      {getIcon(product.icon, `w-5 h-5 ${colors.icon}`)}
                    </div>
                    <div>
                      <h3 className="font-bold text-white">{product.name}</h3>
                      <p className="text-[#22c55e] font-bold">R$ {Number(product.price).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-[#0a0a0a]/50 rounded-lg p-2 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp className="w-3 h-3 text-[#22c55e]" />
                      <span className="text-gray-500 text-xs">Diário</span>
                    </div>
                    <p className="text-sm font-bold text-[#22c55e]">R$ {Number(product.daily_return).toFixed(2)}</p>
                  </div>
                  <div className="bg-[#0a0a0a]/50 rounded-lg p-2 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-500 text-xs">Duração</span>
                    </div>
                    <p className="text-sm font-bold text-white">{product.duration_days} dias</p>
                  </div>
                  <div className="bg-[#0a0a0a]/50 rounded-lg p-2 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp className="w-3 h-3 text-[#22c55e]" />
                      <span className="text-gray-500 text-xs">ROI</span>
                    </div>
                    <p className="text-sm font-bold text-[#22c55e]">
                      {((Number(product.daily_return) * product.duration_days / Number(product.price)) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>

                {/* Total Return Box */}
                <div className="bg-[#0a0a0a]/50 rounded-lg p-2 mb-3 text-center">
                  <span className="text-gray-500 text-xs">Retorno total em {product.duration_days} dias</span>
                  <p className="text-lg font-bold text-[#22c55e]">
                    R$ {(Number(product.daily_return) * product.duration_days).toFixed(2)}
                  </p>
                </div>

                {/* Buy Button MODIFICADO */}
                <button
                  onClick={() => setProductToConfirm(product)} // AQUI: em vez de comprar direto, abre o modal
                  disabled={!canBuy}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                    canBuy
                      ? 'bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white hover:from-[#16a34a] hover:to-[#22c55e] shadow-lg shadow-[#22c55e]/20'
                      : 'bg-[#1a1a1a] text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {canBuy ? 'COMPRAR AGORA' : 'SALDO INSUFICIENTE'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* =========================================================
          NOVO MODAL DE CONFIRMAÇÃO DE COMPRA
          ========================================================= */}
      <Dialog open={!!productToConfirm} onOpenChange={(open) => !open && setProductToConfirm(null)}>
        <DialogContent className="bg-[#111111] border-[#1a1a1a] text-white max-w-md mx-auto w-[90%] rounded-xl">
          <DialogHeader className="border-b border-[#1a1a1a] pb-4">
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              Confirmar Compra
            </DialogTitle>
            <DialogDescription className="text-gray-400 mt-2">
              Você está prestes a adquirir um novo minerador. Confira os detalhes abaixo:
            </DialogDescription>
          </DialogHeader>

          {productToConfirm && (
            <div className="pt-4 space-y-4">
              <div className="bg-[#0a0a0a] rounded-lg p-4 border border-[#1a1a1a]">
                <div className="flex justify-between mb-3 pb-3 border-b border-[#1a1a1a]">
                  <span className="text-gray-400">Produto:</span>
                  <span className="font-bold text-white">{productToConfirm.name}</span>
                </div>
                <div className="flex justify-between mb-3 pb-3 border-b border-[#1a1a1a]">
                  <span className="text-gray-400">Valor a descontar:</span>
                  <span className="font-bold text-[#ef4444]">- R$ {Number(productToConfirm.price).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Retorno Diário:</span>
                  <span className="font-bold text-[#22c55e]">+ R$ {Number(productToConfirm.daily_return).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => setProductToConfirm(null)}
                  className="flex-1 bg-transparent border border-gray-600 text-gray-300 hover:bg-[#1a1a1a] hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => handleInvestment(productToConfirm)}
                  className="flex-1 bg-[#22c55e] hover:bg-[#16a34a] text-white border-none"
                >
                  Confirmar Compra
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="bg-[#111111] border-[#1a1a1a] text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-[#1a1a1a]">
            <div>
              <DialogTitle className="text-xl font-bold text-white">Histórico de Compras</DialogTitle>
              <DialogDescription className="text-gray-500 mt-1">
                Visualize seus mineradores ativos e rendimentos.
              </DialogDescription>
            </div>
            
            <button
              onClick={() => setShowHistory(false)}
              className="w-10 h-10 bg-[#0a0a0a] rounded-full flex items-center justify-center hover:bg-[#1a1a1a] transition-colors shrink-0"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </DialogHeader>

          <div className="pt-4">
            {investments.length === 0 ? (
              <div className="text-center py-8">
                <History className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Nenhum investimento ativo</p>
                <p className="text-gray-500 text-sm">Compre um produto para começar a ganhar</p>
              </div>
            ) : (
              <div className="space-y-3">
                {investments.map((inv) => {
                  const totalDays = inv.duration_days || 60;
                  const progress = Math.min(100, ((inv.days_elapsed || 0) / totalDays) * 100);

                  return (
                    <div key={inv.id} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-white">{inv.product_name}</h3>
                        <span className="text-[#22c55e] font-bold">R$ {Number(inv.amount).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                          <Timer className="w-4 h-4" />
                          <span>Tempo restante</span>
                        </div>
                        <div className="bg-[#22c55e]/20 px-3 py-1 rounded-full">
                          <span className="text-[#22c55e] font-bold text-sm">{inv.days_remaining} dias</span>
                        </div>
                      </div>
                      
                      {/* Barra de Progresso */}
                      <div className="bg-[#1a1a1a] rounded-full h-2 overflow-hidden mb-2 relative">
                        <div
                          className="bg-gradient-to-r from-[#22c55e] to-[#16a34a] h-full transition-all duration-1000"
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-xs mt-2">
                          <span className="text-gray-500">
                            Rendimento diário: <span className="text-[#22c55e]">+R$ {Number(inv.daily_return).toFixed(2)}</span>
                          </span>
                          <span className="text-gray-600">
                             {inv.days_elapsed} / {totalDays} dias
                          </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
