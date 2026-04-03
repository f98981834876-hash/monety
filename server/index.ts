import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, isDbReady } from './lib/db.js';

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'monety-secret-key-change-in-production';

app.use(cors({ origin: '*' }));
app.use(express.json());

// Middleware de autenticação
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// Gerar código de convite único
const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'MP';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Registro
app.post('/api/auth/register', async (req, res) => {
  try {
    if (!isDbReady()) {
      return res.status(503).json({ error: 'Banco de dados não configurado' });
    }

    const { email, password, inviteCode } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    let invitedBy = null;
    if (inviteCode) {
      const inviter = await db.query('SELECT id FROM users WHERE invite_code = $1', [inviteCode]);
      if (inviter.rows.length === 0) {
        return res.status(400).json({ error: 'Código de convite inválido' });
      }
      invitedBy = inviter.rows[0].id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userInviteCode = generateInviteCode();

    const result = await db.query(
      'INSERT INTO users (email, password_hash, invite_code, invited_by) VALUES ($1, $2, $3, $4) RETURNING id, email, invite_code',
      [email, passwordHash, userInviteCode, invitedBy]
    );

    res.json({
      message: 'Usuário registrado com sucesso',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('[register] Error:', err);
    res.status(500).json({
      error: 'Erro ao registrar usuário',
      details: err instanceof Error ? err.message : String(err)
    });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!isDbReady()) {
      return res.status(503).json({ error: 'Banco de dados não configurado' });
    }

    const { email, password } = req.body;

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        inviteCode: user.invite_code,
        balance: Number(user.balance),
        totalEarned: Number(user.total_earned)
      }
    });
  } catch (err) {
    console.error('[login] Error:', err);
    res.status(500).json({
      error: 'Erro ao fazer login',
      details: err instanceof Error ? err.message : String(err)
    });
  }
});

// Obter dados do usuário
app.get('/api/user/me', authenticateToken, async (req: any, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, invite_code, balance, total_earned, total_withdrawn, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[user/me] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
  }
});

// Listar produtos
app.get('/api/products', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products WHERE active = true ORDER BY price ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('[products] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// Comprar produto (investir)
app.post('/api/investments', authenticateToken, async (req: any, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user.userId;

    const productResult = await db.query('SELECT * FROM products WHERE id = $1 AND active = true', [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const product = productResult.rows[0];

    const userResult = await db.query('SELECT balance FROM users WHERE id = $1', [userId]);
    const currentBalance = Number(userResult.rows[0].balance);

    if (currentBalance < Number(product.price)) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    await db.query(
      'INSERT INTO investments (user_id, product_id, amount, daily_return, total_return, days_remaining) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, productId, product.price, product.daily_return, product.total_return, product.duration_days]
    );

    await db.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [product.price, userId]);

    await db.query(
      'INSERT INTO transactions (user_id, type, amount, status, description) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'investment', product.price, 'completed', `Investimento em ${product.name}`]
    );

    await processAffiliateCommissions(userId, Number(product.price));

    res.json({ message: 'Investimento realizado com sucesso' });
  } catch (err) {
    console.error('[investments] Error:', err);
    res.status(500).json({ error: 'Erro ao realizar investimento' });
  }
});

// Processar comissões de afiliados (20%, 5%, 1%)
async function processAffiliateCommissions(userId: string, amount: number) {
  const commissionRates = [
    { level: 1, percentage: 20 },
    { level: 2, percentage: 5 },
    { level: 3, percentage: 1 }
  ];

  let currentUserId = userId;

  for (const { level, percentage } of commissionRates) {
    const inviterResult = await db.query('SELECT invited_by FROM users WHERE id = $1', [currentUserId]);
    
    if (inviterResult.rows.length === 0 || !inviterResult.rows[0].invited_by) {
      break;
    }

    const inviterId = inviterResult.rows[0].invited_by;
    const commission = (amount * percentage) / 100;

    await db.query('UPDATE users SET balance = balance + $1, total_earned = total_earned + $1 WHERE id = $2', [commission, inviterId]);

    await db.query(
      'INSERT INTO commissions (user_id, from_user_id, level, amount, percentage) VALUES ($1, $2, $3, $4, $5)',
      [inviterId, userId, level, commission, percentage]
    );

    await db.query(
      'INSERT INTO transactions (user_id, type, amount, status, description) VALUES ($1, $2, $3, $4, $5)',
      [inviterId, 'commission', commission, 'completed', `Comissão nível ${level} - ${percentage}%`]
    );

    currentUserId = inviterId;
  }
}

// Listar investimentos do usuário
app.get('/api/investments', authenticateToken, async (req: any, res) => {
  try {
    const result = await db.query(
      `SELECT i.*, p.name as product_name, p.image_url 
       FROM investments i 
       JOIN products p ON i.product_id = p.id 
       WHERE i.user_id = $1 AND i.status = 'active'
       ORDER BY i.created_at DESC`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[investments] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar investimentos' });
  }
});

// Check-in diário
app.post('/api/checkin', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    const existingCheckin = await db.query(
      'SELECT id FROM checkins WHERE user_id = $1 AND checkin_date = $2',
      [userId, today]
    );

    if (existingCheckin.rows.length > 0) {
      return res.status(400).json({ error: 'Check-in já realizado hoje' });
    }

    const lastCheckin = await db.query(
      'SELECT day_number FROM checkins WHERE user_id = $1 ORDER BY checkin_date DESC LIMIT 1',
      [userId]
    );

    let dayNumber = 1;
    if (lastCheckin.rows.length > 0) {
      dayNumber = lastCheckin.rows[0].day_number % 7 + 1;
    }

    const rewards = [1, 2, 3, 5, 8, 13, 20];
    const reward = rewards[dayNumber - 1];

    await db.query(
      'INSERT INTO checkins (user_id, day_number, reward, checkin_date) VALUES ($1, $2, $3, $4)',
      [userId, dayNumber, reward, today]
    );

    await db.query('UPDATE users SET balance = balance + $1, total_earned = total_earned + $1 WHERE id = $2', [reward, userId]);

    await db.query(
      'INSERT INTO transactions (user_id, type, amount, status, description) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'checkin', reward, 'completed', `Check-in dia ${dayNumber}`]
    );

    res.json({ dayNumber, reward, message: 'Check-in realizado com sucesso' });
  } catch (err) {
    console.error('[checkin] Error:', err);
    res.status(500).json({ error: 'Erro ao realizar check-in' });
  }
});

// Verificar status do check-in
app.get('/api/checkin/status', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    const result = await db.query(
      'SELECT day_number FROM checkins WHERE user_id = $1 ORDER BY checkin_date DESC LIMIT 1',
      [userId]
    );

    const todayCheckin = await db.query(
      'SELECT id FROM checkins WHERE user_id = $1 AND checkin_date = $2',
      [userId, today]
    );

    res.json({
      currentDay: result.rows.length > 0 ? result.rows[0].day_number : 0,
      checkedInToday: todayCheckin.rows.length > 0
    });
  } catch (err) {
    console.error('[checkin/status] Error:', err);
    res.status(500).json({ error: 'Erro ao verificar status do check-in' });
  }
});

