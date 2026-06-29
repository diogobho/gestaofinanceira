import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

export const clientSchema = z.object({
  nome_completo: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  telefone: z.string().min(1, 'Telefone é obrigatório'),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos'),
  empresa: z.string().optional(),
  cargo: z.string().optional(),
  como_conheceu: z.string().optional(),
  endereco_rua: z.string().optional(),
  endereco_numero: z.string().optional(),
  endereco_complemento: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  cep: z.string().optional(),
  data_nascimento: z.string().optional(),
  mentor_id: z.string().min(1, 'Mentor é obrigatório'),
  status: z.enum(['ATIVO', 'PAUSADO', 'CONCLUIDO']),
  observacoes: z.string().optional(),
})

export const revenueSchema = z.object({
  tipo: z.enum(['FIXO', 'VARIAVEL']),
  categoria: z.enum(['CONSULTORIA', 'MENTORIA', 'COACHING', 'OUTROS']),
  cliente_id: z.string().optional(),
  data: z.string().min(1, 'Data é obrigatória'),
  valor: z.number().positive('Valor deve ser positivo'),
  metodo_pagamento: z.enum(['BOLETO', 'CARTAO', 'TRANSFERENCIA', 'PIX']),
  status: z.enum(['PENDENTE', 'CONFIRMADO']),
  parcelado: z.boolean(),
  parcelas: z.string().regex(/^\d+\/\d+$/, 'Formato: 1/12').optional(),
  id_fatura: z.string().min(1, 'ID da fatura é obrigatório'),
  id_contrato: z.string().optional(),
  observacoes: z.string().optional(),
})

export const expenseSchema = z.object({
  data: z.string().min(1, 'Data é obrigatória'),
  tipo: z.enum(['FIXO', 'VARIAVEL']),
  categoria: z.enum(['MARKETING', 'SOFTWARE', 'ESCRITORIO', 'OUTROS']),
  descricao: z.string().min(3, 'Descrição deve ter no mínimo 3 caracteres'),
  valor: z.number().positive('Valor deve ser positivo'),
  metodo_pagamento: z.enum(['BOLETO', 'CARTAO', 'TRANSFERENCIA', 'PIX']),
  status: z.enum(['PAGO', 'PENDENTE']),
  parcelado: z.boolean(),
  parcelas: z.string().regex(/^\d+\/\d+$/, 'Formato: 1/12').optional(),
  recorrente: z.boolean(),
  id_fatura: z.string().min(1, 'ID da fatura é obrigatório'),
  observacoes: z.string().optional(),
})

export const sessionSchema = z.object({
  cliente_id: z.string().min(1, 'Cliente é obrigatório'),
  mentor_id: z.string().min(1, 'Mentor é obrigatório'),
  tipo_sessao: z.enum(['MENTORIA', 'COACHING']),
  data: z.string().min(1, 'Data é obrigatória'),
  horario: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Formato: HH:MM'),
  duracao_minutos: z.number().min(30, 'Duração mínima de 30 minutos').max(240, 'Duração máxima de 240 minutos'),
  modalidade: z.enum(['ONLINE', 'PRESENCIAL']),
  plataforma: z.string().optional(),
  link_sessao: z.string().url('URL inválida').optional().or(z.literal('')),
  titulo: z.string().min(3, 'Título deve ter no mínimo 3 caracteres'),
  descricao: z.string().min(3, 'Descrição deve ter no mínimo 3 caracteres'),
  notas_internas: z.string().optional(),
})

export const userSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres').optional(),
  telefone: z.string().optional(),
  empresa: z.string().optional(),
  funcao: z.enum(['ADMIN', 'MENTOR']),
  taxa_horaria: z.number().positive().optional(),
  comissao_percentual: z.number().min(0).max(100).optional(),
  especialidades: z.string().optional(),
  biografia: z.string().optional(),
  status: z.enum(['ATIVO', 'INATIVO']).optional(),
})
