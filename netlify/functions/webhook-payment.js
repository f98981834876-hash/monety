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
    // Tenta capturar o ID de diferentes campos comuns em webhooks
    const reference = data.reference || data.id || data.externalId;
    const status = (data.status || data.state || '').toUpperCase();

    console.log(`=== PROCESSANDO WEBHOOK: Ref ${reference} - Status ${status} ===`);

    // Lista de status considerados "Pagos"
    const statusPagos = ['PAID', 'COMPLETED', 'APPROVED', 'SUCCESS', 'PAGO'];

    if (!statusPagos.includes(status)) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Status não finalizado ignorado.' }),
      };
    }

    // Busca a transação em todas as sub-coleções 'transactions'
    const transactionQuery = await db.collectionGroup('transactions')
      .where('transactionId', '==', reference)
      .limit(1)
      .get();

    if (transactionQuery.empty) {
      console.error(`ERRO: Transação ${reference} não encontrada.`);
      return { 
        statusCode: 404, 
        body: JSON.stringify({ success: false, error: 'Transação não encontrada.' }) 
      };
    }

    const depositDoc = transactionQuery.docs[0];
    const depositRef = depositDoc.ref; 
    const depositData = depositDoc.data();
    // O ID do usuário é o documento pai da sub-coleção 'transactions'
    const userId = depositRef.parent.parent.id; 

    // --- INÍCIO DA TRANSAÇÃO ATÔMICA ---
    await db.runTransaction(async (transaction) => {
      
      // =========================================================
      // FASE 1: LEITURAS (Nível 0 ao Nível 3)
      // =========================================================
      
      const userRef = db.collection('users').doc(userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) throw new Error('Usuário não encontrado.');
      
      // Evita processamento duplicado
      if (depositData.status === 'completed' || depositData.status === 'PAID') {
        throw new Error('Depósito já processado.');
      }

      const userData = userSnap.data();
      const amount = Number(depositData.amount || 0);
      const emailPagador = userData.email || 'Usuário';
      
      // Containers para os dados dos afiliados
      let affRefs = { l1: null, l2: null, l3: null };
      let affData = { l1: null, l2: null, l3: null };

      // Lógica de encadeamento de indicações
      if (userData.referredBy) {
        affRefs.l1 = db.collection('users').doc(userData.referredBy);
        const s1 = await transaction.get(affRefs.l1);
        
        if (s1.exists) {
          affData.l1 = s1.data();

          if (affData.l1.referredBy) {
            affRefs.l2 = db.collection('users').doc(affData.l1.referredBy);
            const s2 = await transaction.get(affRefs.l2);
            
            if (s2.exists) {
              affData.l2 = s2.data();

              if (affData.l2.referredBy) {
                affRefs.l3 = db.collection('users').doc(affData.l2.referredBy);
                const s3 = await transaction.get(affRefs.l3);
                
                if (s3.exists) {
                  affData.l3 = s3.data();
                }
              }
            }
          }
        }
      }

      // =========================================================
      // FASE 2: GRAVAÇÕES (Updates e Sets)
      // =========================================================
      
      // 1. Finaliza o Depósito do Usuário
      transaction.update(depositRef, { 
        status: 'completed',
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. Atualiza Saldo e Benefícios do Usuário que depositou
      transaction.update(userRef, { 
        balance: admin.firestore.FieldValue.increment(amount),
        girosRoleta: admin.firestore.FieldValue.increment(1),
        totalDeposited: admin.firestore.FieldValue.increment(amount)
      });

      // Função auxiliar para registrar histórico de comissão
      const addCommissionLog = (ref, val, level) => {
        const logRef = ref.collection('transactions').doc();
        transaction.set(logRef, {
          type: 'commission',
          amount: val,
          status: 'completed',
          description: `Comissão Nível ${level}: ${emailPagador.split('@')[0]}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      };

      // 3. Pagamento Nível 1 (20% + 1 Giro)
      if (affRefs.l1 && affData.l1) {
        const bonusL1 = amount * 0.20;
        transaction.update(affRefs.l1, { 
          balance: admin.firestore.FieldValue.increment(bonusL1),
          girosRoleta: admin.firestore.FieldValue.increment(1),
          totalCommissions: admin.firestore.FieldValue.increment(bonusL1)
        });
        addCommissionLog(affRefs.l1, bonusL1, 1);
      }

      // 4. Pagamento Nível 2 (5%)
      if (affRefs.l2 && affData.l2) {
        const bonusL2 = amount * 0.05;
        transaction.update(affRefs.l2, { 
          balance: admin.firestore.FieldValue.increment(bonusL2),
          totalCommissions: admin.firestore.FieldValue.increment(bonusL2)
        });
        addCommissionLog(affRefs.l2, bonusL2, 2);
      }

      // 5. Pagamento Nível 3 (1%)
      if (affRefs.l3 && affData.l3) {
        const bonusL3 = amount * 0.01;
        transaction.update(affRefs.l3, { 
          balance: admin.firestore.FieldValue.increment(bonusL3),
          totalCommissions: admin.firestore.FieldValue.increment(bonusL3)
        });
        addCommissionLog(affRefs.l3, bonusL3, 3);
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Processamento concluído.' }),
    };

  } catch (error) {
    console.error('Erro no processamento do webhook:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