// Girar roleta - Probabilidades ajustadas: $1/$5/$10 frequentes, $15/$20 raros, $35/$50/$100 = 0%
app.post('/api/roulette/spin', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    const existingSpin = await db.query(
      'SELECT id FROM roulette_spins WHERE user_id = $1 AND spin_date = $2',
      [userId, today]
    );

    if (existingSpin.rows.length > 0) {
      return res.status(400).json({ error: 'Você já girou a roleta hoje' });
    }

    // Probabilidades conforme solicitado
    const prizes = [
      { value: 1, weight: 40 },    // 40% - R$1 (mais frequente)
      { value: 5, weight: 35 },    // 35% - R$5 (mais frequente)
      { value: 10, weight: 20 },   // 20% - R$10 (moderado)
      { value: 15, weight: 3 },    // 3% - R$15 (muito baixo)
      { value: 20, weight: 2 },    // 2% - R$20 (muito baixo)
      { value: 35, weight: 0 },    // 0% - R$35 (nunca sai)
      { value: 50, weight: 0 },    // 0% - R$50 (nunca sai)
      { value: 100, weight: 0 }    // 0% - R$100 (nunca sai)
    ];

    const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;
    let prize = 1;

    for (const p of prizes) {
      random -= p.weight;
      if (random <= 0) {
        prize = p.value;
        break;
      }
    }

    await db.query(
      'INSERT INTO roulette_spins (user_id, prize, spin_date) VALUES ($1, $2, $3)',
      [userId, prize, today]
    );

    await db.query('UPDATE users SET balance = balance + $1, total_earned = total_earned + $1 WHERE id = $2', [prize, userId]);

    await db.query(
      'INSERT INTO transactions (user_id, type, amount, status, description) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'roulette', prize, 'completed', 'Prêmio da roleta']
    );

    res.json({ prize });
  } catch (err) {
    console.error('[roulette/spin] Error:', err);
    res.status(500).json({ error: 'Erro ao girar roleta' });
  }
});

// Verificar se pode girar roleta
app.get('/api/roulette/status', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    const result = await db.query(
      'SELECT id FROM roulette_spins WHERE user_id = $1 AND spin_date = $2',
      [userId, today]
    );

    res.json({
      canSpin: result.rows.length === 0,
      spinsRemaining: result.rows.length === 0 ? 1 : 0
    });
  } catch (err) {
    console.error('[roulette/status] Error:', err);
    res.status(500).json({ error: 'Erro ao verificar status da roleta' });
  }
});

