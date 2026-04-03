// ========================================
// NETLIFY FUNCTION: Criar Pagamento PIX (EvoPay)
// ========================================
const axios = require('axios');
const admin = require('firebase-admin');

// 1. Inicialização segura do Firebase
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
  // Configuração de Headers para CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  try {
    if (!db) throw new Error("Conexão com Banco de Dados falhou.");

    const body = JSON.parse(event.body);
    const { amount, userId, userName, userDocument } = body;

    console.log('=== INICIANDO CRIAÇÃO DE PAGAMENTO EVOPAY ===', { userId, amount });

    // Validações Básicas
    if (!amount || !userId || !userName || !userDocument) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campos obrigatórios: amount, userId, userName, userDocument' }) };
    }

    const cleanDocument = userDocument.replace(/\D/g, "");
    if (cleanDocument.length !== 11 && cleanDocument.length !== 14) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Documento inválido.' }) };
    }
    
    // Validar e formatar valor (Garante que seja um número com max 2 casas decimais)
    const amountFloat = Number(parseFloat(amount).toFixed(2));
    if (amountFloat < 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'O valor mínimo é R$ 1,00' }) };
    }

    let cleanName = (userName || "Cliente").replace(/[^a-zA-Z áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/g, "").trim();
    if (!cleanName) cleanName = "Cliente";

    const evopayToken = process.env.EVOPAY_TOKEN;
    if (!evopayToken) throw new Error("Token EVOPAY_TOKEN não configurado no ambiente da Netlify.");

    // Configuração robusta da URL base para o Webhook na Netlify
    const SITE_URL = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:8888';
    const baseUrl = SITE_URL.endsWith('/') ? SITE_URL.slice(0, -1) : SITE_URL;
    const callbackUrl = `${baseUrl}/.netlify/functions/webhook-payment`;

    // 2. GERAR O ID DO DEPÓSITO ANTECIPADAMENTE
    const depositRef = db.collection('deposits').doc();
    const transactionId = depositRef.id;

    // 3. Preparar o Payload para a EvoPay
    const evoPayPayload = {
      amount: amountFloat,
      callbackUrl: callbackUrl,
      payerName: cleanName,
      payerDocument: cleanDocument,
      reference: transactionId 
    };

    // LOG IMPORTANTE: Verifique isso no painel da Netlify se der erro novamente
    console.log('=== PAYLOAD ENVIADO PARA EVOPAY ===', JSON.stringify(evoPayPayload));

    // 4. Chamada à EvoPay
    const response = await axios.post('https://pix.evopay.cash/v1/pix', evoPayPayload, {
      headers: { 
        'API-Key': evopayToken, 
        'Content-Type': 'application/json' 
      }
    });

    // 5. Extração do Código PIX
    const paymentData = response.data;
    const brCode = 
      paymentData?.qrCodeText || 
      paymentData?.qrcode || 
      paymentData?.qrCode || 
      paymentData?.pixCode || 
      paymentData?.data?.qrcode;

    if (!brCode) {
      console.error("Resposta inesperada da EvoPay:", JSON.stringify(paymentData));
      throw new Error("Código PIX não retornado pela EvoPay.");
    }

    // 6. Link da Imagem QR Code
    const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(brCode)}`;

    // 7. Preparar dados para o Firestore
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Salvar na Coleção Global de Depósitos
    const globalDepositPromise = depositRef.set({
      userId: userId,
      userName: userName, 
      amount: amountFloat,
      pixCode: brCode, 
      qrImage: qrImage, 
      transactionId: transactionId,
      status: 'pending',
      gateway: 'evopay',
      createdAt: timestamp
    });

    // Salvar na Coleção de Histórico do Usuário
    const userTransactionRef = db.collection('users').doc(userId).collection('transactions').doc(transactionId);
    const userTransactionPromise = userTransactionRef.set({
      type: 'deposit',
      amount: amountFloat,
      status: 'pending',
      description: 'Depósito via PIX',
      transactionId: transactionId,
      createdAt: timestamp
    });

    // Executar ambas as gravações ao mesmo tempo para ser mais rápido
    await Promise.all([globalDepositPromise, userTransactionPromise]);

    // 8. Retorno Unificado para o Frontend
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        pixCode: brCode,
        qrImage: qrImage,
        transactionId: transactionId,
        pix_code: brCode,
        qr_image: qrImage 
      })
    };

  } catch (error) {
    // Log melhorado para capturar a resposta exata da EvoPay
    const errorDetails = error.response?.data || error.message;
    console.error("=== ERRO NA CRIAÇÃO DO PIX ===", JSON.stringify(errorDetails));
    
    return {
      statusCode: error.response?.status || 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: error.response?.data?.message || 'Falha ao processar pagamento com a EvoPay',
        details: errorDetails
      })
    };
  }
};
