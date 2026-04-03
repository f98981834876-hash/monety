import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Users, Copy, Check, Share2, TrendingUp, Award } from 'lucide-react';
import { toast } from 'sonner';

import { db } from "../firebase/firebase"; 
import { collection, query, where, getDocs } from 'firebase/firestore';

interface TeamMember {
  id: string;
  email: string;
  created_at: string;
  status: string;
}

interface TeamData {
  level1: { count: number; totalEarned: number; members: TeamMember[] };
  level2: { count: number; totalEarned: number; members: TeamMember[] };
  level3: { count: number; totalEarned: number; members: TeamMember[] };
}

export default function TeamPage() {
  const { user } = useAuth();
  
  // Debug para verificar o que o Firebase está enviando
  useEffect(() => {
    if (user) {
      console.log("Dados do usuário vindos do Firebase:", user);
    }
  }, [user]);

  const [teamData, setTeamData] = useState<TeamData>({
    level1: { count: 0, totalEarned: 0, members: [] },
    level2: { count: 0, totalEarned: 0, members: [] },
    level3: { count: 0, totalEarned: 0, members: [] }
  });
  
  const [loading, setLoading] = useState(true);
  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3>(1);
  const [copied, setCopied] = useState(false);

  const inviteLink = `${window.location.origin}/?code=${user?.inviteCode}`;

  // CORREÇÃO: Usar user?.id como dependência para evitar recarregamentos infinitos
  useEffect(() => {
    const userId = user?.id; 
    
    if (userId) {
      fetchRealTeamData(userId);
    } else if (user === null) {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchRealTeamData = async (userId: string) => {
    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
      
      // 1. BUSCAR MEMBROS DA EQUIPE (NÍVEL 1)
      const q1 = query(usersRef, where('referredBy', '==', userId));
      const snap1 = await getDocs(q1);
      
      const l1Docs = snap1.docs.map(d => ({ id: d.id, ...d.data() }));
      const l1Ids = l1Docs.map(d => d.id);

      // 2. BUSCAR MEMBROS DA EQUIPE (NÍVEL 2)
      let l2Docs: any[] = [];
      let l2Ids: string[] = [];
      if (l1Ids.length > 0) {
        const chunks = [];
        for (let i = 0; i < l1Ids.length; i += 30) {
          chunks.push(l1Ids.slice(i, i + 30));
        }
        
        const l2Promises = chunks.map(chunk => 
          getDocs(query(usersRef, where('referredBy', 'in', chunk)))
        );
        const snap2Array = await Promise.all(l2Promises);
        l2Docs = snap2Array.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
        l2Ids = l2Docs.map(d => d.id);
      }

      // 3. BUSCAR MEMBROS DA EQUIPE (NÍVEL 3)
      let l3Docs: any[] = [];
      if (l2Ids.length > 0) {
        const chunks = [];
        for (let i = 0; i < l2Ids.length; i += 30) {
          chunks.push(l2Ids.slice(i, i + 30));
        }
        const l3Promises = chunks.map(chunk => 
          getDocs(query(usersRef, where('referredBy', 'in', chunk)))
        );
        const snap3Array = await Promise.all(l3Promises);
        l3Docs = snap3Array.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      const formatMembers = (docs: any[]): TeamMember[] => {
        return docs.map(d => ({
          id: d.id,
          email: d.email || 'Usuário Oculto',
          status: 'active',
          created_at: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : d.createdAt || new Date().toISOString()
        }));
      };

      setTeamData({
        level1: { count: l1Docs.length, totalEarned: 0, members: formatMembers(l1Docs) },
        level2: { count: l2Docs.length, totalEarned: 0, members: formatMembers(l2Docs) },
        level3: { count: l3Docs.length, totalEarned: 0, members: formatMembers(l3Docs) }
      });

    } catch (err) {
      console.error('Erro ao carregar equipe:', err);
      toast.error('Erro ao carregar os dados da equipe');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (user?.inviteCode) {
      navigator.clipboard.writeText(user.inviteCode);
      setCopied(true);
      toast.success('Código copiado!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Junte-se ao Monety',
        text: `Use meu código de convite: ${user?.inviteCode}`,
        url: inviteLink
      });
    } else {
      navigator.clipboard.writeText(inviteLink);
      toast.success('Link copiado!');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-white">Carregando sua equipe...</p>
      </div>
    );
  }

  const currentLevel = teamData[`level${activeLevel}` as keyof TeamData];
  const totalReferrals = teamData.level1.count + teamData.level2.count + teamData.level3.count;
  
  // VALOR REAL: Puxando diretamente do campo 'totalCommissions' sincronizado pelo AuthContext
  const totalEarnings = user?.totalCommissions || 0;

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Minha Equipe</h1>
        <p className="text-gray-400 text-sm">Convide amigos e ganhe comissões</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-[#22c55e]/20 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-[#22c55e]" />
              </div>
              <span className="text-gray-400 text-sm">Convidados</span>
            </div>
            <p className="text-2xl font-bold text-white">{totalReferrals}</p>
          </CardContent>
        </Card>

        <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a]">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-[#22c55e]/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-[#22c55e]" />
              </div>
              <span className="text-gray-400 text-sm">Comissões</span>
            </div>
            {/* Aqui ele mostra exatamente o que está no Firebase */}
            <p className="text-2xl font-bold text-[#22c55e]">R$ {totalEarnings.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Award className="w-5 h-5 text-[#22c55e]" />
            Níveis de Comissão
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between bg-[#0a0a0a] rounded-xl p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#22c55e]/20 rounded-full flex items-center justify-center">
                <span className="text-[#22c55e] font-bold">1</span>
              </div>
              <div>
                <p className="text-white font-semibold">Nível 1</p>
                <p className="text-gray-500 text-xs">Convites diretos</p>
              </div>
            </div>
            <span className="text-xl font-bold text-[#22c55e]">20%</span>
          </div>

          <div className="flex items-center justify-between bg-[#0a0a0a] rounded-xl p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-500/20 rounded-full flex items-center justify-center">
                <span className="text-gray-400 font-bold">2</span>
              </div>
              <div>
                <p className="text-white font-semibold">Nível 2</p>
                <p className="text-gray-500 text-xs">Convites dos seus convidados</p>
              </div>
            </div>
            <span className="text-xl font-bold text-gray-400">5%</span>
          </div>

          <div className="flex items-center justify-between bg-[#0a0a0a] rounded-xl p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-600/20 rounded-full flex items-center justify-center">
                <span className="text-gray-500 font-bold">3</span>
              </div>
              <div>
                <p className="text-white font-semibold">Nível 3</p>
                <p className="text-gray-500 text-xs">Terceiro nível</p>
              </div>
            </div>
            <span className="text-xl font-bold text-gray-500">1%</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a]">
        <CardHeader>
          <CardTitle className="text-white">Seu Link de Convite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-[#0a0a0a] rounded-xl p-3">
            <p className="text-sm text-gray-400 mb-1">Código:</p>
            <p className="text-[#22c55e] font-bold text-lg">{user?.inviteCode || 'Gerando...'}</p>
          </div>

          <div className="bg-[#0a0a0a] rounded-xl p-3 overflow-hidden">
            <p className="text-sm text-gray-400 mb-1">Link:</p>
            <p className="text-gray-300 text-sm break-all">{inviteLink}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleCopyCode}
              disabled={!user?.inviteCode}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                copied
                  ? 'bg-[#22c55e] hover:bg-[#16a34a] text-white'
                  : 'bg-[#1a1a1a] hover:bg-[#252525] text-white border border-[#2a2a2a]'
              }`}
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              {copied ? 'Copiado!' : 'Copiar'}
            </Button>

            <Button
              onClick={handleShare}
              disabled={!user?.inviteCode}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#22c55e] to-[#16a34a] hover:from-[#16a34a] hover:to-[#22c55e] text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-[#22c55e]/20"
            >
              <Share2 className="w-5 h-5" />
              Compartilhar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#111111]/80 backdrop-blur-sm border-[#1a1a1a]">
        <CardHeader>
          <CardTitle className="text-white">Meus Convidados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[1, 2, 3].map((level) => {
              const levelData = teamData[`level${level}` as keyof TeamData];
              return (
                <button
                  key={level}
                  onClick={() => setActiveLevel(level as 1 | 2 | 3)}
                  className={`py-3 rounded-xl font-semibold text-sm transition-all flex flex-col items-center justify-center ${
                    activeLevel === level
                      ? 'bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white shadow-lg shadow-[#22c55e]/20'
                      : 'bg-[#0a0a0a] text-gray-400 hover:bg-[#1a1a1a] border border-[#1a1a1a]'
                  }`}
                >
                  <span>Nível {level}</span>
                  <span className="text-xs opacity-80 font-normal">
                    {levelData?.count || 0} usuários
                  </span>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden" key={activeLevel}>
            {currentLevel && currentLevel.members.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto animate-slide-up">
                {currentLevel.members.map((member: TeamMember, index: number) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between bg-[#0a0a0a] rounded-xl p-3 border border-[#1a1a1a] hover:border-[#22c55e]/30 transition-all"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#22c55e]/20 rounded-full flex items-center justify-center">
                        <span className="text-[#22c55e] font-bold text-sm">
                          {member.email && member.email !== 'Usuário Oculto' ? member.email[0].toUpperCase() : '?'}
                        </span>
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">{member.email}</p>
                        <p className="text-gray-500 text-xs">
                          ID: {member.id.substring(0, 8)}...
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="bg-[#22c55e]/10 px-3 py-1 rounded-full inline-block">
                        <span className="text-[#22c55e] font-semibold text-sm">
                          {activeLevel === 1 ? '20%' : activeLevel === 2 ? '5%' : '1%'}
                        </span>
                      </div>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(member.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 animate-fade-in">
                <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Nenhum convidado no nível {activeLevel}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
