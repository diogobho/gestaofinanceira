import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Duofuturo - API de Gestão Financeira',
      version: '1.0.0',
      description: 'API REST completa para gestão financeira de mentoria e coaching',
      contact: {
        name: 'Suporte Duofuturo',
        email: 'suporte@duofuturo.com'
      }
    },
    servers: [
      {
        url: 'http://161.97.127.54:4100/api',
        description: 'Servidor de Produção'
      },
      {
        url: 'http://localhost:4100/api',
        description: 'Servidor Local'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        LoginRequest: {
          type: 'object',
          required: ['email', 'senha'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@duofuturo.com' },
            senha: { type: 'string', format: 'password', example: 'Admin@123' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                nome: { type: 'string' },
                email: { type: 'string' },
                funcao: { type: 'string', enum: ['ADMIN', 'MENTOR'] }
              }
            }
          }
        },
        Usuario: {
          type: 'object',
          required: ['nome', 'email', 'funcao'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            nome: { type: 'string', example: 'Carlos Mendes' },
            email: { type: 'string', format: 'email', example: 'carlos@duofuturo.com' },
            telefone: { type: 'string', example: '11987654321' },
            funcao: { type: 'string', enum: ['ADMIN', 'MENTOR'] },
            taxa_horaria: { type: 'number', format: 'double', example: 350.00, description: 'Obrigatório para MENTOR' },
            comissao_percentual: { type: 'number', format: 'double', example: 15.00, description: 'Obrigatório para MENTOR' },
            especialidades: { type: 'string', example: 'Liderança, Gestão de Equipes' },
            biografia: { type: 'string' },
            status: { type: 'string', enum: ['ATIVO', 'INATIVO'], default: 'ATIVO' },
            ultimo_acesso_em: { type: 'string', format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Cliente: {
          type: 'object',
          required: ['nome_completo', 'email', 'telefone', 'cpf', 'mentor_id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            nome_completo: { type: 'string', example: 'Maria Silva' },
            email: { type: 'string', format: 'email', example: 'maria@exemplo.com' },
            telefone: { type: 'string', example: '11999887766' },
            cpf: { type: 'string', example: '12345678901', description: '11 dígitos' },
            empresa: { type: 'string', example: 'Tech Corp' },
            cargo: { type: 'string', example: 'CTO' },
            como_conheceu: { type: 'string', example: 'Indicação de amigo' },
            endereco_rua: { type: 'string', example: 'Av. Paulista' },
            endereco_numero: { type: 'string', example: '1000' },
            endereco_complemento: { type: 'string', example: 'Sala 101' },
            cidade: { type: 'string', example: 'São Paulo' },
            estado: { type: 'string', minLength: 2, maxLength: 2, example: 'SP' },
            cep: { type: 'string', example: '01310100', description: '8 dígitos' },
            data_nascimento: { type: 'string', format: 'date', example: '1990-05-15' },
            mentor_id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['ATIVO', 'PAUSADO', 'CONCLUIDO'], default: 'ATIVO' },
            observacoes: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Sessao: {
          type: 'object',
          required: ['cliente_id', 'mentor_id', 'tipo_sessao', 'data', 'horario', 'duracao_minutos', 'modalidade', 'titulo', 'descricao'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            cliente_id: { type: 'string', format: 'uuid' },
            mentor_id: { type: 'string', format: 'uuid' },
            tipo_sessao: { type: 'string', enum: ['MENTORIA', 'COACHING'] },
            data: { type: 'string', format: 'date', example: '2025-01-26' },
            horario: { type: 'string', pattern: '^[0-9]{2}:[0-9]{2}$', example: '14:00' },
            duracao_minutos: { type: 'integer', example: 60 },
            modalidade: { type: 'string', enum: ['ONLINE', 'PRESENCIAL'] },
            plataforma: { type: 'string', example: 'Zoom' },
            link_sessao: { type: 'string', format: 'uri', example: 'https://zoom.us/j/1234567890', description: 'Obrigatório se ONLINE' },
            titulo: { type: 'string', example: 'Sessão de Mentoria - Q1 2025' },
            descricao: { type: 'string', example: 'Planejamento estratégico' },
            notas_internas: { type: 'string', description: 'Notas privadas do mentor' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Receita: {
          type: 'object',
          required: ['tipo', 'categoria', 'data', 'valor', 'metodo_pagamento', 'id_fatura'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            tipo: { type: 'string', enum: ['FIXO', 'VARIAVEL'] },
            categoria: { type: 'string', enum: ['CONSULTORIA', 'MENTORIA', 'COACHING', 'OUTROS'] },
            cliente_id: { type: 'string', format: 'uuid', nullable: true },
            data: { type: 'string', format: 'date', example: '2025-01-26' },
            valor: { type: 'number', format: 'double', example: 2500.00 },
            metodo_pagamento: { type: 'string', enum: ['BOLETO', 'CARTAO', 'TRANSFERENCIA', 'PIX'] },
            status: { type: 'string', enum: ['PENDENTE', 'CONFIRMADO'], default: 'PENDENTE' },
            parcelado: { type: 'boolean', default: false },
            parcelas: { type: 'string', pattern: '^[0-9]+/[0-9]+$', example: '3/12', description: 'Formato: n/N (obrigatório se parcelado)' },
            id_fatura: { type: 'string', example: 'FAT-2025-001' },
            id_contrato: { type: 'string', example: 'CONT-2025-001' },
            observacoes: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Despesa: {
          type: 'object',
          required: ['data', 'tipo', 'categoria', 'descricao', 'valor', 'metodo_pagamento', 'id_fatura'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            data: { type: 'string', format: 'date', example: '2025-01-26' },
            tipo: { type: 'string', enum: ['FIXO', 'VARIAVEL'] },
            categoria: { type: 'string', enum: ['MARKETING', 'SOFTWARE', 'ESCRITORIO', 'OUTROS'] },
            descricao: { type: 'string', example: 'Assinatura Zoom Pro' },
            valor: { type: 'number', format: 'double', example: 79.90 },
            metodo_pagamento: { type: 'string', enum: ['BOLETO', 'CARTAO', 'TRANSFERENCIA', 'PIX'] },
            status: { type: 'string', enum: ['PAGO', 'PENDENTE'], default: 'PENDENTE' },
            parcelado: { type: 'boolean', default: false },
            parcelas: { type: 'string', pattern: '^[0-9]+/[0-9]+$', example: '3/12', description: 'Obrigatório se parcelado' },
            recorrente: { type: 'boolean', default: false },
            id_fatura: { type: 'string', example: 'DESP-2025-001' },
            observacoes: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        KPIs: {
          type: 'object',
          properties: {
            receita_total: { type: 'number', example: 125000.00 },
            despesa_total: { type: 'number', example: 45000.00 },
            lucro_liquido: { type: 'number', example: 80000.00 },
            clientes_ativos: { type: 'integer', example: 45 },
            roi: { type: 'number', example: 177.78, description: 'Retorno sobre Investimento (%)' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string', example: 'Dados inválidos' },
            details: { type: 'object' }
          }
        }
      }
    },
    tags: [
      { name: 'Auth', description: 'Autenticação e autorização' },
      { name: 'Clientes', description: 'Gestão de clientes' },
      { name: 'Sessões', description: 'Gestão de sessões de mentoria/coaching' },
      { name: 'Receitas', description: 'Gestão de receitas' },
      { name: 'Despesas', description: 'Gestão de despesas' },
      { name: 'Relatórios', description: 'KPIs e relatórios financeiros' },
      { name: 'Health', description: 'Status da API' }
    ]
  },
  apis: ['./src/modules/*/*.routes.ts', './src/server.ts']
};

export const swaggerSpec = swaggerJsdoc(options);
