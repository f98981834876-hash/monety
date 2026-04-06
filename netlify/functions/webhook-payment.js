const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

exports.handler = async (event) => {
  console.log("--- INICIANDO PROCESSAMENTO WEBHOOK ---");
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    console.log("DADOS RECEBIDOS:", JSON.stringify(data));

    // ✅ Identificação do ID e Status
    const reference = data.id || data.reference || data.externalId || data.transactionId;
    const statusRecebido = (data.status || data.state || data.statusTransaction || '').toUpperCase();

    if (!reference) {
      console.error("❌ ID de transação não encontrado.");
      return { statusCode: 400, body: 'ID faltando' };
    }

    const statusPagos = ['COMPLETED', 'PAID', 'APPROVED', 'SUCCESS', 'PAGO'];

    if (!statusPagos.includes(statusRecebido)) {
      console.log(`Status ${statusRecebido} ignorado.`);
      return { statusCode: 200, body: 'Status não finalizado.' };
    }

    // 🔍 BUSCA DO DEPÓSITO
    let depositRef = null;
    let depositData = null;

    const q = await db.collection('deposits').where('evopayId', '==', reference).limit(1).get();
    
    if (!q.empty) {
      depositRef = q.docs[0].ref;
      depositData = q.docs[0].data();
    } else {
      const docDirect = await db.collection('deposits').doc(reference).get();
      if (docDirect.exists) {
        depositRef = docDirect.ref;
        depositData = docDirect.data();
      }
    }

    if (!depositRef || !depositData) {
      console.error(`❌ Transação ${reference} não encontrada.`);
      return { statusCode: 404, body: 'Transação não encontrada' };
    }

    const userId = depositData.userId;

    // 🔍 BUSCA DO HISTÓRICO (Subcoleção do Usuário)
    let historyRef = null;
    const hQuery = await db.collection('users').doc(userId).collection('transactions')
      .where('evopayId', '==', reference).limit(1).get();
    
    if (!hQuery.empty) {
      historyRef = hQuery.docs[0].ref;
    }

    // 🔥 ATUALIZAÇÃO ATÔMICA (TRANSAÇÃO)
    await db.runTransaction(async (t) => {
      const userRef = db.collection('users').doc(userId);
      const userSnap = await t.get(userRef);

      if (!userSnap.exists) throw new Error("Usuário não encontrado");
      
      if (depositData.status === 'completed') {
        console.log("Transação já processada.");
        return;
      }

      const amount = Number(depositData.amount || 0);
      const userData = userSnap.data();
      const emailPagador = userData.email?.split('@')[0] || 'Usuário';

      // 1. Atualiza Depósito Principal e Histórico
      t.update(depositRef, {
        status: 'completed',
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (historyRef) {
        t.update(historyRef, { status: 'completed' });
      }

      // 2. Atualiza Saldo do Usuário que depositou
      t.update(userRef, {
        balance: admin.firestore.FieldValue.increment(amount),
        girosRoleta: admin.firestore.FieldValue.increment(1),
        totalDeposited: admin.firestore.FieldValue.increment(amount)
      });

      // -----------------------------------------------------------
      // 3. LÓGICA DE AFILIADOS (NÍVEL 1, 2 E 3)
      // -----------------------------------------------------------
      if (userData.referredBy) {
        // --- NÍVEL 1 (20% + 1 Giro) ---
        const l1Ref = db.collection('users').doc(userData.referredBy);
        const l1Snap = await t.get(l1Ref);
        
        if (l1Snap.exists) {
          const bonusL1 = amount * 0.20;
          t.update(l1Ref, {
            balance: admin.firestore.FieldValue.increment(bonusL1),
            girosRoleta: admin.firestore.FieldValue.increment(1),
            totalCommissions: admin.firestore.FieldValue.increment(bonusL1)
          });

          t.set(l1Ref.collection('transactions').doc(), {
            type: 'commission',
            amount: bonusL1,
            status: 'completed',
            description: `Indicação Nível 1: ${emailPagador}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // --- NÍVEL 2 (5%) ---
          const l1Data = l1Snap.data();
          if (l1Data.referredBy) {
            const l2Ref = db.collection('users').doc(l1Data.referredBy);
            const l2Snap = await t.get(l2Ref);

            if (l2Snap.exists) {
              const bonusL2 = amount * 0.05;
              t.update(l2Ref, {
                balance: admin.firestore.FieldValue.increment(bonusL2),
                totalCommissions: admin.firestore.FieldValue.increment(bonusL2)
              });

              t.set(l2Ref.collection('transactions').doc(), {
                type: 'commission',
                amount: bonusL2,
                status: 'completed',
                description: `Indicação Nível 2: ${emailPagador}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });

              // --- NÍVEL 3 (1%) ---
              const l2Data = l2Snap.data();
              if (l2Data.referredBy) {
                const l3Ref = db.collection('users').doc(l2Data.referredBy);
                const l3Snap = await t.get(l3Ref);

                if (l3Snap.exists) {
                  const bonusL3 = amount * 0.01;
                  t.update(l3Ref, {
                    balance: admin.firestore.FieldValue.increment(bonusL3),
                    totalCommissions: admin.firestore.FieldValue.increment(bonusL3)
                  });

                  t.set(l3Ref.collection('transactions').doc(), {
                    type: 'commission',
                    amount: bonusL3,
                    status: 'completed',
                    description: `Indicação Nível 3: ${emailPagador}`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                  });
                }
              }
            }
          }
        }
      }
    });

    console.log("✅ PROCESSAMENTO CONCLUÍDO COM SUCESSO!");
    return { statusCode: 200, body: 'OK' };

  } catch (error) {
    console.error("❌ ERRO NO PROCESSAMENTO:", error.message);
    return { statusCode: 500, body: error.message };
  }
};
