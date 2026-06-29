import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '@/contexts/ThemeContext'
import {
  LayoutDashboard, Users, Kanban, MessageSquare, Sparkles,
  DollarSign, Check, ArrowRight, Menu, X,
  Zap, Shield, Clock, Star, Sun, Moon, Brain,
  FileText, Repeat, Smartphone, TrendingUp, Bot,
  ChevronRight, BarChart3, CalendarCheck, Wallet,
} from 'lucide-react'

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  navy:  '#1c2f54',
  navyD: '#111f3a',
  navyL: '#243a65',
  gold:  '#d3ae6e',
  goldL: '#e8c98a',
  goldD: '#b8944f',
  cream: '#f1eeec',
  creamD:'#e4e0dd',
}

// ─── DADOS ────────────────────────────────────────────────────────────────────

const features = [
  { icon: LayoutDashboard, title: 'Dashboard em tempo real',   desc: 'KPIs, gráficos e alertas automáticos. Visão 360° do seu negócio em um único painel.' },
  { icon: Kanban,          title: 'CRM com funil visual',      desc: 'Gerencie leads em kanban personalizado. Arraste e solte com integração direta ao WhatsApp.' },
  { icon: TrendingUp,      title: 'Receitas & Despesas',       desc: 'Lançamentos, parcelamento automático, categorias e controle de vencimentos com alertas.' },
  { icon: MessageSquare,   title: 'WhatsApp integrado',        desc: 'Converse com leads e clientes direto no sistema. Disparos em massa com templates.' },
  { icon: Brain,           title: 'Agente IA financeiro',      desc: 'Analisa dados, responde perguntas e automatiza follow-ups e cobranças pelo WhatsApp.' },
  { icon: Users,           title: 'Gestão de equipe',          desc: 'Multi-usuário com permissões granulares. Cada colaborador acessa apenas o necessário.' },
  { icon: FileText,        title: 'Sessões & atendimentos',    desc: 'Registre atendimentos com valor, duração e histórico completo por cliente.' },
  { icon: Repeat,          title: 'Parcelas recorrentes',      desc: 'Gere cobranças parceladas automaticamente com notificações de vencimento.' },
  { icon: Shield,          title: 'Segurança enterprise',      desc: 'Criptografia, backup automático e isolamento total de dados por empresa.' },
]

const testimonials = [
  { text: 'Substituímos planilha, CRM e disparador de WhatsApp por um sistema só. A equipe adotou em dois dias.', name: 'Carlos Mendes',  role: 'Diretor Comercial · Agência Digital', stars: 5 },
  { text: 'O Agente IA detecta quando um lead esfriou e dispara follow-up sozinho. Aumentamos 40% no fechamento.', name: 'Ana Ferreira',   role: 'Gestora de Vendas · Consultoria', stars: 5 },
  { text: 'Controlo receitas, parcelas e clientes sem precisar de contador. Tudo transparente e organizado.', name: 'Roberto Silva',  role: 'Empresário · Clínica Odontológica', stars: 5 },
]

const integrations = [
  { label: 'WhatsApp', color: '#25D366' },
  { label: 'Excel / CSV', color: '#217346' },
  { label: 'Google Calendar', color: '#4285F4' },
  { label: 'Gmail', color: '#EA4335' },
  { label: 'PIX', color: '#32BCAD' },
  { label: 'API REST', color: C.gold },
]

const agentCapabilities = [
  { icon: BarChart3,    title: 'Análise financeira',      desc: 'Responde perguntas sobre receitas, despesas e tendências com base nos seus dados reais.' },
  { icon: MessageSquare, title: 'Follow-ups automáticos', desc: 'Detecta leads sem resposta e dispara mensagens personalizadas no WhatsApp no momento certo.' },
  { icon: Repeat,       title: 'Cobranças inteligentes',  desc: 'Monitora vencimentos e envia alertas ou cobranças automáticas por WhatsApp para clientes.' },
  { icon: CalendarCheck, title: 'Gestão de sessões',      desc: 'Agenda, confirma e lembra atendimentos. Atualiza o CRM após cada sessão encerrada.' },
  { icon: Wallet,       title: 'Relatórios sob demanda',  desc: 'Gera resumos mensais, extratos por cliente ou categoria apenas pedindo em linguagem natural.' },
  { icon: Bot,          title: 'Sempre disponível',       desc: 'Trabalha 24/7 em segundo plano, sem intervenção manual, enquanto você foca no que importa.' },
]

const plans = [
  {
    name: 'Starter',
    price: '97',
    desc: 'Para profissionais autônomos e MEIs.',
    features: [
      '1 usuário',
      'Controle financeiro completo',
      'Parcelas e recorrências',
      'Dashboard e relatórios',
      'Suporte por WhatsApp',
    ],
    cta: 'Começar grátis',
    highlight: false,
  },
  {
    name: 'Profissional',
    price: '197',
    desc: 'Para pequenas empresas com equipe de vendas.',
    features: [
      'Até 5 usuários',
      'Tudo do Starter',
      'CRM com funil visual',
      'WhatsApp integrado',
      'Agente IA básico',
      'Gestão de sessões',
    ],
    cta: 'Experimentar 14 dias',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '397',
    desc: 'Para empresas com múltiplas equipes.',
    features: [
      'Usuários ilimitados',
      'Tudo do Profissional',
      'Agente IA completo',
      'Multi-empresa isolada',
      'API REST dedicada',
      'Onboarding guiado',
    ],
    cta: 'Falar com comercial',
    highlight: false,
  },
]

// ─── MOCKUPS ──────────────────────────────────────────────────────────────────

