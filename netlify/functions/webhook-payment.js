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

    // ✅ IDENTIFICAÇÃO DO ID (O webhook da EvoPay envia o ID deles no campo 'id')
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
    // 🔥 BUSCA MELHORADA NO FIRESTORE
    // =========================================
    let depositRef;
    let depositData;
    let userId;

    // 1. Tenta busca direta pelo ID do documento
    const depositDoc = await db.collection('deposits').doc(reference).get();

    if (depositDoc.exists) {
      depositRef = depositDoc.ref;
      depositData = depositDoc.data();
      userId = depositData.userId;
    } else {
      // ✅ CORREÇÃO: Busca na coleção 'deposits' pelo novo campo 'evopayId'
      const evopayQuery = await db.collection('deposits')
        .where('evopayId', '==', reference)
        .limit(1)
        .get();

      if (!evopayQuery.empty) {
        depositRef = evopayQuery.docs[0].ref;
        depositData = evopayQuery.docs[0].data();
        userId = depositData.userId;
      } else {
        // Fallback para transactionId (se necessário)
        const transactionQuery = await db.collectionGroup('transactions')
          .where('transactionId', '==', reference)
          .limit(1)
          .get();

        if (transactionQuery.empty) {
          // ✅ CORREÇÃO: Fallback final buscando evopayId em subcoleções
          const fallbackEvopayQuery = await db.collectionGroup('transactions')
            .where('evopayId', '==', reference)
            .limit(1)
            .get();

          if (fallbackEvopayQuery.empty) {
            console.error(`❌ ERRO: Nenhuma transação encontrada com ID: ${reference}`);
            return {
              statusCode: 404,
              body: JSON.stringify({ success: false, error: 'Transação não encontrada.' })
            };
          } else {
            depositRef = fallbackEvopayQuery.docs[0].ref;
            depositData = fallbackEvopayQuery.docs[0].data();
            userId = depositRef.parent.parent.id;
          }
        } else {
          depositRef = transactionQuery.docs[0].ref;
          depositData = transactionQuery.docs[0].data();
          userId = depositRef.parent.parent.id;
        }
      }
    }

    // =========================================
    // 🔥 TRANSAÇÃO FIRESTORE (SEU CÓDIGO ORIGINAL)
    // =========================================
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) throw new Error('Usuário não encontrado.');

      if (
        depositData.status === 'completed' ||
        depositData.status === 'PAID' ||
        depositData.status === 'COMPLETED'
      ) {
        throw new Error('Depósito já processado.');
      }

      const userData = userSnap.data();
      const amount = depositData.amount || 0;

      let level1Ref, level2Ref, level3Ref;
      let level1Data, level2Data, level3Data;

      if (userData.referredBy) {
        level1Ref = db.collection('users').doc(userData.referredBy);
        const level1Snap = await transaction.get(level1Ref);
        if (level1Snap.exists) {
          level1Data = level1Snap.data();
          if (level1Data.referredBy) {
            level2Ref = db.collection('users').doc(level1Data.referredBy);
            const level2Snap = await transaction.get(level2Ref);
            if (level2Snap.exists) {
              level2Data = level2Snap.data();
              if (level2Data.referredBy) {
                level3Ref = db.collection('users').doc(level2Data.referredBy);
                const level3Snap = await transaction.get(level3Ref);
                if (level3Snap.exists) level3Data = level3Snap.data();
              }
            }
          }
        }
      }

      transaction.update(depositRef, {
        status: 'completed',
        description: 'Depósito via PIX (Confirmado + 1 Giro)',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      transaction.update(userRef, {
        balance: (userData.balance || 0) + amount,
        girosRoleta: (userData.girosRoleta || 0) + 1,
        totalDeposited: (userData.totalDeposited || 0) + amount
      });

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

      if (level1Ref && level1Data) {
        const comissaoL1 = amount * 0.20;
        transaction.update(level1Ref, {
          balance: (level1Data.balance || 0) + comissaoL1,
          girosRoleta: (level1Data.girosRoleta || 0) + 1,
          totalCommissions: (level1Data.totalCommissions || 0) + comissaoL1
        });
        registrarHistoricoComissao(level1Ref, comissaoL1, 1, emailPagador);
      }

      if (level2Ref && level2Data) {
        const comissaoL2 = amount * 0.05;
        transaction.update(level2Ref, {
          balance: (level2Data.balance || 0) + comissaoL2,
          totalCommissions: (level2Data.totalCommissions || 0) + comissaoL2
        });
        registrarHistoricoComissao(level2Ref, comissaoL2, 2, emailPagador);
      }

      if (level3Ref && level3Data) {
        const comissaoL3 = amount * 0.01;
        transaction.update(level3Ref, {
          balance: (level3Data.balance || 0) + comissaoL3,
          totalCommissions: (level3Data.totalCommissions || 0) + comissaoL3
        });
        registrarHistoricoComissao(level3Ref, comissaoL3, 3, emailPagador);
      }
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
