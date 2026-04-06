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
  // 1. LOG DE ENTRADA - Se isso não aparecer, o problema é na EvoPay/URL
  console.log("--- INÍCIO DO PROCESSAMENTO ---");

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    console.log("=== DADOS RECEBIDOS ===", JSON.stringify(data));

    // Identificação da Referência
    const reference = data.reference || data.externalId || data.transactionId || data.id || data.metadata?.reference;
    const statusRaw = data.status || data.state || data.statusTransaction || '';
    const status = statusRaw.toUpperCase();

    console.log(`Buscando Transação: ${reference} | Status: ${status}`);

    const statusPagos = ['COMPLETED', 'PAID', 'PAID_OUT', 'APPROVED', 'PAGO', 'SUCCESS'];

    if (!statusPagos.includes(status)) {
      console.log(`Pagamento ainda não aprovado (Status: ${status}).`);
      return { statusCode: 200, body: 'Aguardando aprovação.' };
    }

    // --- BUSCA DA TRANSAÇÃO ---
    let depositRef;
    let depositData;
    let userId;

    // Busca na coleção global
    const depositDoc = await db.collection('deposits').doc(reference).get();
    if (depositDoc.exists) {
      depositRef = depositDoc.ref;
      depositData = depositDoc.data();
      userId = depositData.userId;
    } else {
      // Busca por campo evopayId
      const q = await db.collection('deposits').where('evopayId', '==', reference).limit(1).get();
      if (!q.empty) {
        depositRef = q.docs[0].ref;
        depositData = q.docs[0].data();
        userId = depositData.userId;
      }
    }

    if (!depositRef) {
      console.error("❌ Depósito não encontrado no banco.");
      return { statusCode: 404, body: 'Depósito não encontrado.' };
    }

    // --- BUSCA DO HISTÓRICO (O QUE APARECE NA TELA DO USUÁRIO) ---
    // Tentamos achar o documento dentro de users/{id}/transactions
    let historyRef = null;
    const historyQuery = await db.collection('users').doc(userId).collection('transactions')
      .where('evopayId', '==', reference).limit(1).get();
    
    if (!historyQuery.empty) {
      historyRef = historyQuery.docs[0].ref;
    }

    // --- INÍCIO DA ATUALIZAÇÃO FINANCEIRA ---
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) throw new Error('Usuário não encontrado.');
      if (depositData.status === 'completed' || depositData.status === 'PAID') {
        return; // Já processado
      }

      const userData = userSnap.data();
      const amount = Number(depositData.amount);

      // 1. Atualiza depósito global
      transaction.update(depositRef, {
        status: 'completed',
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. ATUALIZA O HISTÓRICO (Muda "Pendente" para "Concluído" na tela)
      if (historyRef) {
        transaction.update(historyRef, { status: 'completed' });
      }

      // 3. Atualiza Saldo do Usuário
      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(amount),
        girosRoleta: admin.firestore.FieldValue.increment(1),
        totalDeposited: admin.firestore.FieldValue.increment(amount)
      });

      // --- LÓGICA DE AFILIADOS (NÍVEIS 1, 2 E 3) ---
      const emailPagador = userData.email || 'Usuário';

      // NÍVEL 1
      if (userData.referredBy) {
        const l1Ref = db.collection('users').doc(userData.referredBy);
        const l1Snap = await transaction.get(l1Ref);
        if (l1Snap.exists) {
          const comissaoL1 = amount * 0.20;
          transaction.update(l1Ref, {
            balance: admin.firestore.FieldValue.increment(comissaoL1),
            girosRoleta: admin.firestore.FieldValue.increment(1), // Ganha 1 giro por indicação
            totalCommissions: admin.firestore.FieldValue.increment(comissaoL1)
          });
          // Registro no histórico do afiliado
          transaction.set(l1Ref.collection('transactions').doc(), {
            type: 'commission',
            amount: comissaoL1,
            status: 'completed',
            description: `Indicação Nível 1: ${emailPagador.split('@')[0]}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // NÍVEL 2
          const l1Data = l1Snap.data();
          if (l1Data.referredBy) {
            const l2Ref = db.collection('users').doc(l1Data.referredBy);
            const l2Snap = await transaction.get(l2Ref);
            if (l2Snap.exists) {
              const comissaoL2 = amount * 0.05;
              transaction.update(l2Ref, {
                balance: admin.firestore.FieldValue.increment(comissaoL2),
                totalCommissions: admin.firestore.FieldValue.increment(comissaoL2)
              });
              transaction.set(l2Ref.collection('transactions').doc(), {
                type: 'commission',
                amount: comissaoL2,
                status: 'completed',
                description: `Indicação Nível 2: ${emailPagador.split('@')[0]}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });

              // NÍVEL 3
              const l2Data = l2Snap.data();
              if (l2Data.referredBy) {
                const l3Ref = db.collection('users').doc(l2Data.referredBy);
                const l3Snap = await transaction.get(l3Ref);
                if (l3Snap.exists) {
                  const comissaoL3 = amount * 0.01;
                  transaction.update(l3Ref, {
                    balance: admin.firestore.FieldValue.increment(comissaoL3),
                    totalCommissions: admin.firestore.FieldValue.increment(comissaoL3)
                  });
                  transaction.set(l3Ref.collection('transactions').doc(), {
                    type: 'commission',
                    amount: comissaoL3,
                    status: 'completed',
                    description: `Indicação Nível 3: ${emailPagador.split('@')[0]}`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                  });
                }
              }
            }
          }
        }
      }
    });

    console.log("✅ Sucesso total.");
    return { statusCode: 200, body: 'OK' };

  } catch (error) {
    console.error("❌ ERRO NO WEBHOOK:", error.message);
    return { statusCode: 500, body: error.message };
  }
};
