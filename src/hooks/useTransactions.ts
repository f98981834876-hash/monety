import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../contexts/AuthContext';

interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'investment' | 'commission' | 'checkin' | 'roulette';
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  description: string;
  createdAt: any;
}

export function useTransactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    // Escutar transações em tempo real
    const transactionsRef = collection(db, 'users', user.id, 'transactions');
    const q = query(transactionsRef, orderBy('createdAt', 'desc'), limit(50));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs: Transaction[] = [];
      snapshot.forEach((doc) => {
        txs.push({ id: doc.id, ...doc.data() } as Transaction);
      });
      setTransactions(txs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  return {
    transactions,
    loading
  };
}
