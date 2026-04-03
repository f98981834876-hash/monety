import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../contexts/AuthContext';

interface TeamMember {
  id: string;
  email: string;
  createdAt: any;
}

interface TeamLevel {
  count: number;
  totalEarned: number;
  members: TeamMember[];
}

interface TeamData {
  level1: TeamLevel;
  level2: TeamLevel;
  level3: TeamLevel;
}

export function useTeam() {
  const { user } = useAuth();
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTeamData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // 1. Buscar TODAS as transações de comissão de uma vez
      const transQuery = query(
        collection(db, 'users', user.id, 'transactions'), 
        where('type', '==', 'commission')
      );
      const transSnap = await getDocs(transQuery);
      
      const earnings = { 1: 0, 2: 0, 3: 0 };
      transSnap.forEach(doc => {
        const data = doc.data();
        const level = data.level || 1; // Fallback se o webhook antigo não gravou
        if (level >= 1 && level <= 3) {
          earnings[level as 1|2|3] += Number(data.amount) || 0;
        }
      });

      // 2. Nível 1: Convidados diretos
      const l1Query = query(collection(db, 'users'), where('referredBy', '==', user.id));
      const l1Snap = await getDocs(l1Query);
      const l1Members = l1Snap.docs.map(doc => ({ id: doc.id, email: doc.data().email, createdAt: doc.data().createdAt } as TeamMember));
      const l1Ids = l1Members.map(m => m.id);

      // 3. Nível 2
      let l2Members: TeamMember[] = [];
      if (l1Ids.length > 0) {
        // Limite do Firestore é de 30 itens na cláusula 'in', dividindo em blocos se necessário.
        // Para simplificar, pegamos os 30 primeiros IDs ativos
        const l2Query = query(collection(db, 'users'), where('referredBy', 'in', l1Ids.slice(0, 30)));
        const l2Snap = await getDocs(l2Query);
        l2Members = l2Snap.docs.map(doc => ({ id: doc.id, email: doc.data().email, createdAt: doc.data().createdAt } as TeamMember));
      }
      const l2Ids = l2Members.map(m => m.id);

      // 4. Nível 3
      let l3Members: TeamMember[] = [];
      if (l2Ids.length > 0) {
        const l3Query = query(collection(db, 'users'), where('referredBy', 'in', l2Ids.slice(0, 30)));
        const l3Snap = await getDocs(l3Query);
        l3Members = l3Snap.docs.map(doc => ({ id: doc.id, email: doc.data().email, createdAt: doc.data().createdAt } as TeamMember));
      }

      setTeamData({
        level1: { count: l1Members.length, totalEarned: earnings[1], members: l1Members },
        level2: { count: l2Members.length, totalEarned: earnings[2], members: l2Members },
        level3: { count: l3Members.length, totalEarned: earnings[3], members: l3Members }
      });

    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, [user]);

  return { teamData, loading, refreshTeam: fetchTeamData };
}
