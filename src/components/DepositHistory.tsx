import React, { useEffect, useState } from 'react';
import { db, auth } from './firebase'; // Teu config
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';

const DepositHistory = () => {
  const [deposits, setDeposits] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, "deposits"),
      where("userId", "==", auth.currentUser?.uid),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(q, (snapshot) => {
      setDeposits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  return (
    <div style={{ padding: '20px', background: '#121212', color: 'white' }}>
      <h3>Meus Depósitos</h3>
      {deposits.map(dep => (
        <div key={dep.id} style={{ borderBottom: '1px solid #333', padding: '10px 0' }}>
          <p>Valor: R$ {dep.amount.toFixed(2)}</p>
          <p>Status: <span style={{ color: dep.status === 'approved' ? '#00ff00' : '#ffcc00' }}>
            {dep.status === 'approved' ? '✅ Pago' : '⏳ Pendente'}
          </span></p>
          <small>{dep.createdAt?.toDate().toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
};
