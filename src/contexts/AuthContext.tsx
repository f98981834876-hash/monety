import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';

import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  increment,
  addDoc
} from 'firebase/firestore';

import { auth, db } from '../firebase/firebase';

/* =========================
   INTERFACE USER
========================= */

export interface User {
  id: string;
  name: string;
  email: string;
  balance: number;
  inviteCode: string;
  referredBy?: string | null;
  invitedBy?: string | null;
  totalEarned: number;
  totalWithdrawn: number;
  totalDeposited: number;
  totalCommissions: number;
  girosRoleta: number; // ✅ Padronizado
  role: string;
  createdAt: any;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateBalance: (amount: number) => Promise<void>;
  completeSpin: (prizeAmount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* =========================
   GERAÇÃO DE CONVITE
========================= */

const generateInviteCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const generateUniqueInviteCode = async (): Promise<string> => {
  let code = generateInviteCode();
  const usersRef = collection(db, 'users');

  for (let i = 0; i < 5; i++) {
    const q = query(usersRef, where('inviteCode', '==', code));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return code;
    code = generateInviteCode();
  }

  return code;
};

/* =========================
   PROVIDER
========================= */

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (!firebaseUser) {
        setUser(null);
        setToken(null);
        if (unsubscribeUser) unsubscribeUser();
        return;
      }

      const userDocRef = doc(db, 'users', firebaseUser.uid);

      unsubscribeUser = onSnapshot(userDocRef, async (docSnap) => {
        if (!docSnap.exists()) return;

        const data = docSnap.data();

        if (!data.inviteCode) {
          const newCode = await generateUniqueInviteCode();
          await updateDoc(userDocRef, { inviteCode: newCode });
          return;
        }

        setUser({
          id: firebaseUser.uid,
          name: data.name || '',
          email: firebaseUser.email || '',
          balance: data.balance || 0,
          inviteCode: data.inviteCode,
          totalEarned: data.totalEarned || 0,
          totalWithdrawn: data.totalWithdrawn || 0,
          totalDeposited: data.totalDeposited || 0,
          totalCommissions: data.totalCommissions || 0,
          girosRoleta: data.girosRoleta || 0, // ✅ Bate exatamente com o banco
          role: data.role || 'user',
          referredBy: data.referredBy || data.invitedBy || null,
          invitedBy: data.invitedBy || null,
          createdAt: data.createdAt
        } as User);
      });

      const idToken = await firebaseUser.getIdToken();
      setToken(idToken);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  /* =========================
     REGISTER & AUTH
  ========================= */

  const register = async (
    email: string,
    password: string,
    name: string,
    inviteCodeInput?: string
  ) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    let inviterUid: string | null = null;

    if (inviteCodeInput && inviteCodeInput.trim() !== "") {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('inviteCode', '==', inviteCodeInput.trim().toUpperCase()));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        inviterUid = snapshot.docs[0].id;

        await addDoc(collection(db, 'invites'), {
          createdAt: serverTimestamp(),
          invitedId: uid,
          inviterId: inviterUid,
          level: 1,
          status: "pending"
        });
      }
    }

    const myInviteCode = await generateUniqueInviteCode();

    await setDoc(doc(db, 'users', uid), {
      name,
      email,
      balance: 0,
      inviteCode: myInviteCode,
      referredBy: inviterUid || null,
      invitedBy: inviterUid || null,
      totalEarned: 0,
      totalWithdrawn: 0,
      totalDeposited: 0,
      totalCommissions: 0,
      girosRoleta: 1, // ✅ Um giro inicial
      role: 'user',
      createdAt: serverTimestamp()
    });
  };

  const login = async (email: string, password: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await userCredential.user.getIdToken();
    setToken(idToken);
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setToken(null);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const updateBalance = async (amount: number) => {
    if (!auth.currentUser) return;

    const userRef = doc(db, 'users', auth.currentUser.uid);

    await updateDoc(userRef, {
      balance: increment(amount),
      totalEarned: increment(amount)
    });
  };

  const completeSpin = async (prizeAmount: number) => {
    if (!auth.currentUser) return;

    const uid = auth.currentUser.uid;
    const userRef = doc(db, 'users', uid);

    // ✅ Atualiza o saldo e tira 1 giro
    await updateDoc(userRef, {
      girosRoleta: increment(-1),
      balance: increment(prizeAmount),
      totalEarned: increment(prizeAmount)
    });

    // ✅ Cria o histórico para aparecer na tela de transações
    await addDoc(collection(db, 'users', uid, 'transactions'), {
      type: 'roulette',
      amount: prizeAmount,
      status: 'completed',
      description: 'Prêmio da roleta',
      createdAt: serverTimestamp()
    });
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        logout,
        resetPassword,
        refreshUser,
        updateBalance,
        completeSpin
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
};
