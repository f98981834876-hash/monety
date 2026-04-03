// ========================================
// NETLIFY FUNCTION: Criar Solicitação de Saque (Fluxo com Aprovação Admin)
// ========================================
// POST /.netlify/functions/create-withdraw

const admin = require('firebase-admin');

// Inicialização do Firebase
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  try {
    const { userId, amount, pixKey, pixType, ownerName, ownerDocument } = JSON.parse(event.body);

    // 1. Validações Básicas
    if (!userId || !amount || !pixKey || !pixType) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Dados obrigatórios ausentes.' }) };
    }

    const valorSaque = parseFloat(amount);
    if (valorSaque < 35) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'O valor mínimo para saque é R$ 35,00' }) };
    }

    if (!db) throw new Error("Conexão com Banco de Dados falhou.");

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
    }

    // 2. Cálculo de Taxa (Exemplo: 10% de taxa sobre o valor solicitado)
    const balance = userDoc.data().balance || 0;
    const taxa = valorSaque * 0.10;
    const valorLiquido = valorSaque - taxa; 

    // O valor debitado do saldo do usuário é o valor TOTAL que ele pediu
    if (balance < valorSaque) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Saldo insuficiente para este saque.' }) };
    }

    // 3. Processamento via Batch (Garante que tudo aconteça ou nada aconteça)
    const batch = db.batch();

    // Debitar o saldo do usuário imediatamente (o dinheiro fica "retido")
    batch.update(userRef, {
      balance: admin.firestore.FieldValue.increment(-valorSaque),
      totalWithdrawn: admin.firestore.FieldValue.increment(valorSaque)
    });

    // Criar o documento de saque na sub-coleção do usuário
    // IMPORTANTE: Status 'processing' para que o Admin veja no painel
    const withdrawalRef = userRef.collection('withdrawals').doc();
    batch.set(withdrawalRef, {
      amount: valorSaque,
      fee: taxa,
      netAmount: valorLiquido,
      pixKey: pixKey,
      pixType: pixType,
      ownerName: ownerName || '',
      ownerDocument: ownerDocument || '',
      status: 'processing', // Aguardando o admin aprovar
      gateway: 'evopay',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Criar um registro na timeline de transações do usuário
    const transactionRef = userRef.collection('transactions').doc();
    batch.set(transactionRef, {
      type: 'withdrawal',
      amount: valorSaque,
      status: 'processing',
      withdrawalId: withdrawalRef.id,
      description: `Saque solicitado (${pixType})`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Solicitação de saque enviada para análise do admin.',
        withdrawalId: withdrawalRef.id
      })
    };

  } catch (error) {
    console.error('❌ Erro ao criar solicitação de saque:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Falha interna ao processar saque.' })
    };
  }
};
