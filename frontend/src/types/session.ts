export interface Session {
  id: string
  cliente_id: string
  mentor_id: string
  tipo_sessao: 'MENTORIA' | 'COACHING'
  data: Date | string
  horario: string  // "HH:MM:SS"
  duracao_minutos: number
  modalidade: 'ONLINE' | 'PRESENCIAL'
  plataforma?: string  // "Zoom", "Teams", etc
  link_sessao?: string
  titulo: string
  descricao: string
  notas_internas?: string
  created_at: Date | string
  updated_at: Date | string
}

export interface CreateSessionRequest {
  cliente_id: string
  mentor_id: string
  tipo_sessao: 'MENTORIA' | 'COACHING'
  data: Date | string
  horario: string
  duracao_minutos: number
  modalidade: 'ONLINE' | 'PRESENCIAL'
  plataforma?: string
  link_sessao?: string
  titulo: string
  descricao: string
  notas_internas?: string
}

export interface UpdateSessionRequest {
  cliente_id?: string
  mentor_id?: string
  tipo_sessao?: 'MENTORIA' | 'COACHING'
  data?: Date | string
  horario?: string
  duracao_minutos?: number
  modalidade?: 'ONLINE' | 'PRESENCIAL'
  plataforma?: string
  link_sessao?: string
  titulo?: string
  descricao?: string
  notas_internas?: string
}
