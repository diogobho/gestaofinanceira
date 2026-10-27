import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/gestao',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Se receber 401, redirecionar para login
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/gestao/login'
    }

    // Conta sem acesso (trial vencido, suspensa, aguardando pagamento): a API recusa
    // tudo fora da Minha Conta e da escolha de plano.
    // Sem toast (seria um por chamada da tela que estava aberta) — leva à Minha
    // Conta, onde o Layout mostra o aviso e o caminho para ativar.
    if (error.response?.status === 402 && ['TRIAL_ENCERRADO', 'CONTA_BLOQUEADA'].includes(error.response?.data?.code)) {
      if (!/\/(minha-conta|planos)(\/|$)/.test(window.location.pathname)) {
        window.location.href = '/gestao/minha-conta'
      }
      return Promise.reject(error)
    }

    // Chamadas de sondagem (ex.: "esse usuário pode ver tal aba?") passam
    // `silenciarErro` e tratam a falha sozinhas — um toast ali só assustaria.
    const silencioso = Boolean((error.config as any)?.silenciarErro)

    // Mostrar mensagem de erro se houver
    if (!silencioso) {
      if (error.response?.data?.message) {
        toast.error(error.response.data.message)
      } else if (error.message) {
        toast.error(error.message)
      }
    }

    return Promise.reject(error)
  }
)

export default api
