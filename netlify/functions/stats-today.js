const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/"/g, '')
    })
  });
}

const db = admin.firestore();

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) throw new Error('Token faltando');

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // 1. Define o início do dia de hoje (00:00:00)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = admin.firestore.Timestamp.fromDate(startOfDay);

    let todayEarnings = 0;

    // --- 2. BUSCAR NA SUBCOLEÇÃO 'transactions' DO USUÁRIO ---
    // É aqui que ficam os ganhos de roleta, check-in, etc.
    const transactionsRef = db.collection('users').doc(userId).collection('transactions');
    const transactionsQuery = await transactionsRef
      .where('createdAt', '>=', startTimestamp)
      .get();

    transactionsQuery.forEach(doc => {
      const data = doc.data();
      const valor = Number(data.amount || data.value || 0);
      
      // Somamos apenas se o valor for positivo (ganho)
      // Se você tiver saques na mesma lista, o valor negativo não entra na soma de "Ganhos"
      if (valor > 0) {
        todayEarnings += valor;
      }
    });

    // --- 3. BUSCAR DEPÓSITOS (OPCIONAL) ---
    // Se você considera o dinheiro que ele DEPOSITOU como "ganho de hoje", mantenha este bloco.
    // Se "Ganhos" for apenas o que ele ganhou no jogo/roleta, pode apagar este bloco.
    const depositsQuery = await db.collection('deposits')
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .where('createdAt', '>=', startTimestamp)
      .get();

    depositsQuery.forEach(doc => {
      todayEarnings += Number(doc.data().amount || 0);
    });

    // --- 4. BUSCAR CONVIDADOS ---
    const invitesQuery = await db.collection('users')
      .where('referredBy', '==', userId)
      .where('createdAt', '>=', startTimestamp)
      .get();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        todayEarnings: todayEarnings,
        newInvites: invitesQuery.size
      })
    };

  } catch (error) {
    console.error("Erro na função:", error);
    return { 
      statusCode: 403, 
      headers, 
      body: JSON.stringify({ error: 'Erro ao buscar dados' }) 
    };
  }
};