const DashMockup: React.FC<{ dark?: boolean }> = ({ dark = true }) => {
  const card = dark
    ? 'bg-white/8 border border-white/10'
    : 'bg-white border border-[#e4e0dd]'
  const label = dark ? 'text-white/40' : 'text-[#1c2f54]/40'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: 'Receitas', v: 'R$ 48.200', c: '#4ade80' },
          { l: 'Despesas', v: 'R$ 19.800', c: '#f87171' },
          { l: 'Lucro',    v: 'R$ 28.400', c: C.goldL },
        ].map((m) => (
          <div key={m.l} className={`${card} rounded-xl p-3 text-center`}>
            <div className="text-sm font-bold font-sans" style={{ color: m.c }}>{m.v}</div>
            <div className={`text-[10px] mt-0.5 ${label}`}>{m.l}</div>
          </div>
        ))}
      </div>
      <div className={`${card} rounded-xl p-3`}>
        <div className={`text-[10px] mb-2 font-medium ${label}`}>Receitas por mês</div>
        <div className="flex items-end gap-1 h-14">
          {[35, 60, 45, 78, 65, 88, 72].map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: `linear-gradient(to top, ${C.goldD}, ${C.goldL})` }} />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl p-2.5" style={{ background: 'rgba(211,174,110,0.15)', border: `1px solid rgba(211,174,110,0.25)` }}>
          <div className="text-[10px] font-semibold" style={{ color: C.gold }}>⚡ 3 parcelas vencendo hoje</div>
        </div>
        <div className="flex-1 rounded-xl p-2.5" style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
          <div className="text-[10px] font-semibold text-emerald-400">✓ 7 recebidos hoje</div>
        </div>
      </div>
    </div>
  )
}

