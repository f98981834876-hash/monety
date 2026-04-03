export interface User {
  id: string;
  email: string;
  balance: number;
  inviteCode: string;
  invitedBy?: string;
  totalEarned: number;
  totalWithdrawn: number;
  lastCheckin?: string;
  checkinDays?: number[];
  createdAt: any;
}

export interface Deposit {
  id: string;
  amount: number;
  pixCode: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: any;
  gatewayId?: string;
}

export interface Withdrawal {
  id: string;
  amount: number;
  pixKey: string;
  pixType: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  createdAt: any;
}

export interface Investment {
  id: string;
  productId: string;
  amount: number;
  dailyReturn: number;
  remainingDays: number;
  startDate: any;
  lastClaimDate: any;
  status: 'active' | 'completed';
}
