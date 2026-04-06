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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    
    // 🚨 LOG EXTREMAMENTE IMPORTANTE: Vai aparecer no painel da Netlify
    console.log("=== PAYLOAD RECEBIDO DO GATEWAY ===", JSON.stringify(data, null, 2));

    // Captura o ID da transação independente do nome que o gateway usar
    const txId = data.reference || data.transactionId || data.idTransaction || data.requestNumber || data.id;
    
    // Captura o status da transação
    const txStatus = data.status || data.statusTransaction || data.state;

    console.log(`=== PROCESSANDO WEBHOOK: ID Encontrado: ${txId} - Status: ${txStatus} ===`);

    if (!txId) {
      console.error("ERRO: O Gateway não enviou um ID de transação válido.");
      return { statusCode: 400, body: JSON.stringify({ error: 'ID da transação não encontrado no payload.' }) };
    }

    // Aceita várias variações de "Pago"
    const statusPagos = ['PAID', 'completed', 'PAID_OUT', 'APPROVED', 'pago', 'approved'];
    
    if (!statusPagos.includes(txStatus)) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: `Status '${txStatus}' ignorado (não é pagamento aprovado).` }),
      };
    }

    // Busca a transação no Firestore
    const transactionQuery = await db.collectionGroup('transactions')
      .where('transactionId', '==', txId)
      .limit(1)
      .get();

    if (transactionQuery.empty) {
      console.error(`ERRO: Transação com ID ${txId} não encontrada no banco.`);
      return { statusCode: 404, body: JSON.stringify({ error: 'Transação não encontrada.' }) };
    }

    const depositDoc = transactionQuery.docs[0];
    const depositRef = depositDoc.ref; 
    const depositData = depositDoc.data();
    const userId = depositRef.parent.parent.id; 

    // O resto da sua lógica de comissões (Transaction do Firestore) continua exatamente igual
    await db.runTransaction(async (transaction) => {
      
      const userRef = db.collection('users').doc(userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) throw new Error('Usuário não encontrado.');
      if (depositData.status === 'completed' || depositData.status === 'PAID') {
        throw new Error('Este depósito já foi processado anteriormente.');
      }

      const userData = userSnap.data();
      const amount = depositData.amount || 0;
      
      let level1Ref, level2Ref, level3Ref, level1Data, level2Data, level3Data;

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

      // ATUALIZAÇÕES
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

    return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Depósito processado.' }) };

  } catch (error) {
    console.error('Erro geral no webhook:', error);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: error.message }) };
  }
};
