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

    // ✅ Identificação Robusta do ID
    const reference = data.id || data.reference || data.externalId || data.transactionId;
    const statusRecebido = (data.status || data.state || data.statusTransaction || '').toUpperCase();

    if (!reference) {
      console.error("❌ ID de transação não encontrado no corpo do webhook.");
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

    // 1. Busca por evopayId (mais comum)
    const q = await db.collection('deposits').where('evopayId', '==', reference).limit(1).get();
    
    if (!q.empty) {
      depositRef = q.docs[0].ref;
      depositData = q.docs[0].data();
    } else {
      // 2. Busca direta pelo ID do documento
      const docDirect = await db.collection('deposits').doc(reference).get();
      if (docDirect.exists) {
        depositRef = docDirect.ref;
        depositData = docDirect.data();
      }
    }

    if (!depositRef || !depositData) {
      console.error(`❌ Transação ${reference} não existe no Firestore.`);
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

    // 🔥 ATUALIZAÇÃO ATÔMICA
    await db.runTransaction(async (t) => {
      const userRef = db.collection('users').doc(userId);
      const userSnap = await t.get(userRef);

      if (!userSnap.exists) throw new Error("Usuário não encontrado");
      
      // Se já estiver como concluído, para aqui para não duplicar saldo
      if (depositData.status === 'completed') {
        console.log("Transação já processada anteriormente.");
        return;
      }

      const amount = Number(depositData.amount || 0);

      // 1. Atualiza Depósito Principal
      t.update(depositRef, {
        status: 'completed',
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. Atualiza Histórico do Usuário (se existir)
      if (historyRef) {
        t.update(historyRef, { status: 'completed' });
      }

      // 3. Atualiza Saldo e Giros com INCREMENT (Segurança contra erros de soma)
      t.update(userRef, {
        balance: admin.firestore.FieldValue.increment(amount),
        girosRoleta: admin.firestore.FieldValue.increment(1),
        totalDeposited: admin.firestore.FieldValue.increment(amount)
      });

      // 4. Lógica de Afiliados (Nível 1, 2, 3)
      const userData = userSnap.data();
      if (userData.referredBy) {
        const l1Ref = db.collection('users').doc(userData.referredBy);
        const bonusL1 = amount * 0.20;
        
        t.update(l1Ref, {
          balance: admin.firestore.FieldValue.increment(bonusL1),
          girosRoleta: admin.firestore.FieldValue.increment(1),
          totalCommissions: admin.firestore.FieldValue.increment(bonusL1)
        });

        // Log da comissão nível 1
        t.set(l1Ref.collection('transactions').doc(), {
          type: 'commission',
          amount: bonusL1,
          status: 'completed',
          description: `Indicação Nível 1: ${userData.email?.split('@')[0]}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Repetir para Nível 2 e 3 se necessário (Seguindo a mesma lógica de increment)
      }
    });

    console.log("✅ SALDO E HISTÓRICO ATUALIZADOS COM SUCESSO!");
    return { statusCode: 200, body: 'OK' };

  } catch (error) {
    console.error("❌ ERRO NO PROCESSAMENTO:", error.message);
    return { statusCode: 500, body: error.message };
  }
};
