import { useAuth } from '@/contexts/AuthContext'

/**
 * Como esta conta chama o "cliente" nas telas.
 *
 * Mora em `empresas.config.rotulo_cliente` ({ singular, plural }) e chega no
 * `user.empresa` do login/`/auth/me`. Sem configuração é "Cliente/Clientes" —
 * a Loja Maçônica (empresa 33) usa "Associado/Associados" desde 15/10/2026.
 * Só o texto muda: rota, permissão e API continuam `clientes`.
 */
export function useTermoCliente() {
  const { user } = useAuth()
  const r = user?.empresa?.rotulo_cliente
  const Cliente = r?.singular?.trim() || 'Cliente'
  const Clientes = r?.plural?.trim() || 'Clientes'
  return {
    Cliente,
    Clientes,
    cliente: Cliente.toLowerCase(),
    clientes: Clientes.toLowerCase(),
    /** "1 cliente" / "3 clientes" */
    qtd: (n: number) => `${n} ${n === 1 ? Cliente.toLowerCase() : Clientes.toLowerCase()}`,
  }
}
