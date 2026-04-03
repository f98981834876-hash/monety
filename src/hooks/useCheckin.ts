import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, increment, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../contexts/AuthContext';

const REWARDS = [1, 2, 3, 5, 8, 13, 20];

export function useCheckin() {
  const { user } = useAuth();
  const [currentDay, setCurrentDay] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchCheckinStatus();
  }, [user]);

  const fetchCheckinStatus = async () => {
    if (!user) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const checkinsRef = collection(db, 'users', user.id, 'checkins');

      // Verificar se já fez check-in hoje
      const todayQuery = query(
        checkinsRef,
        where('checkinDate', '==', today)
      );
      const todaySnapshot = await getDocs(todayQuery);
      setCheckedInToday(!todaySnapshot.empty);

      // Buscar último check-in
      const lastQuery = query(
        checkinsRef,
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const lastSnapshot = await getDocs(lastQuery);

      if (!lastSnapshot.empty) {
        const lastCheckin = lastSnapshot.docs[0].data();
        setCurrentDay(lastCheckin.dayNumber || 0);
      } else {
        setCurrentDay(0);
      }
    } catch (error) {
      console.error('Error fetching checkin status:', error);
    } finally {
      setLoading(false);
    }
  };

  const doCheckin = async (): Promise<{ success: boolean; reward?: number; dayNumber?: number }> => {
    if (!user || checkedInToday) {
      return { success: false };
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const dayNumber = (currentDay % 7) + 1;
      const reward = REWARDS[dayNumber - 1];

      // Registrar check-in
      await addDoc(collection(db, 'users', user.id, 'checkins'), {
        dayNumber,
        reward,
        checkinDate: today,
        createdAt: serverTimestamp()
      });

      // Adicionar recompensa ao saldo
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        balance: increment(reward),
        totalEarned: increment(reward)
      });

      // Registrar transação
      await addDoc(collection(db, 'users', user.id, 'transactions'), {
        type: 'checkin',
        amount: reward,
        status: 'completed',
        description: `Check-in dia ${dayNumber}`,
        createdAt: serverTimestamp()
      });

      setCheckedInToday(true);
      setCurrentDay(dayNumber);

      return { success: true, reward, dayNumber };
    } catch (error) {
      console.error('Error doing checkin:', error);
      return { success: false };
    }
  };

  return {
    currentDay,
    checkedInToday,
    loading,
    doCheckin,
    rewards: REWARDS
  };
}
