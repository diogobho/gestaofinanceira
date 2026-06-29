import React, { useEffect, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, LayoutGrid,
  Users, UserCheck,
  TrendingUp, ArrowUpCircle,
  TrendingDown, ArrowDownCircle,
  DollarSign, BadgeDollarSign,
  Calendar, CalendarCheck,
  Settings, Settings2,
  LogOut,
  X,
  MessageSquare, MessageSquareText,
  Kanban, KanbanSquare,
  BarChart3, ChartArea,
  Sparkles, Wand2,
  Zap, ZapOff,
  Moon, Sun,
  Mail, MailOpen,
  CreditCard, Wallet,
  HeartHandshake, Handshake,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useUserPhoto } from '@/hooks/useUserPhoto'
import { TourButton } from '@/components/tour/TourButton'
import logo from '/logo.png'

// Navegação com permissões associadas
const navigationItems = [
  { name: 'Dashboard',     href: '/dashboard',         icon: LayoutDashboard, iconHover: LayoutGrid,        permissao: 'dashboard', tour: 'nav-dashboard'      },
  { name: 'CRM / Funil',  href: '/crm',               icon: Kanban,          iconHover: KanbanSquare,      permissao: 'crm',       tour: 'nav-crm'            },
  { name: 'CRM Dashboard', href: '/crm/dashboard',     icon: BarChart3,       iconHover: ChartArea,         permissao: 'crm',       tour: 'nav-crm-dashboard'  },
  { name: 'CRM CX',       href: '/crm-cx',            icon: HeartHandshake,  iconHover: Handshake,         permissao: 'crm',       tour: 'nav-crm-cx'         },
  { name: 'Clientes',     href: '/clientes',           icon: Users,           iconHover: UserCheck,         permissao: 'clientes',  tour: 'nav-clientes'       },
  { name: 'Receitas',     href: '/receitas',           icon: TrendingUp,      iconHover: ArrowUpCircle,     permissao: 'receitas',  tour: 'nav-receitas'       },
  { name: 'Despesas',     href: '/despesas',           icon: TrendingDown,    iconHover: ArrowDownCircle,   permissao: 'despesas',  tour: 'nav-despesas'       },
  { name: 'Parcelas',     href: '/parcelas',           icon: DollarSign,      iconHover: BadgeDollarSign,   permissao: 'parcelas',  tour: 'nav-parcelas'       },
  { name: 'Sessões',      href: '/sessoes',            icon: Calendar,        iconHover: CalendarCheck,     permissao: 'sessoes',   tour: 'nav-sessoes'        },
  { name: 'WhatsApp',     href: '/whatsapp',           icon: MessageSquare,   iconHover: MessageSquareText, permissao: 'whatsapp',  tour: 'nav-whatsapp'       },
  { name: 'Automações',   href: '/automacoes',         icon: Zap,             iconHover: ZapOff,            permissao: 'whatsapp',  tour: 'nav-automacoes'     },
  { name: 'Agente IA',     href: '/agente-sexta-feira', icon: Sparkles,        iconHover: Wand2,             permissao: 'agente',    tour: 'nav-agente'         },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { userPhoto } = useUserPhoto()

  // Verificar se é admin ou master (acesso total)
  const isAdminOrMaster = useMemo(() => {
    return user?.nivel === 'super_admin' || user?.tipo_usuario === 'master'
  }, [user])

  // Filtrar navegação baseado nas permissões
  const navigation = useMemo(() => {
    if (isAdminOrMaster) {
      return navigationItems
    }

    // Usuário comum: filtrar por permissões
    return navigationItems.filter(item => {
      const permissoes = user?.permissoes || {}
      return permissoes[item.permissao as keyof typeof permissoes] !== false
    })
  }, [user, isAdminOrMaster])

  // Fechar sidebar ao clicar em um link (apenas em mobile)
  const handleNavClick = () => {
    if (window.innerWidth < 768) {
      onClose()
    }
  }

  // Prevenir scroll quando sidebar está aberta em mobile
  useEffect(() => {
    if (isOpen && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Texto do nível do usuário
  const getUserLevelText = () => {
    if (user?.nivel === 'super_admin') return 'Administrador'
    if (user?.tipo_usuario === 'master') return 'Master'
    if (user?.tipo_usuario === 'comum') return 'Usuário'
    return user?.nivel || user?.funcao || 'Usuário'
  }

  return (
    <>
      {/* Overlay - apenas mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          flex flex-col w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-screen fixed left-0 top-0 z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
      <div className="flex items-center justify-between px-4 h-16 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <img src={logo} alt="DuoFuturo" className="h-8 w-auto" />
          <span className="text-lg font-bold text-brand-navy dark:text-white">DuoFuturo</span>
        </div>
        {/* Botão fechar - apenas mobile */}
        <button
          onClick={onClose}
          className="md:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      <NavLink
        to="/perfil"
        onClick={handleNavClick}
        data-tour="sidebar-perfil"
        className="block p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center border-2 border-primary-200 dark:border-primary-700">
            {userPhoto ? (
              <img
                src={userPhoto}
                alt={user?.nome}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-primary-600 dark:text-primary-300 font-semibold">
                {user?.nome?.substring(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.nome}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{getUserLevelText()}</p>
          </div>
        </div>
      </NavLink>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            onClick={handleNavClick}
            data-tour={item.tour}
            className={({ isActive }) =>
              `group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 shadow-[inset_3px_0_0_0_#D2B773]'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`
            }
          >
            <span className="relative w-5 h-5 mr-3 flex-shrink-0">
              <item.icon className="absolute inset-0 w-5 h-5 transition-all duration-200 ease-in-out group-hover:opacity-0 group-hover:scale-75" />
              <item.iconHover className="absolute inset-0 w-5 h-5 transition-all duration-200 ease-in-out opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100" />
            </span>
            {item.name}
          </NavLink>
        ))}

        {/* Minha Conta / Planos — visível para usuários com empresa (não super_admin) */}
        {user?.empresa_id && user?.nivel !== 'super_admin' && (
          <>
            <NavLink
              to="/minha-conta"
              onClick={handleNavClick}
              className={({ isActive }) =>
                `group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 shadow-[inset_3px_0_0_0_#D2B773]'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`
              }
            >
              <span className="relative w-5 h-5 mr-3 flex-shrink-0">
                <CreditCard className="absolute inset-0 w-5 h-5 transition-all duration-200 ease-in-out group-hover:opacity-0 group-hover:scale-75" />
                <Wallet className="absolute inset-0 w-5 h-5 transition-all duration-200 ease-in-out opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100" />
              </span>
              Minha Conta
            </NavLink>
          </>
        )}

        {/* Itens de admin - apenas para admin e master */}
        {isAdminOrMaster && (
          <>
<NavLink
              to="/configuracoes/email"
              onClick={handleNavClick}
              className={({ isActive }) =>
                `group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 shadow-[inset_3px_0_0_0_#D2B773]'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`
              }
            >
              <span className="relative w-5 h-5 mr-3 flex-shrink-0">
                <Mail className="absolute inset-0 w-5 h-5 transition-all duration-200 ease-in-out group-hover:opacity-0 group-hover:scale-75" />
                <MailOpen className="absolute inset-0 w-5 h-5 transition-all duration-200 ease-in-out opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100" />
              </span>
              Config. E-mail
            </NavLink>
            <NavLink
              to="/admin"
              onClick={handleNavClick}
              className={({ isActive }) =>
                `group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 shadow-[inset_3px_0_0_0_#D2B773]'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`
              }
            >
              <span className="relative w-5 h-5 mr-3 flex-shrink-0">
                <Settings className="absolute inset-0 w-5 h-5 transition-all duration-200 ease-in-out group-hover:opacity-0 group-hover:scale-75" />
                <Settings2 className="absolute inset-0 w-5 h-5 transition-all duration-200 ease-in-out opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100" />
              </span>
              Configurações
            </NavLink>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-1">
        {/* Botão Tutorial — reinicia o tour guiado */}
        <TourButton onClick={handleNavClick} />

        {/* Botão alternar tema */}
        <button
          onClick={toggleTheme}
          className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-5 h-5 mr-3 text-yellow-400" />
              Modo Claro
            </>
          ) : (
            <>
              <Moon className="w-5 h-5 mr-3" />
              Modo Escuro
            </>
          )}
        </button>

        <button
          onClick={logout}
          className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sair
        </button>
      </div>
      </div>
    </>
  )
}
