-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id),
  balance DECIMAL(10, 2) DEFAULT 0,
  total_earned DECIMAL(10, 2) DEFAULT 0,
  total_withdrawn DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_earned DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_withdrawn DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Tabela de produtos (retorno diário de 20%)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  daily_return DECIMAL(10, 2) NOT NULL,
  duration_days INTEGER NOT NULL,
  total_return DECIMAL(10, 2) NOT NULL,
  image_url TEXT,
  active BOOLEAN DEFAULT true
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS daily_return DECIMAL(10, 2) NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS total_return DECIMAL(10, 2) NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Tabela de investimentos (60 dias de duração)
CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  amount DECIMAL(10, 2) NOT NULL,
  daily_return DECIMAL(10, 2) NOT NULL,
  total_return DECIMAL(10, 2) NOT NULL,
  days_remaining INTEGER NOT NULL,
  last_payout_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE investments ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS product_id UUID NOT NULL REFERENCES products(id);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS amount DECIMAL(10, 2) NOT NULL;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS daily_return DECIMAL(10, 2) NOT NULL;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS total_return DECIMAL(10, 2) NOT NULL;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS days_remaining INTEGER NOT NULL;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS last_payout_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE investments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Tabela de transações
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status TEXT DEFAULT 'pending',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount DECIMAL(10, 2) NOT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Tabela de check-in
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  reward DECIMAL(10, 2) NOT NULL,
  checkin_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, checkin_date)
);

ALTER TABLE checkins ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS day_number INTEGER NOT NULL;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS reward DECIMAL(10, 2) NOT NULL;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS checkin_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Tabela de giros da roleta
CREATE TABLE IF NOT EXISTS roulette_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prize DECIMAL(10, 2) NOT NULL,
  spin_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS prize DECIMAL(10, 2) NOT NULL;
ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS spin_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Tabela de comissões
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES users(id),
  level INTEGER NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  percentage DECIMAL(5, 2) NOT NULL,
  investment_id UUID REFERENCES investments(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE commissions ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS from_user_id UUID NOT NULL REFERENCES users(id);
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS amount DECIMAL(10, 2) NOT NULL;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS percentage DECIMAL(5, 2) NOT NULL;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS investment_id UUID REFERENCES investments(id);
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Inserir produtos com retorno de 20% e duração de 60 dias
INSERT INTO products (name, price, daily_return, duration_days, total_return, image_url) VALUES
  ('Plano Starter', 30.00, 6.00, 60, 360.00, 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=400'),
  ('Plano Básico', 50.00, 10.00, 60, 600.00, 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400'),
  ('Plano Bronze', 100.00, 20.00, 60, 1200.00, 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=400'),
  ('Plano Prata', 250.00, 50.00, 60, 3000.00, 'https://images.unsplash.com/photo-1605792657660-596af9009e82?w=400'),
  ('Plano Ouro', 500.00, 100.00, 60, 6000.00, 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=400'),
  ('Plano Platina', 1000.00, 200.00, 60, 12000.00, 'https://images.unsplash.com/photo-1622547748225-3fc4abd2cca0?w=400'),
  ('Plano Diamante', 2500.00, 500.00, 60, 30000.00, 'https://images.unsplash.com/photo-1634704784915-aacf363b021f?w=400'),
  ('Plano VIP', 5000.00, 1000.00, 60, 60000.00, 'https://images.unsplash.com/photo-1640340434855-6084b1f4901c?w=400')
ON CONFLICT DO NOTHING;
