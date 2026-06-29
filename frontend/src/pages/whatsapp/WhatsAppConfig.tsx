import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, CheckCircle, XCircle, RefreshCw, Send, AlertCircle, User } from 'lucide-react';
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

// ============================================================
// Card individual de usuário (usado na visão master)
// ============================================================
interface UserCardProps {
  usuario: WhatsAppUsuarioEmpresa;
  isSelf: boolean;
}

const UserCard: React.FC<UserCardProps> = ({ usuario, isSelf }) => {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(30);

  const fetchQRImage = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/whatsapp/empresa/usuarios/${usuario.id}/qr-image?t=${Date.now()}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        const blob = await response.blob();
        setQrUrl(URL.createObjectURL(blob));
      } else {
        setQrUrl(null);
      }
    } catch {
      setQrUrl(null);
    }
  }, [usuario.id]);

  const fetchStatus = useCallback(async () => {
    if (!usuario.configurado) return;
    try {
      setLoadingStatus(true);
      const s = await whatsappApi.getUsuarioStatus(usuario.id);
      setStatus(s);
      if (s.hasQrCode && s.status === 'disconnected') {
        await fetchQRImage();
      } else {
        setQrUrl(null);
      }
    } catch {
      setStatus(null);
      setQrUrl(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [usuario.id, usuario.configurado, fetchQRImage]);

  useEffect(() => {
    fetchStatus();
    if (!usuario.configurado) return;
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Contador regressivo do QR Code — reseta quando qrUrl muda
  useEffect(() => {
    if (!qrUrl) { setQrCountdown(30); return; }
    setQrCountdown(30);
    const tick = setInterval(() => {
      setQrCountdown(prev => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [qrUrl]);

  const handleDisconnect = async () => {
    if (!confirm('Deseja forçar a reconexão? O WhatsApp será desconectado e um novo QR Code será gerado.')) return;
    try {
      setDisconnecting(true);
      await whatsappApi.disconnectUsuario(usuario.id);
      setStatus(null);
      setQrUrl(null);
      // Aguardar um momento e então buscar status novamente
      setTimeout(fetchStatus, 3000);
    } catch {
      // silent
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = status?.status === 'connected';

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
          {!usuario.configurado ? (
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Não configurado</span>
          ) : isConnected ? (
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">Online</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600 font-medium">Offline</span>
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

      {/* Sem configuração */}
      {!usuario.configurado && (
        <div className="text-center py-3 text-xs text-gray-400">
          <AlertCircle size={20} className="mx-auto mb-1 text-yellow-400" />
          WhatsApp não configurado para este usuário
        </div>
      )}

      {/* Conectado */}
      {usuario.configurado && isConnected && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 py-2 px-3 bg-green-50 rounded-lg text-sm text-green-700">
            <CheckCircle size={16} />
            WhatsApp conectado e ativo
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors"
          >
            <RefreshCw size={12} className={disconnecting ? 'animate-spin' : ''} />
            {disconnecting ? 'Desconectando...' : 'Forçar Reconexão'}
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
            {qrCountdown <= 5 && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
                <span className="text-sm font-bold text-orange-600">Atualizando QR...</span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 text-center">
            ⏰ Expira em {qrCountdown}s — escaneie com o WhatsApp
          </p>
          <p className="text-xs text-blue-500 mt-0.5 text-center">O QR é atualizado automaticamente</p>
        </div>
      )}

      {/* Aguardando QR */}
      {usuario.configurado && !isConnected && !qrUrl && (
        <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
          <XCircle size={14} className="text-red-400 flex-shrink-0" />
          Desconectado — aguardando QR Code...
        </div>
      )}
    </div>
  );
};

// ============================================================
// Página principal
// ============================================================
export const WhatsAppConfig: React.FC = () => {
  const { user } = useAuth();
  const isMaster = user?.tipo_usuario === 'master';

  // ---- Estado para visão de usuário comum ----
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
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
        await loadQRImage();
      } else {
        setQrCodeUrl(null);
      }
    } catch (err: any) {
      console.error('Erro ao carregar status:', err);
    }
  };

  const loadQRImage = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/whatsapp/qr-image?t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const blob = await response.blob();
        setQrCodeUrl(URL.createObjectURL(blob));
      } else {
        setQrCodeUrl(null);
      }
    } catch {
      setQrCodeUrl(null);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja forçar a reconexão? O WhatsApp será desconectado e um novo QR Code será gerado.')) return;
    try {
      setDisconnecting(true);
      await whatsappApi.disconnect();
      setStatus(null);
      setQrCodeUrl(null);
      setTimeout(loadStatus, 3000);
    } catch (err: any) {
      alert('Erro ao desconectar: ' + err.message);
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
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between ml-10 md:ml-0">
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
              <UserCard key={u.id} usuario={u} isSelf={u.id === Number(user?.id)} />
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
      </div>
    );
  }

  const isConnected = status?.status === 'connected';

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
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 transition-colors"
                >
                  <RefreshCw size={11} className={disconnecting ? 'animate-spin' : ''} />
                  {disconnecting ? 'Desconectando...' : 'Forçar reconexão'}
                </button>
              </div>
            </>
          ) : (
            <>
              <XCircle className="w-12 h-12 text-red-500" />
              <div className="flex-1">
                <p className="font-semibold text-gray-900">WhatsApp Desconectado</p>
                <p className="text-sm text-gray-600">
                  Escaneie o QR Code abaixo para conectar
                </p>
              </div>
              <div className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
                Offline
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
                ⏰ O QR Code expira em ~30 segundos
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
