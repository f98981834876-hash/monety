const admin = require('firebase-admin');

// Inicializa o admin caso ainda não tenha sido inicializado
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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);

    console.log("=== DADOS RECEBIDOS DA EVOPAY ===", JSON.stringify(data, null, 2));

    // ✅ IDENTIFICAÇÃO DO ID
    const reference =
      data.reference ||
      data.externalId ||
      data.metadata?.reference ||
      data.metadata?.externalId ||
      data.transactionId ||
      data.id ||
      data.requestNumber;

    const status =
      data.status ||
      data.state ||
      data.statusTransaction ||
      data.paymentStatus;

    console.log(`Buscando no banco a transação com ID: ${reference} | Status recebido: ${status}`);

    const statusPagos = [
      'COMPLETED',
      'completed',
      'PAID',
      'PAID_OUT',
      'APPROVED',
      'approved',
      'pago'
    ];

    if (!statusPagos.includes(status)) {
      console.log(`Status ${status} ignorado.`);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Status ignorado.' })
      };
    }

    // =========================================
    // 🔥 BUSCA DA TRANSAÇÃO NO FIRESTORE
    // =========================================
    let depositRef;
    let depositData;
    let userId;

    // 1. Tenta busca direta na coleção raiz 'deposits'
    const depositDoc = await db.collection('deposits').doc(reference).get();

    if (depositDoc.exists) {
      depositRef = depositDoc.ref;
      depositData = depositDoc.data();
      userId = depositData.userId;
    } else {
      // 2. Busca na coleção raiz pelo campo 'evopayId'
      const evopayQuery = await db.collection('deposits')
        .where('evopayId', '==', reference)
        .limit(1)
        .get();

      if (!evopayQuery.empty) {
        depositRef = evopayQuery.docs[0].ref;
        depositData = evopayQuery.docs[0].data();
        userId = depositData.userId;
      } else {
        // 3. Fallback: Busca em todas as subcoleções 'transactions'
        const transactionQuery = await db.collectionGroup('transactions')
          .where('evopayId', '==', reference)
          .limit(1)
          .get();

        if (transactionQuery.empty) {
          console.error(`❌ ERRO: Nenhuma transação encontrada com ID: ${reference}`);
          return {
            statusCode: 404,
            body: JSON.stringify({ success: false, error: 'Transação não encontrada.' })
          };
        } else {
          depositRef = transactionQuery.docs[0].ref;
          depositData = transactionQuery.docs[0].data();
          userId = depositRef.parent.parent.id; // Pega o ID do usuário dono da subcoleção
        }
      }
    }

    // =========================================
    // 🔥 NOVO: BUSCA O DOCUMENTO NO HISTÓRICO DO USUÁRIO
    // =========================================
    // Isso garante que o histórico financeiro na tela do usuário também seja atualizado.
    let historyRef = null;
    if (userId) {
      const historyQuery = await db.collection('users').doc(userId).collection('transactions')
        .where('evopayId', '==', reference)
        .limit(1)
        .get();

      if (!historyQuery.empty) {
        historyRef = historyQuery.docs[0].ref;
      } else {
        // Fallback por transactionId caso o evopayId não esteja gravado no histórico
        const historyFallback = await db.collection('users').doc(userId).collection('transactions')
          .where('transactionId', '==', depositData.transactionId || reference)
          .limit(1)
          .get();
        
        if (!historyFallback.empty) {
          historyRef = historyFallback.docs[0].ref;
        }
      }
    }

    // =========================================
    // 🔥 TRANSAÇÃO FIRESTORE (ATUALIZAÇÃO)
    // =========================================
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) throw new Error('Usuário não encontrado.');

      // Evita processamento duplicado
      if (depositData.status === 'completed' || depositData.status === 'PAID') {
        throw new Error('Depósito já processado.');
      }

      const userData = userSnap.data();
      const amount = depositData.amount || 0;

      // 1. Atualiza o depósito principal na coleção 'deposits'
      transaction.update(depositRef, {
        status: 'completed',
        description: 'Depósito via PIX (Confirmado + 1 Giro)',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. ✅ ATUALIZA O HISTÓRICO DO USUÁRIO (O que aparece na ProfilePage)
      if (historyRef && historyRef.path !== depositRef.path) {
        transaction.update(historyRef, {
          status: 'completed',
          description: 'Depósito via PIX (Confirmado + 1 Giro)',
          paidAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // 3. Atualiza Saldo e Giros do Usuário
      transaction.update(userRef, {
        balance: (userData.balance || 0) + amount,
        girosRoleta: (userData.girosRoleta || 0) + 1,
        totalDeposited: (userData.totalDeposited || 0) + amount
      });

      // Lógica de Comissões de Afiliados
      const registrarHistoricoComissao = (afiliadoRef, valorComissao, nivel, emailOrigem) => {
        const novaTransacaoRef = afiliadoRef.collection('transactions').doc();
        const nomeOrigem = emailOrigem ? emailOrigem.split('@')[0] : 'Usuário Oculto';
        transaction.set(novaTransacaoRef, {
          type: 'commission',
          amount: valorComissao,
          status: 'completed',
          description: `Indicação Nível ${nivel}: ${nomeOrigem}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      };

      const emailPagador = userData.email || '';

      // Nível 1 (20%)
      if (userData.referredBy) {
        const l1Ref = db.collection('users').doc(userData.referredBy);
        const l1Snap = await transaction.get(l1Ref);
        if (l1Snap.exists) {
          const l1Data = l1Snap.data();
          const comissaoL1 = amount * 0.20;
          transaction.update(l1Ref, {
            balance: (l1Data.balance || 0) + comissaoL1,
            girosRoleta: (l1Data.girosRoleta || 0) + 1,
            totalCommissions: (l1Data.totalCommissions || 0) + comissaoL1
          });
          registrarHistoricoComissao(l1Ref, comissaoL1, 1, emailPagador);

          // Nível 2 (5%)
          if (l1Data.referredBy) {
            const l2Ref = db.collection('users').doc(l1Data.referredBy);
            const l2Snap = await transaction.get(l2Ref);
            if (l2Snap.exists) {
              const l2Data = l2Snap.data();
              const comissaoL2 = amount * 0.05;
              transaction.update(l2Ref, {
                balance: (l2Data.balance || 0) + comissaoL2,
                totalCommissions: (l2Data.totalCommissions || 0) + comissaoL2
              });
              registrarHistoricoComissao(l2Ref, comissaoL2, 2, emailPagador);

              // Nível 3 (1%)
              if (l2Data.referredBy) {
                const l3Ref = db.collection('users').doc(l2Data.referredBy);
                const l3Snap = await transaction.get(l3Ref);
                if (l3Snap.exists) {
                  const l3Data = l3Snap.data();
                  const comissaoL3 = amount * 0.01;
                  transaction.update(l3Ref, {
                    balance: (l3Data.balance || 0) + comissaoL3,
                    totalCommissions: (l3Data.totalCommissions || 0) + comissaoL3
                  });
                  registrarHistoricoComissao(l3Ref, comissaoL3, 3, emailPagador);
                }
              }
            }
          }
        }
      }
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
