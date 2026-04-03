import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, increment, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../contexts/AuthContext';

interface Product {
  id: string;
  name: string;
  price: number;
  dailyReturn: number;
  durationDays: number;
  totalReturn: number;
  imageUrl: string;
  tier: string;
  icon: string;
  active: boolean;
}

interface Investment {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  amount: number;
  dailyReturn: number;
  totalReturn: number;
  daysRemaining: number;
  lastPayoutDate: string;
  status: 'active' | 'completed';
  createdAt: any;
}

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Minerador Bronze', price: 30, dailyReturn: 6, durationDays: 60, totalReturn: 360, imageUrl: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=400', tier: 'bronze', icon: 'pickaxe', active: true },
  { id: 'p2', name: 'Minerador Prata', price: 50, dailyReturn: 10, durationDays: 60, totalReturn: 600, imageUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400', tier: 'silver', icon: 'pickaxe', active: true },
  { id: 'p3', name: 'Minerador Ouro', price: 100, dailyReturn: 20, durationDays: 60, totalReturn: 1200, imageUrl: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=400', tier: 'gold', icon: 'gem', active: true },
  { id: 'p4', name: 'Minerador Platina', price: 250, dailyReturn: 50, durationDays: 60, totalReturn: 3000, imageUrl: 'https://images.unsplash.com/photo-1605792657660-596af9009e82?w=400', tier: 'platinum', icon: 'sparkles', active: true },
  { id: 'p5', name: 'Minerador Diamante', price: 500, dailyReturn: 100, durationDays: 60, totalReturn: 6000, imageUrl: 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=400', tier: 'diamond', icon: 'gem', active: true },
  { id: 'p6', name: 'Minerador Esmeralda', price: 1000, dailyReturn: 200, durationDays: 60, totalReturn: 12000, imageUrl: 'https://images.unsplash.com/photo-1622547748225-3fc4abd2cca0?w=400', tier: 'emerald', icon: 'star', active: true },
  { id: 'p7', name: 'Minerador Elite', price: 2500, dailyReturn: 500, durationDays: 60, totalReturn: 30000, imageUrl: 'https://images.unsplash.com/photo-1634704784915-aacf363b021f?w=400', tier: 'elite', icon: 'crown', active: true },
];

export function useProducts() {
  const { user } = useAuth();
  const [products] = useState<Product[]>(PRODUCTS);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setInvestments([]);
      setLoading(false);
      return;
    }

    // Escutar investimentos em tempo real
    const investmentsRef = collection(db, 'users', user.id, 'investments');
    const q = query(investmentsRef, where('status', '==', 'active'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const invs: Investment[] = [];
      snapshot.forEach((doc) => {
        invs.push({ id: doc.id, ...doc.data() } as Investment);
      });
      setInvestments(invs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const purchaseProduct = async (product: Product): Promise<boolean> => {
    if (!user) return false;
    if (user.balance < product.price) return false;

    try {
      const userRef = doc(db, 'users', user.id);

      // Deduzir saldo
      await updateDoc(userRef, {
        balance: increment(-product.price)
      });

      // Criar investimento
      const today = new Date().toISOString().split('T')[0];
      await addDoc(collection(db, 'users', user.id, 'investments'), {
        userId: user.id,
        productId: product.id,
        productName: product.name,
        amount: product.price,
        dailyReturn: product.dailyReturn,
        totalReturn: product.totalReturn,
        daysRemaining: product.durationDays,
        lastPayoutDate: today,
        status: 'active',
        createdAt: serverTimestamp()
      });

      // Processar comissões de afiliados
      await processAffiliateCommissions(user.id, product.price);

      return true;
    } catch (error) {
      console.error('Error purchasing product:', error);
      return false;
    }
  };

  // Processar comissões de afiliados (20%, 5%, 1%)
  const processAffiliateCommissions = async (userId: string, amount: number) => {
    const commissionRates = [
      { level: 1, percentage: 20 },
      { level: 2, percentage: 5 },
      { level: 3, percentage: 1 }
    ];

    let currentUserId = userId;

    for (const { level, percentage } of commissionRates) {
      // Buscar quem convidou
      const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', currentUserId)));
      
      if (userDoc.empty) break;

      const userData = userDoc.docs[0].data();
      const invitedBy = userData.invitedBy;

      if (!invitedBy) break;

      const commission = (amount * percentage) / 100;

      // Adicionar comissão ao saldo do convidador
      const inviterRef = doc(db, 'users', invitedBy);
      await updateDoc(inviterRef, {
        balance: increment(commission),
        totalEarned: increment(commission)
      });

      // Registrar transação de comissão
      await addDoc(collection(db, 'users', invitedBy, 'transactions'), {
        type: 'commission',
        amount: commission,
        level,
        percentage,
        fromUser: userId,
        status: 'completed',
        description: `Comissão nível ${level} - ${percentage}%`,
        createdAt: serverTimestamp()
      });

      currentUserId = invitedBy;
    }
  };

  return {
    products,
    investments,
    loading,
    purchaseProduct
  };
}
