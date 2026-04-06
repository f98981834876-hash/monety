// ========================================
// NETLIFY FUNCTION: Criar Solicitação de Saque (Corrigida)
// ========================================

const admin = require('firebase-admin');

// Função para inicializar o Firebase com segurança
function getDb() {
  if (admin.apps.length > 0) {
    return admin.firestore();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Verificação de segurança para logs do Netlify
  if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ ERRO: Variáveis de ambiente do Firebase ausentes no Netlify!");
    return null;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        // O replace é vital para converter as quebras de linha da chave privada
        privateKey: privateKey.replace(/\\n/g, '\n')
      })
    });
    return admin.firestore();
  } catch (error) {
    console.error("❌ ERRO ao inicializar Firebase Admin:", error);
    return null;
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  const db = getDb(); // Inicializa ou recupera a conexão aqui

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

    if (!db) {
      return { 
        statusCode: 500, 
        headers, 
        body: JSON.stringify({ error: 'Conexão com Banco de Dados falhou. Verifique as chaves no Netlify.' }) 
      };
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
    }

    // 2. Cálculo de Saldo e Taxa
    const balance = userDoc.data().balance || 0;
    const taxa = valorSaque * 0.10;
    const valorLiquido = valorSaque - taxa; 

    if (balance < valorSaque) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Saldo insuficiente para este saque.' }) };
    }

    // 3. Processamento via Batch (Seguro)
    const batch = db.batch();

    // Debitar saldo
    batch.update(userRef, {
      balance: admin.firestore.FieldValue.increment(-valorSaque),
      totalWithdrawn: admin.firestore.FieldValue.increment(valorSaque)
    });

    // Criar documento de saque
    const withdrawalRef = userRef.collection('withdrawals').doc();
    batch.set(withdrawalRef, {
      amount: valorSaque,
      fee: taxa,
      netAmount: valorLiquido,
      pixKey: pixKey,
      pixType: pixType,
      ownerName: ownerName || '',
      ownerDocument: ownerDocument || '',
      status: 'processing',
      gateway: 'evopay',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Criar histórico na timeline
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
