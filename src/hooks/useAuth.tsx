import { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signOut as firebaseSignOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot
} from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { User } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authObject, setAuthObject] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setAuthObject(currentUser);
      
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        
        const unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUser({
              id: currentUser.uid,
              email: currentUser.email || '',
              ...docSnap.data()
            } as User);
          }
          setIsLoading(false);
        }, (error) => {
          console.error("Erro ao buscar dados:", error);
          setIsLoading(false);
        });

        return () => unsubscribeSnapshot();
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  };

  return {
    user,
    isLoading,
    logout
  };
}