// Obter estatísticas do dia
app.get('/api/stats/today', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    const earningsResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM transactions 
       WHERE user_id = $1 
       AND DATE(created_at) = $2 
       AND type IN ('commission', 'checkin', 'roulette', 'daily_payout')
       AND status = 'completed'`,
      [userId, today]
    );

    const invitesResult = await db.query(
      `SELECT COUNT(*) as total 
       FROM users 
       WHERE invited_by = $1 
       AND DATE(created_at) = $2`,
      [userId, today]
    );

    res.json({
      todayEarnings: Number(earningsResult.rows[0].total),
      newInvites: Number(invitesResult.rows[0].total)
    });
  } catch (err) {
    console.error('[stats/today] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// Obter equipe (afiliados)
app.get('/api/team', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;

    // Nível 1
    const level1 = await db.query(
      `SELECT u.id, u.email, u.created_at 
       FROM users u 
       WHERE u.invited_by = $1 
       ORDER BY u.created_at DESC`,
      [userId]
    );

    const level1Earnings = await db.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM commissions WHERE user_id = $1 AND level = 1',
      [userId]
    );

    // Nível 2
    const level2Members: string[] = [];
    for (const member of level1.rows) {
      const subMembers = await db.query(
        'SELECT id, email, created_at FROM users WHERE invited_by = $1',
        [member.id]
      );
      level2Members.push(...subMembers.rows);
    }

    const level2Earnings = await db.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM commissions WHERE user_id = $1 AND level = 2',
      [userId]
    );

    // Nível 3
    const level3Members: string[] = [];
    for (const member of level2Members) {
      const subMembers = await db.query(
        'SELECT id, email, created_at FROM users WHERE invited_by = $1',
        [(member as any).id]
      );
      level3Members.push(...subMembers.rows);
    }

    const level3Earnings = await db.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM commissions WHERE user_id = $1 AND level = 3',
      [userId]
    );

    res.json({
      level1: {
        count: level1.rows.length,
        totalEarned: Number(level1Earnings.rows[0].total),
        members: level1.rows
      },
      level2: {
        count: level2Members.length,
        totalEarned: Number(level2Earnings.rows[0].total),
        members: level2Members
      },
      level3: {
        count: level3Members.length,
        totalEarned: Number(level3Earnings.rows[0].total),
        members: level3Members
      }
    });
  } catch (err) {
    console.error('[team] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar equipe' });
  }
});

// Listar transações
app.get('/api/transactions', authenticateToken, async (req: any, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[transactions] Error:', err);
    res.status(500).json({ error: 'Erro ao buscar transações' });
  }
});

// Simular depósito (para testes)
app.post('/api/deposits/simulate', authenticateToken, async (req: any, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.userId;

    if (amount < 30) {
      return res.status(400).json({ error: 'Depósito mínimo é R$ 30,00' });
    }

    await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, userId]);

    await db.query(
      'INSERT INTO transactions (user_id, type, amount, status, description) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'deposit', amount, 'completed', 'Depósito via PIX']
    );

    res.json({ message: 'Depósito realizado com sucesso' });
  } catch (err) {
    console.error('[deposit] Error:', err);
    res.status(500).json({ error: 'Erro ao realizar depósito' });
  }
});

// Solicitar saque - Validação de horário 09h-17h BRT (UTC-3)
app.post('/api/withdrawals', authenticateToken, async (req: any, res) => {
  try {
    const { amount, pixKey, pixMethod } = req.body;
    const userId = req.user.userId;

    // Validar horário de saque (09:00 - 17:00 BRT = UTC-3)
    const now = new Date();
    const brasiliaOffset = -3 * 60; // UTC-3 em minutos
    const localOffset = now.getTimezoneOffset(); // Offset local em minutos
    const brasiliaTime = new Date(now.getTime() + (localOffset + brasiliaOffset) * 60000);
    const hour = brasiliaTime.getHours();

    if (hour < 9 || hour >= 17) {
      return res.status(400).json({ 
        error: 'Saque indisponível',
        message: 'Saques permitidos apenas das 09:00 às 17:00 (horário de Brasília)'
      });
    }

    if (amount < 35) {
      return res.status(400).json({ error: 'Saque mínimo é R$ 35,00' });
    }

    const userResult = await db.query('SELECT balance FROM users WHERE id = $1', [userId]);
    const currentBalance = Number(userResult.rows[0].balance);

    const totalWithFee = amount * 1.1; // Taxa de 10%

    if (currentBalance < totalWithFee) {
      return res.status(400).json({ 
        error: 'Saldo insuficiente', 
        required: totalWithFee.toFixed(2)
      });
    }

    await db.query('UPDATE users SET balance = balance - $1, total_withdrawn = total_withdrawn + $2 WHERE id = $3', 
      [totalWithFee, amount, userId]);

    await db.query(
      'INSERT INTO transactions (user_id, type, amount, status, description) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'withdrawal', amount, 'pending', `Saque via PIX (${pixMethod}: ${pixKey})`]
    );

    res.json({ message: 'Saque solicitado com sucesso' });
  } catch (err) {
    console.error('[withdrawal] Error:', err);
    res.status(500).json({ error: 'Erro ao solicitar saque' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