const KanbanMockup: React.FC<{ dark?: boolean }> = ({ dark = true }) => {
  const cols = [
    { label: 'Prospecção', count: 4, cards: ['José Alves', 'Maria B.'] },
    { label: 'Proposta',   count: 3, cards: ['Ana Costa'] },
    { label: 'Negociação', count: 3, cards: ['Lucas F.', 'Paula G.'] },
    { label: 'Ganho ✓',   count: 2, cards: ['Bruno H.'] },
  ]
  const card = dark ? 'bg-white/8 border-white/10' : 'bg-white border-[#e4e0dd]'
  const txt  = dark ? 'text-white/70' : 'text-[#1c2f54]/70'
  return (
    <div className="flex gap-2 overflow-hidden">
      {cols.map((col, ci) => (
        <div key={col.label} className="flex-1 min-w-0">
          <div className="rounded-lg px-1.5 py-1 mb-2 flex justify-between items-center" style={{ background: ci === 3 ? 'rgba(211,174,110,0.2)' : 'rgba(255,255,255,0.07)' }}>
            <span className="text-[9px] font-semibold" style={{ color: ci === 3 ? C.gold : dark ? 'rgba(255,255,255,0.5)' : `${C.navy}80` }}>{col.label}</span>
            <span className="text-[9px]" style={{ color: C.gold }}>{col.count}</span>
          </div>
          {col.cards.map((c) => (
            <div key={c} className={`border ${card} rounded-lg p-2 mb-1.5`}>
              <div className={`text-[10px] font-medium ${txt}`}>{c}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const WhatsAppMockup: React.FC = () => (
  <div className="rounded-2xl overflow-hidden shadow-2xl max-w-xs" style={{ background: C.navyD, border: `1px solid rgba(211,174,110,0.2)` }}>
    <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.05)', borderBottom: `1px solid rgba(211,174,110,0.15)` }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${C.gold}20`, border: `1px solid ${C.gold}40` }}>
        <Users size={14} style={{ color: C.gold }} />
      </div>
      <div>
        <div className="text-white text-xs font-semibold font-sans">João Silva</div>
        <div className="text-[10px]" style={{ color: `${C.gold}80` }}>Lead · Proposta enviada</div>
      </div>
      <div className="ml-auto">
        <Smartphone size={14} style={{ color: `${C.gold}50` }} />
      </div>
    </div>
    <div className="p-3 space-y-2 min-h-[150px]" style={{ background: 'rgba(17,31,58,0.8)' }}>
      {[
        { msg: 'Oi João! Tudo bem? Passando para confirmar nossa reunião.', mine: true,  ai: false },
        { msg: 'Sim, confirmado! Pode enviar a proposta antes?',             mine: false, ai: false },
        { msg: '📎 Proposta enviada automaticamente. Lead → "Negociação".',  mine: true,  ai: true },
      ].map((m, i) => (
        <div key={i} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
          <div className="max-w-[85%] rounded-xl px-3 py-1.5 text-[10px] leading-relaxed font-sans" style={
            m.ai
              ? { background: `linear-gradient(135deg, ${C.goldD}40, ${C.gold}30)`, border: `1px solid ${C.gold}40`, color: C.goldL }
              : m.mine
              ? { background: `${C.navyL}`, color: 'white' }
              : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }
          }>
            {m.ai && (
              <div className="flex items-center gap-1 text-[9px] font-semibold mb-0.5" style={{ color: C.gold }}>
                <Sparkles size={8} /> DuoAI
              </div>
            )}
            {m.msg}
          </div>
        </div>
      ))}
    </div>
  </div>
)

const FinanceiroMockup: React.FC<{ dark?: boolean }> = ({ dark = true }) => {
  const rows = [
    { label: 'Mensalidade João Silva', cat: 'Serviços', val: '+R$ 2.500', ok: true,  date: '01/04' },
    { label: 'Aluguel escritório',     cat: 'Fixo',     val: '-R$ 3.200', ok: true,  date: '05/04' },
    { label: 'Google Ads — 2/6',       cat: 'Mktg',     val: '-R$ 800',  ok: false, date: '10/04' },
    { label: 'Contrato Maria Costa',   cat: 'Serviços', val: '+R$ 4.000', ok: null,  date: '15/04' },
  ]
  const card = dark ? 'bg-white/5 border-white/8' : 'bg-white border-[#e4e0dd]'
  const txt  = dark ? 'text-white/70' : 'text-[#1c2f54]/70'
  const sub  = dark ? 'text-white/30' : 'text-[#1c2f54]/30'
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className={`border ${card} rounded-xl px-3 py-2.5 flex items-center gap-3`}>
          <div className="w-2 h-2 rounded-full shrink-0" style={{
            background: r.ok === true ? '#4ade80' : r.ok === false ? C.gold : 'rgba(255,255,255,0.2)'
          }} />
          <div className="flex-1 min-w-0">
            <div className={`text-[11px] font-medium ${txt} truncate font-sans`}>{r.label}</div>
            <div className={`text-[9px] ${sub}`}>{r.cat} · {r.date}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] font-bold font-sans" style={{ color: r.val.startsWith('+') ? '#4ade80' : '#f87171' }}>{r.val}</div>
            <div className="text-[9px]" style={{ color: r.ok === false ? C.gold : sub }}>{r.ok === true ? 'Pago' : r.ok === false ? 'Vencendo' : 'Aguardando'}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── DECORAÇÃO ────────────────────────────────────────────────────────────────

const GoldLine: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`h-px ${className}`} style={{ background: `linear-gradient(90deg, transparent, ${C.gold}60, transparent)` }} />
)

const GoldBadge: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold font-sans tracking-wide" style={{
    background: `${C.gold}15`,
    border: `1px solid ${C.gold}35`,
    color: C.gold,
  }}>
    {icon}
    {text}
  </div>
)

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────

export const LandingPage: React.FC = () => {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const dark = theme === 'dark'

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // ── CTA Buttons ─────────────────────────────────────────────────────────────
  const GoldBtn: React.FC<{ label: string; onClick: () => void; large?: boolean }> = ({ label, onClick, large }) => (
    <button
      onClick={onClick}
      className="relative overflow-hidden inline-flex items-center gap-2 font-semibold font-sans transition-all duration-300 rounded-2xl group"
      style={{
        background: `linear-gradient(135deg, ${C.goldD}, ${C.gold}, ${C.goldL})`,
        color: C.navy,
        padding: large ? '16px 40px' : '12px 28px',
        fontSize: large ? '16px' : '14px',
        boxShadow: `0 4px 24px ${C.gold}35`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 36px ${C.gold}55`
        ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px) scale(1.02)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 24px ${C.gold}35`
        ;(e.currentTarget as HTMLButtonElement).style.transform = ''
      }}
    >
      <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)' }}
      />
      <span className="relative">{label}</span>
      <ArrowRight size={large ? 18 : 15} className="relative" />
    </button>
  )

  const WhatsBtn: React.FC<{ label: string; large?: boolean }> = ({ label, large }) => (
    <a
      href="https://wa.me/5511999999999"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 font-semibold font-sans transition-all duration-300 rounded-2xl"
      style={{
        background: '#25D36620',
        border: '1px solid #25D36640',
        color: '#25D366',
        padding: large ? '16px 32px' : '12px 24px',
        fontSize: large ? '15px' : '14px',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#25D36630' }}
      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#25D36620' }}
    >
      {/* WhatsApp icon */}
      <svg width={large ? 20 : 16} height={large ? 20 : 16} viewBox="0 0 24 24" fill="#25D366">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      {label}
    </a>
  )

  return (
    <div className="min-h-screen overflow-x-hidden font-sans transition-colors duration-300"
      style={{ background: dark ? C.navyD : C.cream, color: dark ? C.cream : C.navy }}
    >

      {/* ── NAVBAR ──────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300" style={
        scrolled
          ? { background: dark ? `${C.navyD}f0` : `${C.cream}f0`, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.gold}20`, boxShadow: `0 2px 20px rgba(0,0,0,0.15)` }
          : { background: 'transparent' }
      }>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <img src="/logo.png" alt="DuoFuturo" className="h-8 w-auto" />

          <div className="hidden md:flex items-center gap-8 text-sm">
            {[
              { label: 'Funcionalidades', href: '#funcionalidades' },
              { label: 'DuoAI',          href: '#duoai' },
              { label: 'Planos',         href: '#planos' },
              { label: 'Depoimentos',    href: '#depoimentos' },
            ].map((l) => (
              <a key={l.href} href={l.href}
                className="font-medium transition-colors duration-200 hover:opacity-100 opacity-70"
                style={{ color: dark ? C.cream : C.navy }}
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={toggleTheme}
              className="p-2 rounded-lg transition-colors"
              style={{ color: dark ? `${C.cream}70` : `${C.navy}70` }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = dark ? `${C.cream}10` : `${C.navy}10` }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={() => navigate('/login')}
              className="font-medium text-sm transition-all duration-200 px-4 py-2 rounded-xl opacity-70 hover:opacity-100"
              style={{ color: dark ? C.cream : C.navy }}
            >
              Entrar
            </button>
            <GoldBtn label="Começar grátis" onClick={() => navigate('/register')} />
          </div>

          <div className="md:hidden flex items-center gap-2">
            <button onClick={toggleTheme} className="p-2" style={{ color: dark ? `${C.cream}70` : `${C.navy}70` }}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-2" style={{ color: dark ? C.cream : C.navy }}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden px-4 py-4 space-y-1" style={{ background: dark ? C.navyD : C.cream, borderTop: `1px solid ${C.gold}20` }}>
            {[
              { label: 'Funcionalidades', href: '#funcionalidades' },
              { label: 'DuoAI',          href: '#duoai' },
              { label: 'Planos',         href: '#planos' },
              { label: 'Depoimentos',    href: '#depoimentos' },
            ].map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm font-medium opacity-70"
                style={{ color: dark ? C.cream : C.navy }}
              >
                {l.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-3" style={{ borderTop: `1px solid ${C.gold}20` }}>
              <button onClick={() => navigate('/login')} className="py-2.5 text-sm font-medium rounded-xl" style={{ border: `1px solid ${C.gold}30`, color: dark ? C.cream : C.navy }}>Entrar</button>
              <GoldBtn label="Começar grátis" onClick={() => navigate('/register')} />
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden" style={{ background: C.navy }}>
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 right-0 w-[600px] h-[600px] rounded-full blur-3xl opacity-30"
            style={{ background: `radial-gradient(circle, ${C.gold}50, transparent)` }} />
          <div className="absolute bottom-0 -left-40 w-[500px] h-[500px] rounded-full blur-3xl opacity-20"
            style={{ background: `radial-gradient(circle, ${C.navyL}ff, transparent)` }} />
          <div className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: `radial-gradient(circle, ${C.cream} 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-20 grid lg:grid-cols-2 gap-16 items-center w-full">
          {/* Left */}
          <div>
            {/* Agent badge */}
            <div className="mb-6 flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold font-sans"
                style={{ background: `linear-gradient(135deg, ${C.goldD}25, ${C.gold}20)`, border: `1px solid ${C.gold}40`, color: C.goldL }}>
                <Bot size={12} />
                DuoAI — Agente de Gestão
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium font-sans"
                style={{ background: '#25D36615', border: '1px solid #25D36635', color: '#25D366' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                WhatsApp ativo
              </div>
            </div>

            <h1 className="font-display font-bold leading-[1.05] tracking-tight mb-6"
              style={{ fontSize: 'clamp(40px, 6vw, 72px)', color: C.cream }}
            >
              Financeiro,{' '}
              <span style={{ color: C.gold }}>CRM</span>{' '}
              e WhatsApp{' '}
              <br className="hidden sm:block" />
              em{' '}
              <span className="italic" style={{ color: C.goldL }}>um só lugar</span>
            </h1>

            <p className="text-lg leading-relaxed mb-4 max-w-[500px] font-sans" style={{ color: `${C.cream}cc` }}>
              Gerencie receitas, despesas, leads e clientes com IA que
              automatiza follow-ups e cobranças pelo WhatsApp — tudo integrado.
            </p>

            {/* Capability tags */}
            <div className="flex flex-wrap gap-2 mb-10">
              {['Coleta dados', 'Atualiza CRM', 'Move leads no funil', 'Dispara WhatsApp', 'Gera relatórios'].map((tag) => (
                <span key={tag} className="text-xs font-medium font-sans px-3 py-1 rounded-full"
                  style={{ background: `${C.cream}08`, border: `1px solid ${C.cream}15`, color: `${C.cream}80` }}>
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <GoldBtn label="Começar gratuitamente" onClick={() => navigate('/register')} large />
              <WhatsBtn label="Falar com comercial" large />
            </div>

            <GoldLine className="mb-6" />

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {['Sem cartão de crédito', 'Cancele quando quiser', 'Suporte em português'].map((t) => (
                <div key={t} className="flex items-center gap-2 text-sm font-sans" style={{ color: `${C.cream}b3` }}>
                  <Check size={13} style={{ color: C.gold }} />
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Right — UI Preview */}
          <div className="hidden lg:block">
            <div className="relative">
              <div className="rounded-3xl p-5 shadow-2xl" style={{
                background: 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${C.gold}20`,
                boxShadow: `0 32px 64px rgba(0,0,0,0.4), 0 0 80px ${C.gold}10`
              }}>
                <div className="flex items-center gap-1.5 mb-4">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                  <span className="ml-3 text-xs font-sans" style={{ color: `${C.cream}30` }}>Dashboard — Abril 2025</span>
                </div>
                <DashMockup dark />
              </div>

              <div className="absolute -bottom-8 -left-10 w-72 rounded-2xl p-4 shadow-2xl" style={{
                background: dark ? C.navyD : C.cream,
                border: `1px solid ${C.gold}25`,
                boxShadow: `0 16px 48px rgba(0,0,0,0.3), 0 0 30px ${C.gold}10`
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <Kanban size={13} style={{ color: C.gold }} />
                  <span className="text-xs font-semibold font-sans" style={{ color: dark ? C.cream : C.navy }}>CRM Kanban</span>
                  <span className="ml-auto text-[10px] rounded-full px-2 py-0.5 font-medium" style={{ background: `${C.gold}20`, color: C.gold }}>12 leads</span>
                </div>
                <KanbanMockup dark={dark} />
              </div>

              <div className="absolute -top-5 -right-5 rounded-2xl px-4 py-2.5 shadow-xl text-xs font-semibold font-sans flex items-center gap-2"
                style={{ background: `linear-gradient(135deg, ${C.goldD}, ${C.gold})`, color: C.navy, boxShadow: `0 8px 24px ${C.gold}40` }}
              >
                <Bot size={14} />
                DuoAI ativo
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
          style={{ background: `linear-gradient(to bottom, transparent, ${dark ? C.navyD : C.cream})` }} />
      </section>

      {/* ── INTEGRAÇÕES ──────────────────────────────────────────────────────── */}
      <section className="py-10 relative" style={{ background: dark ? C.navyD : C.creamD }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-widest mb-6 font-sans" style={{ color: `${dark ? C.cream : C.navy}50` }}>
            Integra nativamente com as ferramentas que você já usa
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {integrations.map((int) => (
              <div key={int.label} className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium font-sans transition-all duration-200"
                style={{
                  background: dark ? `${int.color}12` : `${int.color}10`,
                  border: `1px solid ${int.color}30`,
                  color: int.color,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: int.color }} />
                {int.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────────────────────────────────── */}
      <section className="py-16 relative" style={{ background: dark ? C.navyD : C.creamD }}>
        <GoldLine />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { v: '10x', l: 'mais rápido que planilhas' },
              { v: '100%', l: 'seus dados, sempre seguros' },
              { v: '24/7', l: 'disponibilidade garantida' },
              { v: '3 em 1', l: 'financeiro + CRM + WhatsApp' },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-4xl sm:text-5xl font-bold font-display mb-2" style={{ color: C.gold }}>{s.v}</div>
                <div className="text-sm font-sans" style={{ color: dark ? `${C.cream}99` : `${C.navy}80` }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <GoldLine />
      </section>

      {/* ── DUOAI — AGENTE ────────────────────────────────────────────────────── */}
      <section id="duoai" className="py-24 relative overflow-hidden" style={{ background: C.navyD }}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-3xl opacity-15"
            style={{ background: `radial-gradient(circle, ${C.gold}60, transparent)` }} />
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: `radial-gradient(circle, ${C.cream} 1px, transparent 1px)`, backgroundSize: '32px 32px' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <div className="mb-5">
              <div className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold font-sans"
                style={{ background: `linear-gradient(135deg, ${C.goldD}30, ${C.gold}20)`, border: `1px solid ${C.gold}40`, color: C.goldL }}>
                <Bot size={14} />
                DuoAI — Seu Agente de Gestão
              </div>
            </div>
            <h2 className="font-display font-bold tracking-tight mb-5 leading-tight"
              style={{ fontSize: 'clamp(30px, 4vw, 52px)', color: C.cream }}
            >
              O agente que{' '}
              <span className="italic" style={{ color: C.gold }}>trabalha por você</span>
            </h2>
            <p className="text-lg max-w-2xl mx-auto font-sans leading-relaxed" style={{ color: `${C.cream}cc` }}>
              O DuoAI coleta dados, atualiza contatos, move leads no funil, dispara mensagens
              no WhatsApp e gera relatórios — tudo de forma autônoma, 24 horas por dia.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-14">
            {agentCapabilities.map((cap) => (
              <div key={cap.title}
                className="rounded-2xl p-6 transition-all duration-300"
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.gold}15` }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${C.gold}45`; el.style.background = 'rgba(255,255,255,0.07)'; el.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${C.gold}15`; el.style.background = 'rgba(255,255,255,0.04)'; el.style.transform = '' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `linear-gradient(135deg, ${C.goldD}30, ${C.gold}35)`, border: `1px solid ${C.gold}30` }}>
                    <cap.icon size={16} style={{ color: C.gold }} />
                  </div>
                  <h3 className="font-semibold font-sans text-sm" style={{ color: C.cream }}>{cap.title}</h3>
                </div>
                <p className="text-sm leading-relaxed font-sans" style={{ color: `${C.cream}b3` }}>{cap.desc}</p>
              </div>
            ))}
          </div>

          {/* Terminal-style capabilities preview */}
          <div className="max-w-3xl mx-auto rounded-3xl p-6 sm:p-8" style={{
            background: 'rgba(0,0,0,0.4)',
            border: `1px solid ${C.gold}20`,
            backdropFilter: 'blur(20px)',
          }}>
            <div className="flex items-center gap-1.5 mb-5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
              <span className="ml-4 text-xs font-mono" style={{ color: `${C.cream}30` }}>DuoAI Terminal — ao vivo</span>
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-sans" style={{ color: '#25D366' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" /> Rodando
              </span>
            </div>
            <div className="space-y-3 font-mono text-sm">
              {[
                { time: '09:14', event: 'Lead "Carlos Lima" sem resposta há 3 dias → enviando follow-up via WhatsApp', status: 'done' },
                { time: '09:15', event: 'Parcela de R$ 2.800 vencendo amanhã → cobrança automática enviada para João Silva', status: 'done' },
                { time: '11:02', event: 'Lead respondeu → CRM atualizado → card movido para "Negociação"', status: 'done' },
                { time: '14:30', event: 'Relatório mensal gerado → R$ 48.200 de receita · 83% taxa de recebimento', status: 'processing' },
              ].map((log, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="shrink-0 text-[11px]" style={{ color: `${C.cream}30` }}>{log.time}</span>
                  <span className="shrink-0 text-[10px] rounded px-1.5 py-0.5" style={
                    log.status === 'done'
                      ? { background: '#4ade8015', color: '#4ade80', border: '1px solid #4ade8030' }
                      : { background: `${C.gold}15`, color: C.goldL, border: `1px solid ${C.gold}30` }
                  }>{log.status === 'done' ? '✓' : '...'}</span>
                  <span className="text-[13px] leading-relaxed" style={{ color: `${C.cream}cc` }}>{log.event}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center mt-10">
            <GoldBtn label="Ativar o DuoAI" onClick={() => navigate('/register')} large />
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ─────────────────────────────────────────────────────── */}
      <section id="funcionalidades" className="py-24" style={{ background: dark ? C.navy : C.cream }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <div className="mb-5">
              <GoldBadge icon={<Zap size={11} />} text="Funcionalidades" />
            </div>
            <h2 className="font-display font-bold tracking-tight mb-5"
              style={{ fontSize: 'clamp(32px, 4vw, 52px)', color: dark ? C.cream : C.navy }}
            >
              Tudo que seu negócio precisa
            </h2>
            <p className="text-lg max-w-xl mx-auto font-sans" style={{ color: dark ? `${C.cream}b3` : `${C.navy}80` }}>
              Um sistema integrado que elimina múltiplas ferramentas.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl p-7 transition-all duration-300 cursor-default"
                style={{
                  background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                  border: `1px solid ${C.gold}15`,
                  backdropFilter: 'blur(10px)',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = `${C.gold}45`
                  el.style.background = dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.95)'
                  el.style.transform = 'translateY(-3px)'
                  el.style.boxShadow = `0 16px 48px rgba(0,0,0,0.15), 0 0 30px ${C.gold}10`
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = `${C.gold}15`
                  el.style.background = dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)'
                  el.style.transform = ''
                  el.style.boxShadow = ''
                }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: `linear-gradient(135deg, ${C.goldD}30, ${C.gold}40)`, border: `1px solid ${C.gold}30` }}
                >
                  <f.icon size={18} style={{ color: C.gold }} />
                </div>
                <h3 className="font-semibold mb-2 font-sans" style={{ color: dark ? C.cream : C.navy, fontSize: '15px' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed font-sans" style={{ color: dark ? `${C.cream}b3` : `${C.navy}80` }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CRM SECTION (dark) ────────────────────────────────────────────────── */}
      <section className="py-24 relative overflow-hidden" style={{ background: C.navyD }}>
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${C.gold}60, transparent)` }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="mb-6"><GoldBadge icon={<Kanban size={11} />} text="CRM Visual" /></div>
              <h2 className="font-display font-bold tracking-tight mb-5 leading-tight"
                style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', color: C.cream }}
              >
                Funil de vendas que você{' '}
                <span className="italic" style={{ color: C.gold }}>realmente usa</span>
              </h2>
              <p className="text-lg leading-relaxed mb-8 max-w-md font-sans" style={{ color: `${C.cream}cc` }}>
                Organize leads em colunas personalizadas, acompanhe cada negociação
                e dispare mensagens WhatsApp direto do funil — sem trocar de aba.
              </p>
              <ul className="space-y-3.5 mb-10">
                {[
                  'Funis e etapas totalmente personalizáveis',
                  'Importação de leads via Excel em massa',
                  'Tarefas, anotações e follow-ups por lead',
                  'Disparo de mensagens WhatsApp em massa',
                  'Dashboard com métricas de conversão em tempo real',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] font-sans" style={{ color: `${C.cream}cc` }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `${C.gold}20`, border: `1px solid ${C.gold}40` }}
                    >
                      <Check size={11} style={{ color: C.gold }} />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <GoldBtn label="Experimentar o CRM" onClick={() => navigate('/register')} />
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl blur-2xl opacity-20"
                style={{ background: `radial-gradient(circle, ${C.gold}80, transparent)` }} />
              <div className="relative rounded-3xl p-6 shadow-2xl" style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.gold}20`,
                backdropFilter: 'blur(20px)',
              }}>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-sm font-semibold font-sans" style={{ color: C.cream }}>Funil de Vendas</div>
                    <div className="text-xs font-sans" style={{ color: `${C.cream}60` }}>Abril 2025</div>
                  </div>
                  <span className="text-xs rounded-full px-3 py-1 font-medium font-sans" style={{ background: `${C.gold}20`, color: C.gold }}>12 leads ativos</span>
                </div>
                <KanbanMockup dark />
                <div className="mt-5 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: `${C.gold}15`, border: `1px solid ${C.gold}25` }}>
                  <span className="text-sm font-semibold font-sans" style={{ color: C.goldL }}>Volume em negociação</span>
                  <span className="text-sm font-bold font-sans" style={{ color: C.gold }}>R$ 87.400</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHATSAPP + IA SECTION ─────────────────────────────────────────────── */}
      <section className="py-24 overflow-hidden" style={{ background: dark ? C.navy : C.cream }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1 flex justify-center">
              <div className="relative">
                <WhatsAppMockup />
                <div className="absolute -top-5 -right-5 rounded-2xl px-4 py-2.5 shadow-xl text-xs font-semibold font-sans flex items-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${C.goldD}, ${C.gold})`, color: C.navy, boxShadow: `0 8px 24px ${C.gold}40` }}>
                  <Bot size={13} /> DuoAI respondendo
                </div>
                <div className="absolute -bottom-5 -left-5 rounded-2xl px-4 py-2.5 shadow-xl text-xs font-semibold font-sans"
                  style={{ background: '#4ade8020', border: '1px solid #4ade8040', color: '#4ade80' }}>
                  3 leads aquecidos hoje
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <div className="mb-6"><GoldBadge icon={<Brain size={11} />} text="WhatsApp + DuoAI" /></div>
              <h2 className="font-display font-bold tracking-tight mb-5 leading-tight"
                style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', color: dark ? C.cream : C.navy }}
              >
                IA que vende{' '}
                <span className="italic" style={{ color: C.gold }}>enquanto você dorme</span>
              </h2>
              <p className="text-lg leading-relaxed mb-8 max-w-md font-sans" style={{ color: dark ? `${C.cream}cc` : `${C.navy}80` }}>
                O DuoAI monitora seus leads, detecta quando esfriaram e dispara
                follow-ups personalizados pelo WhatsApp automaticamente.
              </p>
              <ul className="space-y-3.5 mb-10">
                {[
                  'Detecção automática de leads sem resposta',
                  'Follow-ups personalizados com IA generativa',
                  'Histórico completo de conversas no CRM',
                  'Disparo em massa com templates aprovados',
                  'Relatório de engajamento por campanha',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] font-sans" style={{ color: dark ? `${C.cream}cc` : `${C.navy}80` }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `${C.gold}20`, border: `1px solid ${C.gold}40` }}>
                      <Check size={11} style={{ color: C.gold }} />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <GoldBtn label="Ativar o DuoAI" onClick={() => navigate('/register')} />
            </div>
          </div>
        </div>
      </section>

      {/* ── FINANCEIRO SECTION (dark) ─────────────────────────────────────────── */}
      <section className="py-24 relative overflow-hidden" style={{ background: C.navy }}>
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-15 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${C.gold}80, transparent)` }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="mb-6"><GoldBadge icon={<DollarSign size={11} />} text="Financeiro Completo" /></div>
              <h2 className="font-display font-bold tracking-tight mb-5 leading-tight"
                style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', color: C.cream }}
              >
                Controle financeiro{' '}
                <span className="italic" style={{ color: C.gold }}>sem complicação</span>
              </h2>
              <p className="text-lg leading-relaxed mb-8 max-w-md font-sans" style={{ color: `${C.cream}cc` }}>
                Lançamentos com parcelamento automático, categorias personalizadas,
                alertas de vencimento e relatórios em tempo real.
              </p>
              <ul className="space-y-3.5 mb-10">
                {[
                  'Receitas e despesas com parcelamento automático',
                  'Categorias e subcategorias personalizáveis',
                  'Alertas de vencimento por e-mail e WhatsApp',
                  'Relatórios mensais e anuais detalhados',
                  'Extrato por cliente ou por categoria',
                  'Multi-empresa com dados totalmente isolados',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] font-sans" style={{ color: `${C.cream}cc` }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `${C.gold}20`, border: `1px solid ${C.gold}40` }}>
                      <Check size={11} style={{ color: C.gold }} />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <GoldBtn label="Ver controle financeiro" onClick={() => navigate('/register')} />
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl blur-2xl opacity-15"
                style={{ background: `radial-gradient(circle, ${C.gold}80, transparent)` }} />
              <div className="relative rounded-3xl p-6 shadow-2xl" style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.gold}20`,
                backdropFilter: 'blur(20px)',
              }}>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-sm font-semibold font-sans" style={{ color: C.cream }}>Lançamentos recentes</div>
                    <div className="text-xs font-sans" style={{ color: `${C.cream}60` }}>Abril 2025</div>
                  </div>
                  <span className="text-xs rounded-full px-3 py-1 font-medium font-sans" style={{ background: '#4ade8015', color: '#4ade80', border: '1px solid #4ade8030' }}>+R$ 5.700 líquido</span>
                </div>
                <FinanceiroMockup dark />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ─────────────────────────────────────────────────────── */}
      <section id="como-funciona" className="py-24" style={{ background: dark ? C.navyD : C.creamD }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <div className="mb-5"><GoldBadge icon={<Clock size={11} />} text="Configuração rápida" /></div>
            <h2 className="font-display font-bold tracking-tight mb-5"
              style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', color: dark ? C.cream : C.navy }}
            >
              Pronto em menos de{' '}
              <span className="italic" style={{ color: C.gold }}>10 minutos</span>
            </h2>
            <p className="text-lg font-sans" style={{ color: dark ? `${C.cream}cc` : `${C.navy}80` }}>
              Sem instalação, sem cartão de crédito. Basta criar a conta e começar.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { num: '01', title: 'Crie sua conta', desc: 'Cadastro simples com e-mail e senha. Nenhum dado de cartão necessário para começar.' },
              { num: '02', title: 'Configure seu negócio', desc: 'Importe clientes via Excel, defina categorias financeiras e conecte seu WhatsApp.' },
              { num: '03', title: 'Gerencie e cresça', desc: 'Acompanhe resultados, automatize cobranças e feche mais negócios com o DuoAI.' },
            ].map((s, i) => (
              <div key={s.num} className="relative rounded-3xl p-8" style={{
                background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                border: `1px solid ${C.gold}20`,
              }}>
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 -right-3 z-10" style={{ color: `${C.gold}40`, fontSize: '24px' }}>→</div>
                )}
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold font-display mb-6"
                  style={{ background: `linear-gradient(135deg, ${C.goldD}30, ${C.gold}40)`, border: `1px solid ${C.gold}40`, color: C.gold }}>
                  {s.num}
                </div>
                <h3 className="text-lg font-bold font-sans mb-3" style={{ color: dark ? C.cream : C.navy }}>{s.title}</h3>
                <p className="text-sm leading-relaxed font-sans" style={{ color: dark ? `${C.cream}cc` : `${C.navy}80` }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEPOIMENTOS ───────────────────────────────────────────────────────── */}
      <section id="depoimentos" className="py-24" style={{ background: C.navy }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <div className="mb-5"><GoldBadge icon={<Star size={11} />} text="Depoimentos" /></div>
            <h2 className="font-display font-bold tracking-tight" style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', color: C.cream }}>
              Quem usa,{' '}
              <span className="italic" style={{ color: C.gold }}>recomenda</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-3xl p-8 transition-all duration-300" style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.gold}15`,
                backdropFilter: 'blur(10px)',
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${C.gold}40`; el.style.transform = 'translateY(-3px)' }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${C.gold}15`; el.style.transform = '' }}
              >
                <div className="flex gap-0.5 mb-6">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} size={16} fill={C.gold} style={{ color: C.gold }} />
                  ))}
                </div>
                <p className="leading-relaxed mb-8 text-[15px] font-sans" style={{ color: `${C.cream}cc` }}>
                  "{t.text}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold font-sans" style={{ background: `linear-gradient(135deg, ${C.goldD}, ${C.gold})`, color: C.navy }}>
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold font-sans" style={{ color: C.cream }}>{t.name}</div>
                    <div className="text-xs font-sans" style={{ color: `${C.cream}80` }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANOS ────────────────────────────────────────────────────────────── */}
      <section id="planos" className="py-24" style={{ background: dark ? C.navyD : C.creamD }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <div className="mb-5"><GoldBadge icon={<Wallet size={11} />} text="Planos e preços" /></div>
            <h2 className="font-display font-bold tracking-tight mb-5"
              style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', color: dark ? C.cream : C.navy }}
            >
              Simples, transparente,{' '}
              <span className="italic" style={{ color: C.gold }}>sem surpresas</span>
            </h2>
            <p className="text-lg font-sans" style={{ color: dark ? `${C.cream}b3` : `${C.navy}80` }}>
              14 dias de teste gratuito em todos os planos. Cancele quando quiser.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-start">
            {plans.map((plan) => (
              <div key={plan.name} className="relative rounded-3xl p-8 transition-all duration-300"
                style={{
                  background: plan.highlight
                    ? `linear-gradient(135deg, ${C.navyL}, ${C.navy})`
                    : dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                  border: plan.highlight ? `2px solid ${C.gold}60` : `1px solid ${C.gold}20`,
                  boxShadow: plan.highlight ? `0 24px 48px rgba(0,0,0,0.3), 0 0 40px ${C.gold}15` : undefined,
                }}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="rounded-full px-4 py-1.5 text-xs font-bold font-sans"
                      style={{ background: `linear-gradient(135deg, ${C.goldD}, ${C.gold})`, color: C.navy }}>
                      Mais popular
                    </div>
                  </div>
                )}

                <div className="mb-6">
                  <div className="text-xs font-semibold uppercase tracking-widest mb-1 font-sans" style={{ color: plan.highlight ? C.goldL : C.gold }}>
                    {plan.name}
                  </div>
                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-sm font-sans" style={{ color: plan.highlight ? `${C.cream}80` : dark ? `${C.cream}60` : `${C.navy}60` }}>R$</span>
                    <span className="text-5xl font-bold font-display" style={{ color: plan.highlight ? C.cream : dark ? C.cream : C.navy }}>{plan.price}</span>
                    <span className="text-sm mb-1 font-sans" style={{ color: plan.highlight ? `${C.cream}60` : dark ? `${C.cream}60` : `${C.navy}60` }}>/mês</span>
                  </div>
                  <p className="text-sm font-sans" style={{ color: plan.highlight ? `${C.cream}b3` : dark ? `${C.cream}80` : `${C.navy}80` }}>
                    {plan.desc}
                  </p>
                </div>

                <GoldLine className="mb-6" />

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-3 text-sm font-sans"
                      style={{ color: plan.highlight ? `${C.cream}cc` : dark ? `${C.cream}cc` : `${C.navy}cc` }}>
                      <Check size={14} style={{ color: C.gold, flexShrink: 0 }} />
                      {feat}
                    </li>
                  ))}
                </ul>

                {plan.highlight ? (
                  <GoldBtn label={plan.cta} onClick={() => navigate('/register')} />
                ) : plan.name === 'Enterprise' ? (
                  <WhatsBtn label={plan.cta} />
                ) : (
                  <button onClick={() => navigate('/register')}
                    className="w-full py-3 rounded-2xl text-sm font-semibold font-sans transition-all duration-200"
                    style={{
                      border: `1px solid ${C.gold}30`,
                      color: dark ? C.cream : C.navy,
                      background: 'transparent',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${C.gold}60`; (e.currentTarget as HTMLButtonElement).style.background = `${C.gold}08` }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${C.gold}30`; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    {plan.cta}
                  </button>
                )}
              </div>
            ))}
          </div>

          <p className="text-center text-sm font-sans mt-8" style={{ color: dark ? `${C.cream}60` : `${C.navy}60` }}>
            Precisa de um plano personalizado?{' '}
            <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer"
              className="underline" style={{ color: C.gold }}>
              Fale com a nossa equipe
            </a>
          </p>
        </div>
      </section>

      {/* ── DIFERENCIAIS ──────────────────────────────────────────────────────── */}
      <section className="py-24" style={{ background: dark ? C.navy : C.cream }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="font-display font-bold tracking-tight" style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', color: dark ? C.cream : C.navy }}>
              Por que escolher o{' '}
              <span className="italic" style={{ color: C.gold }}>DuoFuturo?</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              { icon: Shield,       title: 'Dados 100% seguros',          desc: 'Infraestrutura com criptografia, backup automático e isolamento total por empresa.' },
              { icon: Smartphone,   title: 'Funciona em qualquer device',  desc: 'Acesse do celular, tablet ou computador. Responsivo e rápido em qualquer tela.' },
              { icon: Zap,          title: 'Atualizações contínuas',       desc: 'Novas funcionalidades toda semana, baseadas no feedback real dos nossos clientes.' },
              { icon: MessageSquare, title: 'Suporte em português',        desc: 'Equipe brasileira disponível por WhatsApp para tirar dúvidas e ajudar na configuração.' },
            ].map((d) => (
              <div key={d.title} className="flex gap-5 rounded-3xl p-7 transition-all duration-300" style={{
                background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                border: `1px solid ${C.gold}15`,
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${C.gold}40`; el.style.boxShadow = `0 8px 32px rgba(0,0,0,0.1)` }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${C.gold}15`; el.style.boxShadow = '' }}
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${C.goldD}30, ${C.gold}40)`, border: `1px solid ${C.gold}30` }}>
                  <d.icon size={20} style={{ color: C.gold }} />
                </div>
                <div>
                  <h3 className="font-bold mb-2 font-sans" style={{ color: dark ? C.cream : C.navy }}>{d.title}</h3>
                  <p className="text-sm leading-relaxed font-sans" style={{ color: dark ? `${C.cream}b3` : `${C.navy}80` }}>{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ─────────────────────────────────────────────────────────── */}
      <section className="py-32 relative overflow-hidden" style={{ background: C.navyD }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-[0.035]"
            style={{ backgroundImage: `radial-gradient(circle, ${C.cream} 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full blur-3xl opacity-20"
            style={{ background: `radial-gradient(ellipse, ${C.gold}90, transparent)` }} />
        </div>
        <GoldLine />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center py-8">
          <div className="mb-8"><GoldBadge icon={<Sparkles size={11} />} text="Comece hoje, grátis" /></div>
          <h2 className="font-display font-bold tracking-tight mb-6 leading-tight"
            style={{ fontSize: 'clamp(36px, 5vw, 64px)', color: C.cream }}
          >
            Seu negócio merece um{' '}
            <span className="italic" style={{ color: C.gold }}>sistema de verdade</span>
          </h2>
          <p className="text-xl mb-12 leading-relaxed font-sans" style={{ color: `${C.cream}cc` }}>
            Financeiro, CRM e WhatsApp integrados com DuoAI.
            14 dias grátis, cancele quando quiser.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <GoldBtn label="Criar minha conta grátis" onClick={() => navigate('/register')} large />
            <WhatsBtn label="Falar no WhatsApp" large />
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 justify-center mt-10">
            {['Sem cartão de crédito', '14 dias grátis', 'Suporte em português'].map((t) => (
              <div key={t} className="flex items-center gap-2 text-sm font-sans" style={{ color: `${C.cream}99` }}>
                <Check size={13} style={{ color: C.gold }} />
                {t}
              </div>
            ))}
          </div>
        </div>
        <GoldLine />
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#0c1628', borderTop: `1px solid ${C.gold}10` }} className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <img src="/logo.png" alt="DuoFuturo" className="h-8 w-auto mb-4" />
              <p className="text-xs leading-relaxed max-w-[200px] font-sans" style={{ color: `${C.cream}60` }}>
                Financeiro, CRM e WhatsApp com DuoAI em um só sistema.
              </p>
              <div className="flex items-center gap-2 mt-4">
                <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium font-sans flex items-center gap-1.5 transition-colors"
                  style={{ color: '#25D366' }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Falar no WhatsApp
                </a>
              </div>
            </div>
            {[
              { title: 'Produto', links: ['Funcionalidades', 'DuoAI', 'Planos', 'Novidades'] },
              { title: 'Suporte',  links: ['Central de ajuda', 'WhatsApp', 'Termos de uso', 'Privacidade'] },
              { title: 'Empresa',  links: ['Sobre nós', 'Blog', 'Parceiros', 'Contato'] },
            ].map((col) => (
              <div key={col.title}>
                <div className="text-xs font-semibold uppercase tracking-wider mb-4 font-sans" style={{ color: `${C.gold}80` }}>{col.title}</div>
                <ul className="space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l}>
                      <span className="text-sm font-sans cursor-default" style={{ color: `${C.cream}50` }}>{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: `1px solid ${C.gold}10` }}>
            <p className="text-xs font-sans" style={{ color: `${C.cream}40` }}>© {new Date().getFullYear()} DuoFuturo. Todos os direitos reservados.</p>
            <div className="flex items-center gap-4">
              <a href="#planos" className="text-xs font-sans transition-colors" style={{ color: `${C.cream}40` }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.gold }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = `${C.cream}40` }}>
                Ver planos <ChevronRight size={10} className="inline" />
              </a>
              <span className="text-xs font-sans" style={{ color: `${C.cream}25` }}>Feito no Brasil 🇧🇷</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
