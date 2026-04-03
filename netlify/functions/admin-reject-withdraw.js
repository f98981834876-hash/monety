// ========================================
// NETLIFY FUNCTION: Rejeitar Saque (Admin)
// ========================================
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey.replace(/\\n/g, '\n')
      })
    });
  }
}

const db = admin.apps.length ? admin.firestore() : null;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  try {
    // 1. Verificação do Token Admin
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const expectedToken = process.env.ADMIN_SECRET_TOKEN;

    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado' }) };
    }

    const { userId, withdrawId, reason } = JSON.parse(event.body);

    if (!userId || !withdrawId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltam parâmetros' }) };
    }

    const userRef = db.collection('users').doc(userId);
    const withdrawalRef = userRef.collection('withdrawals').doc(withdrawId);

    // 2. Executa uma Transação para garantir consistência nos dados
    await db.runTransaction(async (transaction) => {
      const withdrawalDoc = await transaction.get(withdrawalRef);
      
      if (!withdrawalDoc.exists) throw new Error("Saque não encontrado");
      
      const data = withdrawalDoc.data();
      if (data.status !== 'processing' && data.status !== 'pending') {
        throw new Error(`Status atual (${data.status}) não permite rejeição.`);
      }

      // Devolve o valor Bruto (amount) ao saldo do usuário
      const amountToRefund = parseFloat(data.amount);

      // Atualiza o saque para rejeitado
      transaction.update(withdrawalRef, {
        status: 'rejected',
        rejectReason: reason || 'Rejeitado pelo administrador',
        rejectedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Soma o dinheiro de volta na conta do usuário
      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(amountToRefund)
      });
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Saque rejeitado e valor estornado.' })
    };

  } catch (error) {
    console.error('Erro ao rejeitar:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
