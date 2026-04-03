const admin = require('firebase-admin');

// Inicializa o admin caso ainda não tenha sido inicializado
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Substitui as quebras de linha na chave privada
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), 
    }),
  });
}

const db = admin.firestore();

exports.handler = async (event) => {
  // Apenas aceita método POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { reference, status } = data;

    console.log(`=== PROCESSANDO WEBHOOK: Ref ${reference} - Status ${status} ===`);

    // Aceita tanto 'PAID' quanto 'completed'
    if (status !== 'PAID' && status !== 'completed') {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Status ignorado.' }),
      };
    }

    // Busca o documento da transação usando collectionGroup (procura em todas as sub-coleções 'transactions')
    const transactionQuery = await db.collectionGroup('transactions')
      .where('transactionId', '==', reference)
      .limit(1)
      .get();

    if (transactionQuery.empty) {
      console.error(`ERRO: Transação com ID ${reference} não encontrada.`);
      return { 
        statusCode: 404, 
        body: JSON.stringify({ success: false, error: 'Transação não encontrada.' }) 
      };
    }

    // Recupera a referência exata do documento e do usuário
    const depositDoc = transactionQuery.docs[0];
    const depositRef = depositDoc.ref; 
    const depositData = depositDoc.data();
    const userId = depositRef.parent.parent.id; 

    // Inicia a transação no Firestore
    await db.runTransaction(async (transaction) => {
      
      // =========================================================
      // FASE 1: APENAS LEITURAS (Todos os GETs devem ficar aqui)
      // =========================================================
      
      const userRef = db.collection('users').doc(userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) {
        throw new Error('Usuário não encontrado.');
      }

      if (depositData.status === 'completed' || depositData.status === 'PAID') {
        throw new Error('Este depósito já foi processado anteriormente.');
      }

      const userData = userSnap.data();
      const amount = depositData.amount || 0;
      
      // Variáveis para armazenar as referências e dados dos afiliados
      let level1Ref, level2Ref, level3Ref;
      let level1Data, level2Data, level3Data;

      // Lê o Nível 1
      if (userData.referredBy) {
        level1Ref = db.collection('users').doc(userData.referredBy);
        const level1Snap = await transaction.get(level1Ref);
        
        if (level1Snap.exists) {
          level1Data = level1Snap.data();

          // Lê o Nível 2
          if (level1Data.referredBy) {
            level2Ref = db.collection('users').doc(level1Data.referredBy);
            const level2Snap = await transaction.get(level2Ref);
            
            if (level2Snap.exists) {
              level2Data = level2Snap.data();

              // Lê o Nível 3
              if (level2Data.referredBy) {
                level3Ref = db.collection('users').doc(level2Data.referredBy);
                const level3Snap = await transaction.get(level3Ref);
                
                if (level3Snap.exists) {
                  level3Data = level3Snap.data();
                }
              }
            }
          }
        }
      }

      // =========================================================
      // FASE 2: APENAS GRAVAÇÕES (Todos os UPDATEs devem ficar aqui)
      // =========================================================
      
      // Atualiza a transação (Status, Descrição customizada e Datas)
      transaction.update(depositRef, { 
        status: 'completed',
        description: 'Depósito via PIX (Confirmado + 1 Giro)',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Atualiza o usuário dono do depósito (Saldo + Giro + Total Depositado)
      transaction.update(userRef, { 
        balance: (userData.balance || 0) + amount,
        girosRoleta: (userData.girosRoleta || 0) + 1,
        totalDeposited: (userData.totalDeposited || 0) + amount
      });

      // Função auxiliar para criar registro no histórico (transactions) dos afiliados
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

      // Atualiza o Nível 1 (20% Comissão + 1 Giro extra + Total de Comissões + Histórico)
      if (level1Ref && level1Data) {
        const comissaoL1 = amount * 0.20;
        transaction.update(level1Ref, { 
          balance: (level1Data.balance || 0) + comissaoL1,
          girosRoleta: (level1Data.girosRoleta || 0) + 1, 
          totalCommissions: (level1Data.totalCommissions || 0) + comissaoL1
        });
        registrarHistoricoComissao(level1Ref, comissaoL1, 1, emailPagador);
      }

      // Atualiza o Nível 2 (5% Comissão + Total de Comissões + Histórico)
      if (level2Ref && level2Data) {
        const comissaoL2 = amount * 0.05;
        transaction.update(level2Ref, { 
          balance: (level2Data.balance || 0) + comissaoL2,
          totalCommissions: (level2Data.totalCommissions || 0) + comissaoL2
        });
        registrarHistoricoComissao(level2Ref, comissaoL2, 2, emailPagador);
      }

      // Atualiza o Nível 3 (1% Comissão + Total de Comissões + Histórico)
      if (level3Ref && level3Data) {
        const comissaoL3 = amount * 0.01;
        transaction.update(level3Ref, { 
          balance: (level3Data.balance || 0) + comissaoL3,
          totalCommissions: (level3Data.totalCommissions || 0) + comissaoL3
        });
        registrarHistoricoComissao(level3Ref, comissaoL3, 3, emailPagador);
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Depósito e comissões processados com sucesso.' }),
    };

  } catch (error) {
    console.error('Erro na transação de webhook:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
