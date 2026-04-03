const admin = require('firebase-admin');
const axios = require('axios');

// 1. Inicialização do Firebase (Segura, via Variáveis de Ambiente)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
      })
    });
  } catch (error) {
    console.error("Erro na inicialização do Firebase:", error);
  }
}

const db = admin.firestore();

exports.handler = async (event) => {
  // Configuração de Headers para permitir chamadas do seu Front-end (CORS)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    // 2. Verificação de Segurança (Admin Token)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const expectedToken = process.env.ADMIN_SECRET_TOKEN;

    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado.' }) };
    }

    const { userId, withdrawId } = JSON.parse(event.body);

    // 3. Busca os dados do saque no Firestore
    const withdrawalRef = db.collection('users').doc(userId).collection('withdrawals').doc(withdrawId);
    const withdrawalDoc = await withdrawalRef.get();

    if (!withdrawalDoc.exists) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Saque não encontrado.' }) };
    }

    const withdrawalData = withdrawalDoc.data();
    
    // Evita processar o mesmo saque duas vezes
    if (withdrawalData.status !== 'processing' && withdrawalData.status !== 'pending') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Este saque já foi processado.' }) };
    }

    // 4. Cálculo de Valores (Taxa de 10% da plataforma)
    const valorBruto = parseFloat(withdrawalData.amount);
    const taxaPlataforma = 0.10;
    const valorTaxa = Number((valorBruto * taxaPlataforma).toFixed(2));
    const valorLiquido = Number((valorBruto - valorTaxa).toFixed(2));

    const evopayToken = process.env.EVOPAY_TOKEN ? process.env.EVOPAY_TOKEN.trim() : '';

    // 5. Verificação de Saldo na EvoPay (Obrigatório para evitar erros de gateway)
    console.log('--- VERIFICANDO SALDO NA EVOPAY ---');
    const checkBalance = await axios.get('https://pix.evopay.cash/v1/account/balance', {
      headers: { 'API-Key': evopayToken }
    });
    
    const saldoDisponivel = checkBalance.data.balance;
    console.log(`Saldo atual: R$ ${saldoDisponivel}`);

    if (saldoDisponivel < valorLiquido) {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: `Saldo insuficiente na EvoPay (R$ ${saldoDisponivel}).` }) 
      };
    }

    // 6. Execução do Saque (Cash-out)
    const payloadEvoPay = {
      amount: valorLiquido,
      pixKey: withdrawalData.pixKey,
      pixType: withdrawalData.pixType || 'cpf', // CPF, EMAIL, PHONE ou RANDOM
      description: `Saque Monety ID:${withdrawId}`
    };

    console.log(`Enviando R$ ${valorLiquido} para chave ${withdrawalData.pixKey}...`);

    // ROTA VALIDADA: pix.evopay.cash/v1/withdraw
    const evopayResponse = await axios.post('https://pix.evopay.cash/v1/withdraw', payloadEvoPay, {
      headers: { 
        'API-Key': evopayToken,
        'Content-Type': 'application/json'
      }
    });

    // Pega o ID da transação gerado pela EvoPay
    const gatewayId = evopayResponse.data?.id || evopayResponse.data?.transactionId || 'N/A';

    // 7. Atualização Atômica no Firebase (Batch)
    const batch = db.batch();
    
    // Atualiza o documento do saque
    batch.update(withdrawalRef, {
      status: 'completed',
      gatewayTransactionId: gatewayId,
      netAmount: valorLiquido,
      fee: valorTaxa,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Cria o registro na coleção geral de transações
    const transactionRef = db.collection('users').doc(userId).collection('transactions').doc();
    batch.set(transactionRef, {
      type: 'withdrawal',
      amount: valorBruto,
      netAmount: valorLiquido,
      fee: valorTaxa,
      status: 'completed',
      gatewayId: gatewayId,
      description: `Saque PIX Enviado`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Saque concluído com sucesso!', id: gatewayId })
    };

  } catch (error) {
    console.error('--- ERRO CRÍTICO NO PROCESSO ---');
    const status = error.response?.status || 500;
    const errorData = error.response?.data || {};
    
    // Log detalhado para o console do seu servidor
    console.error(`Status HTTP: ${status}`);
    console.error(`Resposta da API: ${JSON.stringify(errorData)}`);

    return {
      statusCode: status,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: errorData.message || "Erro no servidor da EvoPay ou dados inválidos." 
      })
    };
  }
};
