import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, CheckCircle, XCircle, RefreshCw, Send, AlertCircle, User, Cloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TourHelpButton } from '@/components/tour/TourHelpButton';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import {
  whatsappApi,
  WhatsAppConfig as WhatsAppConfigType,
  WhatsAppStatus,
  WhatsAppUsuarioEmpresa,
} from '@/api/whatsapp';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminEmpresa } from '@/utils/roles'
import { diagnosticarConexao, CORES_TOM, CORES_SELO } from './diagnosticoConexao';
import { NumeroOficialPainel } from './NumeroOficialPainel';
import { ConvitePlanoOficial } from './ConvitePlanoOficial';
import { EscolhaDeCanal } from './EscolhaDeCanal';
import { useCanalWhatsApp } from '@/hooks/useCanalWhatsApp';

// ============================================================
// Card individual de usuário (usado na visão master)
// ============================================================
interface UserCardProps {
  usuario: WhatsAppUsuarioEmpresa;
  isSelf: boolean;
  /** Recarrega a lista quando o canal deste usuário muda. */
  onMudou?: () => void;
}

const UserCard: React.FC<UserCardProps> = ({ usuario, isSelf, onMudou }) => {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(0);
  // Qual QR já está na tela. Rebuscar a imagem a cada poll trocava o <img> sob o
  // celular do usuário no meio da leitura, mesmo com o código idêntico.
  const qrGeradoRef = useRef<string | null>(null);
  const qrUrlRef    = useRef<string | null>(null);

  const setQrUrlSeguro = useCallback((url: string | null) => {
    if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
    qrUrlRef.current = url;
    setQrUrl(url);
  }, []);

  useEffect(() => () => { if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current); }, []);

  const fetchQRImage = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/whatsapp/empresa/usuarios/${usuario.id}/qr-image?t=${Date.now()}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        const blob = await response.blob();
        setQrUrlSeguro(URL.createObjectURL(blob));
      } else {
        setQrUrlSeguro(null);
      }
    } catch {
      setQrUrlSeguro(null);
    }
  }, [usuario.id, setQrUrlSeguro]);

  const fetchStatus = useCallback(async () => {
    if (!usuario.configurado) return;
    try {
      setLoadingStatus(true);
      const s = await whatsappApi.getUsuarioStatus(usuario.id);
      setStatus(s);
      if (s.hasQrCode && s.status === 'disconnected') {
        const marca = s.qrGeradoEm ?? null;
        // Só baixa a imagem quando o código realmente mudou.
        if (marca === null || marca !== qrGeradoRef.current || !qrUrlRef.current) {
          qrGeradoRef.current = marca;
          await fetchQRImage();
        }
        setQrCountdown(s.qrExpiraEm ?? 0);
      } else {
        qrGeradoRef.current = null;
        setQrUrlSeguro(null);
      }
    } catch {
      setStatus(null);
      qrGeradoRef.current = null;
      setQrUrlSeguro(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [usuario.id, usuario.configurado, fetchQRImage, setQrUrlSeguro]);

  useEffect(() => {
    fetchStatus();
    if (!usuario.configurado) return;
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Contador regressivo do QR. O valor vem da instância (qrExpiraEm) e aqui só
  // desce de 1 em 1 — o poll de 5s o corrige. Antes era um 30 fixo que não tinha
  // relação nenhuma com a vida real do código.
  useEffect(() => {
    if (!qrUrl) return;
    const tick = setInterval(() => {
      setQrCountdown(prev => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [qrUrl]);

  // Reconectar sem trocar de número. Vale para chip recusado/bloqueado que já
  // voltou: não apaga sessão nenhuma, só manda tentar agora em vez de esperar a
  // sonda automática.
  const handleReconectar = async () => {
    try {
      setDisconnecting(true);
      await whatsappApi.reconectarUsuario(usuario.id, false);
      setTimeout(fetchStatus, 3000);
    } catch {
      // silent
    } finally {
      setDisconnecting(false);
    }
  };

  // Apaga a sessão e emite QR novo — o caminho de troca de chip.
  const handleNovoNumero = async () => {
    if (!confirm(`Isso desconecta o número atual de ${usuario.nome} e gera um QR Code novo para conectar outro chip. Continuar?`)) return;
    try {
      setDisconnecting(true);
      await whatsappApi.reconectarUsuario(usuario.id, true);
      setStatus(null);
      setQrUrlSeguro(null);
      qrGeradoRef.current = null;
      setTimeout(fetchStatus, 3000);
    } catch {
      // silent
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = status?.status === 'connected';
  const diag = usuario.configurado ? diagnosticarConexao(status, { temQr: !!qrUrl }) : null;

  return (
    <div data-tour="wa-card" className={`rounded-xl border-2 p-5 bg-white ${isSelf ? 'border-primary-400' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
            <User size={18} className="text-primary-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">
              {usuario.nome}
              {isSelf && (
                <span className="ml-1.5 text-xs font-normal text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
                  Você
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500 truncate max-w-[180px]">{usuario.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* O selo era só Online/Offline: "Offline" tanto para quem espera QR
              quanto para chip bloqueado. Agora ele nomeia o estado real. */}
          {!usuario.configurado ? (
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Não configurado</span>
          ) : (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CORES_SELO[diag!.tom]}`}>
              {diag!.selo}
            </span>
          )}
          {usuario.configurado && (
            <button
              onClick={fetchStatus}
              disabled={loadingStatus}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              title="Atualizar status"
            >
              <RefreshCw size={13} className={loadingStatus ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Sem canal ainda */}
      {!usuario.configurado && (
        usuario.podeOficial ? (
          // Empresa com direito ao número oficial: não é falha de configuração, é
          // escolha pendente. Oferecer o QR calado aqui entregaria justamente o
          // canal que o plano dela existe para não usar.
          <EscolhaDeCanal usuarioId={usuario.id} onMudou={onMudou} compacto />
        ) : (
          <div className="text-center py-3 text-xs text-gray-400">
            <AlertCircle size={20} className="mx-auto mb-1 text-yellow-400" />
            WhatsApp não configurado para este usuário
          </div>
        )
      )}

      {/* Conectado */}
      {usuario.configurado && isConnected && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 py-2 px-3 bg-green-50 rounded-lg text-sm text-green-700">
            <CheckCircle size={16} />
            WhatsApp conectado e ativo
          </div>
          <button
            onClick={handleNovoNumero}
            disabled={disconnecting}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors"
          >
            <RefreshCw size={12} className={disconnecting ? 'animate-spin' : ''} />
            {disconnecting ? 'Desconectando...' : 'Conectar outro número'}
          </button>
        </div>
      )}

      {/* QR Code */}
      {usuario.configurado && !isConnected && qrUrl && (
        <div className="flex flex-col items-center mt-2">
          <div className="border-2 border-gray-200 rounded-lg p-2 relative">
            <img
              src={qrUrl}
              alt="QR Code"
              className="w-56 h-56"
              onError={() => setTimeout(fetchStatus, 2000)}
            />
            {qrCountdown > 0 && qrCountdown <= 5 && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
                <span className="text-sm font-bold text-orange-600">Atualizando QR...</span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 text-center">
            ⏰ {qrCountdown > 0 ? `Expira em ${qrCountdown}s` : 'Gerando novo código'} — escaneie com o WhatsApp
          </p>
          <p className="text-xs text-blue-500 mt-0.5 text-center">O QR é atualizado automaticamente</p>
        </div>
      )}

      {/* Diagnóstico: um texto por estado, com a ação que resolve cada um.
          Antes eram duas caixas independentes ("aguardando QR Code..." e o aviso
          fixo de ban) que apareciam juntas e se contradiziam. */}
      {usuario.configurado && !isConnected && diag && (
        <div className={`mt-1 p-2 rounded-md text-xs ${CORES_TOM[diag.tom]}`}>
          <div className="flex items-start gap-2">
            {diag.tom === 'grave' || diag.tom === 'atencao'
              ? <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              : <XCircle size={14} className="flex-shrink-0 mt-0.5 opacity-70" />}
            <div className="min-w-0">
              <p><strong>{diag.titulo}</strong> {diag.descricao}</p>
              {diag.detalhe && <p className="mt-0.5 opacity-80">{diag.detalhe}</p>}
            </div>
          </div>
          {(diag.acoes.includes('reconectar') || diag.acoes.includes('novo_numero')) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {diag.acoes.includes('reconectar') && (
                <button
                  onClick={handleReconectar}
                  disabled={disconnecting}
                  className="px-2 py-1 rounded border border-current/30 hover:bg-black/5 dark:hover:bg-white/10 font-medium"
                >
                  {disconnecting ? 'Tentando...' : 'Tentar agora'}
                </button>
              )}
              {diag.acoes.includes('novo_numero') && (
                <button
                  onClick={handleNovoNumero}
                  disabled={disconnecting}
                  className="px-2 py-1 rounded border border-current/30 hover:bg-black/5 dark:hover:bg-white/10 font-medium"
                >
                  Conectar outro número
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Página principal
// ============================================================
/**
 * Empresa no número oficial (Cloud API) não tem QR Code nem chip por usuário: a
 * página mostra o número da Meta. As demais seguem na tela de conexão por QR.
 */
export const WhatsAppConfig: React.FC = () => {
  const { data: canal, isLoading } = useCanalWhatsApp();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }
  if (canal?.provedor === 'cloud_api') return <NumeroOficialPainel canal={canal} />;

  // Enterprise ainda no QR: a faixa explica o que ele comprou e como ativar. Ela
  // não substitui a tela — o QR continua valendo, e continuará, porque grupo e
  // sincronização de contatos não existem na Cloud API.
  return (
    <>
      <ConvitePlanoOficial />
      <WhatsAppConfigQr />
    </>
  );
};

const WhatsAppConfigQr: React.FC = () => {
  const { user } = useAuth();
  const isMaster = isAdminEmpresa(user);

  // ---- Estado para visão de usuário comum ----
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [qrExpiraEm, setQrExpiraEm] = useState(0);
  // Mesma regra do UserCard: trocar a imagem a cada poll de 5s atrapalhava a
  // leitura; o QR só é rebaixado quando a instância emite um código novo.
  const qrGeradoRef = useRef<string | null>(null);
  const qrObjUrlRef = useRef<string | null>(null);
  const [testNumber, setTestNumber] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // ---- Estado para visão master ----
  const [usuariosEmpresa, setUsuariosEmpresa] = useState<WhatsAppUsuarioEmpresa[]>([]);
  const [loadingEmpresa, setLoadingEmpresa] = useState(true);

  // ---- Carregar dados ----
  useEffect(() => {
    if (isMaster) {
      loadEmpresaUsuarios();
    } else {
      loadConfig();
    }
  }, [isMaster]);

  const loadEmpresaUsuarios = async () => {
    try {
      setLoadingEmpresa(true);
      const dados = await whatsappApi.getEmpresaUsuarios();
      setUsuariosEmpresa(dados);
    } catch (err: any) {
      console.error('Erro ao carregar usuários empresa:', err);
    } finally {
      setLoadingEmpresa(false);
    }
  };

  // ---- Visão comum: mesma lógica anterior ----
  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await whatsappApi.getConfig();
      setConfig(data);
      if (data.configurado) {
        await loadStatus();
      }
    } catch (err: any) {
      console.error('Erro ao carregar config:', err);
      setError('Erro ao carregar configuração');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!config?.configurado || isMaster) return;
    const interval = setInterval(() => { loadStatus(); }, 5000);
    return () => clearInterval(interval);
  }, [config, isMaster]);

  const loadStatus = async () => {
    try {
      const statusData = await whatsappApi.getStatus();
      setStatus(statusData);
      if (statusData.hasQrCode && statusData.status === 'disconnected') {
        const marca = statusData.qrGeradoEm ?? null;
        if (marca === null || marca !== qrGeradoRef.current || !qrObjUrlRef.current) {
          qrGeradoRef.current = marca;
          await loadQRImage();
        }
        setQrExpiraEm(statusData.qrExpiraEm ?? 0);
      } else {
        qrGeradoRef.current = null;
        aplicarQrUrl(null);
      }
    } catch (err: any) {
      console.error('Erro ao carregar status:', err);
    }
  };

  const aplicarQrUrl = (url: string | null) => {
    if (qrObjUrlRef.current) URL.revokeObjectURL(qrObjUrlRef.current);
    qrObjUrlRef.current = url;
    setQrCodeUrl(url);
  };

  useEffect(() => () => { if (qrObjUrlRef.current) URL.revokeObjectURL(qrObjUrlRef.current); }, []);

  // Desconta o tempo do QR entre um poll e outro.
  useEffect(() => {
    if (!qrCodeUrl) return;
    const tick = setInterval(() => setQrExpiraEm(prev => (prev <= 0 ? 0 : prev - 1)), 1000);
    return () => clearInterval(tick);
  }, [qrCodeUrl]);

  const loadQRImage = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/whatsapp/qr-image?t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const blob = await response.blob();
        aplicarQrUrl(URL.createObjectURL(blob));
      } else {
        aplicarQrUrl(null);
      }
    } catch {
      aplicarQrUrl(null);
    }
  };

  // Tentar agora, com o MESMO número. É a saída de quem teve o chip liberado
  // pela Meta e não quer esperar a sonda automática — antes disso só existia
  // reiniciar o processo no servidor.
  const handleReconectar = async () => {
    try {
      setDisconnecting(true);
      await whatsappApi.reconectar(false);
      setTimeout(loadStatus, 3000);
    } catch (err: any) {
      alert('Não foi possível pedir a reconexão: ' + err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  // Apaga a sessão e emite QR novo — troca de chip.
  const handleNovoNumero = async () => {
    if (!confirm('Isso desconecta o número atual e gera um QR Code novo para conectar outro número. Continuar?')) return;
    try {
      setDisconnecting(true);
      await whatsappApi.reconectar(true);
      setStatus(null);
      qrGeradoRef.current = null;
      aplicarQrUrl(null);
      setTimeout(loadStatus, 3000);
    } catch (err: any) {
      alert('Erro ao trocar de número: ' + err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSendTest = async () => {
    if (!testNumber || testNumber.length < 10) {
      alert('Por favor, informe um número válido (apenas números)');
      return;
    }
    try {
      setTestLoading(true);
      setTestSuccess(false);
      await whatsappApi.sendTest(testNumber);
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 3000);
    } catch (err: any) {
      alert('Erro ao enviar mensagem de teste: ' + err.message);
    } finally {
      setTestLoading(false);
    }
  };

  // ============================================================
  // RENDER: VISÃO MASTER
  // ============================================================
  if (isMaster) {
    if (loadingEmpresa) {
      return (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      );
    }

    return (
      <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-8 h-8 text-green-600" />
              WhatsApp da Empresa
            </h1>
            <p className="text-gray-600 mt-1">
              Gerencie as conexões WhatsApp de todos os usuários da empresa
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {/* API oficial da Meta — conta da DuoFuturo, nao da empresa cliente. */}
            {(user?.nivel === 'super_admin' || user?.acesso_cloud_api) && (
              <Link to="/whatsapp/meta">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Cloud className="w-4 h-4" />
                  Cloud API
                </Button>
              </Link>
            )}
            <TourHelpButton tourId="whatsapp" />
            <Button variant="outline" size="sm" onClick={loadEmpresaUsuarios} className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Atualizar todos
            </Button>
          </div>
        </div>

        {usuariosEmpresa.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">
            Nenhum usuário encontrado na empresa.
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {usuariosEmpresa.map((u) => (
              <UserCard key={u.id} usuario={u} isSelf={u.id === Number(user?.id)} onMudou={loadEmpresaUsuarios} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // RENDER: VISÃO COMUM (usuário normal)
  // ============================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!config?.configurado) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-green-600" />
            Configuração WhatsApp
          </h1>
          <p className="text-gray-600 mt-1">
            Configure e conecte seu WhatsApp para enviar notificações automáticas
          </p>
        </div>

        {/* Direito ao número oficial e ainda sem canal: é escolha, não falha. */}
        {config?.aguardandoEscolhaDeCanal ? (
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Escolha o canal do seu WhatsApp
            </h3>
            <EscolhaDeCanal onMudou={loadConfig} />
          </Card>
        ) : (
        <Card className="p-6">
          <div className="text-center py-8">
            <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              WhatsApp não configurado
            </h3>
            <p className="text-gray-600 mb-4">
              Entre em contato com o administrador do sistema para configurar uma instância WhatsApp para você.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto">
              <p className="text-sm text-gray-700 mb-2">
                <strong>Informações necessárias:</strong>
              </p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Seu ID de usuário: <code className="bg-white px-2 py-1 rounded">{user?.id}</code></li>
                <li>• Email: <code className="bg-white px-2 py-1 rounded">{user?.email}</code></li>
              </ul>
            </div>
          </div>
        </Card>
        )}
      </div>
    );
  }

  const isConnected = status?.status === 'connected';
  const diag = diagnosticarConexao(status, { temQr: !!qrCodeUrl });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-8 h-8 text-green-600" />
          Configuração WhatsApp
        </h1>
        <p className="text-gray-600 mt-1">
          Gerencie a conexão do seu WhatsApp para notificações automáticas
        </p>
      </div>

      {error && (
        <Card className="p-4 mb-4 bg-red-50 border-red-200">
          <p className="text-red-700">{error}</p>
        </Card>
      )}

      {/* Card de Status */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Status da Conexão</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={loadStatus}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
        </div>

        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          {isConnected ? (
            <>
              <CheckCircle className="w-12 h-12 text-green-500" />
              <div className="flex-1">
                <p className="font-semibold text-gray-900">WhatsApp Conectado</p>
                <p className="text-sm text-gray-600">
                  Seu WhatsApp está ativo e pronto para enviar mensagens
                </p>
                {config.ultimaConexao && (
                  <p className="text-xs text-gray-500 mt-1">
                    Última conexão: {new Date(config.ultimaConexao).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                  Online
                </div>
                <button
                  onClick={handleNovoNumero}
                  disabled={disconnecting}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 transition-colors"
                >
                  <RefreshCw size={11} className={disconnecting ? 'animate-spin' : ''} />
                  {disconnecting ? 'Desconectando...' : 'Conectar outro número'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Um estado, um texto, uma ação — ver diagnosticoConexao.ts. O
                  painel antigo tinha duas frases só: "Escaneie o QR Code abaixo"
                  (mesmo quando não havia QR nenhum) e o aviso de banido, que
                  mandava trocar de chip sem oferecer como. */}
              {diag.tom === 'grave' || diag.tom === 'atencao'
                ? <AlertCircle className={`w-12 h-12 flex-shrink-0 ${diag.tom === 'grave' ? 'text-red-500' : 'text-amber-500'}`} />
                : <XCircle className="w-12 h-12 text-gray-400 flex-shrink-0" />}
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{diag.titulo}</p>
                <p className="text-sm text-gray-600">{diag.descricao}</p>
                {diag.detalhe && <p className="text-xs text-gray-500 mt-0.5">{diag.detalhe}</p>}
                {(diag.acoes.includes('reconectar') || diag.acoes.includes('novo_numero')) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {diag.acoes.includes('reconectar') && (
                      <Button variant="outline" size="sm" disabled={disconnecting} onClick={handleReconectar}
                        className="flex items-center gap-1.5">
                        <RefreshCw size={12} className={disconnecting ? 'animate-spin' : ''} />
                        {disconnecting ? 'Tentando...' : 'Tentar agora'}
                      </Button>
                    )}
                    {diag.acoes.includes('novo_numero') && (
                      <Button variant="outline" size="sm" disabled={disconnecting} onClick={handleNovoNumero}>
                        Conectar outro número
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className={`px-4 py-2 rounded-lg text-sm font-medium ${CORES_SELO[diag.tom]}`}>
                {diag.selo}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Card de QR Code */}
      {!isConnected && qrCodeUrl && (
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Conectar WhatsApp</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="bg-white border-2 border-gray-200 rounded-lg p-4 flex items-center justify-center">
                <img
                  src={qrCodeUrl}
                  alt="QR Code WhatsApp"
                  className="w-64 h-64"
                  onError={() => { setTimeout(loadStatus, 2000); }}
                />
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">
                ⏰ {qrExpiraEm > 0 ? `Expira em ${qrExpiraEm}s` : 'Gerando novo código...'}
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Como conectar:</h3>
              <ol className="space-y-3 text-sm text-gray-700">
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center font-semibold text-xs">1</span>
                  <span>Abra o <strong>WhatsApp</strong> no seu celular</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center font-semibold text-xs">2</span>
                  <span>Vá em <strong>Menu</strong> → <strong>Dispositivos Conectados</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center font-semibold text-xs">3</span>
                  <span>Toque em <strong>Conectar um dispositivo</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center font-semibold text-xs">4</span>
                  <span>Escaneie o <strong>QR Code</strong> ao lado</span>
                </li>
              </ol>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>💡 Dica:</strong> Mantenha seu celular online e conectado à internet para que o WhatsApp funcione corretamente.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Card de Teste */}
      {isConnected && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Enviar Mensagem de Teste</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Número do WhatsApp (apenas números)
              </label>
              <Input
                type="text"
                placeholder="5524981234567"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value.replace(/\D/g, ''))}
                maxLength={13}
              />
              <p className="text-xs text-gray-500 mt-1">
                Formato: DDI + DDD + Número (ex: 5524981234567)
              </p>
            </div>

            <Button
              onClick={handleSendTest}
              disabled={testLoading || !testNumber || testNumber.length < 10}
              className="flex items-center gap-2"
            >
              {testLoading ? (
                <><Spinner size="sm" />Enviando...</>
              ) : testSuccess ? (
                <><CheckCircle className="w-4 h-4" />Enviado com sucesso!</>
              ) : (
                <><Send className="w-4 h-4" />Enviar Teste</>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Informações Técnicas */}
      <Card className="p-6 mt-6 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Informações Técnicas</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Porta:</span>
            <span className="ml-2 font-mono text-gray-900">{config.porta}</span>
          </div>
          <div>
            <span className="text-gray-600">Client ID:</span>
            <span className="ml-2 font-mono text-gray-900">{status?.clientId || 'N/A'}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
