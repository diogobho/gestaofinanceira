import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { JwtPayload } from '../../config/jwt';
import { whatsappProvisionService } from '../../services/whatsapp-provision.service';

const DEFAULT_PERMISSOES = {
  dashboard: true,
  crm: true,
  clientes: true,
  receitas: true,
  despesas: true,
  parcelas: true,
  sessoes: true,
  whatsapp: true,
  relatorios: true
};

function validarSenha(senha: string) {
  if (!senha || senha.length < 8) {
    throw new Error('A senha deve ter no mínimo 8 caracteres');
  }
  if (!/[A-Za-z]/.test(senha)) {
    throw new Error('A senha deve conter pelo menos uma letra');
  }
  if (!/[0-9]/.test(senha)) {
    throw new Error('A senha deve conter pelo menos um número');
  }
}

export const usuariosService = {
  // Lista usuários de acordo com o nível do caller
  async list(caller: JwtPayload) {
    if (caller.nivel === 'super_admin') {
      // Admin vê todos os usuários com info da empresa
      const result = await query(
        `SELECT u.id, u.nome, u.email, u.empresa_id, u.nivel, u.tipo_usuario, u.permissoes, u.ativo, u.created_at,
                e.nome as empresa_nome
         FROM usuarios u
         LEFT JOIN empresas e ON u.empresa_id = e.id
         ORDER BY u.created_at DESC`
      );
      return result.rows;
    }

    if (caller.tipo_usuario === 'master') {
      // Master vê apenas usuários da sua empresa
      const result = await query(
        `SELECT u.id, u.nome, u.email, u.empresa_id, u.nivel, u.tipo_usuario, u.permissoes, u.ativo, u.created_at,
                e.nome as empresa_nome
         FROM usuarios u
         LEFT JOIN empresas e ON u.empresa_id = e.id
         WHERE u.empresa_id = $1
         ORDER BY u.created_at DESC`,
        [caller.empresa_id]
      );
      return result.rows;
    }

    throw new Error('Sem permissão para listar usuários');
  },

  // Lista usuários ativos da empresa do caller (para seleção de responsáveis)
  async listByEmpresa(empresaId: number) {
    const result = await query(
      `SELECT id, nome, email, empresa_id, tipo_usuario, ativo
       FROM usuarios
       WHERE empresa_id = $1 AND ativo = true
       ORDER BY nome ASC`,
      [empresaId]
    );
    return result.rows;
  },

  async getById(id: string, caller?: JwtPayload) {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.empresa_id, u.nivel, u.tipo_usuario, u.permissoes, u.ativo, u.created_at,
              e.nome as empresa_nome
       FROM usuarios u
       LEFT JOIN empresas e ON u.empresa_id = e.id
       WHERE u.id = $1`,
      [id]
    );
    if (result.rows.length === 0) throw new Error('Usuário não encontrado');

    const user = result.rows[0];

    // Master só pode ver usuários da sua empresa
    if (caller && caller.nivel !== 'super_admin' && caller.tipo_usuario === 'master') {
      if (user.empresa_id !== caller.empresa_id) {
        throw new Error('Sem permissão para ver este usuário');
      }
    }

    return user;
  },

  async create(data: any, caller: JwtPayload) {
    // Validar hierarquia de criação
    if (caller.nivel === 'super_admin') {
      // Admin pode criar Master (deve informar empresa_id)
      if (!data.empresa_id) {
        throw new Error('É obrigatório informar a empresa ao criar um usuário');
      }
      // Admin pode definir tipo_usuario livremente
      data.tipo_usuario = data.tipo_usuario || 'master';
      data.nivel = 'usuario'; // Sempre usuario no DB (super_admin é só para o admin do sistema)
    } else if (caller.tipo_usuario === 'master') {
      // Master cria Comum apenas na sua empresa
      data.empresa_id = caller.empresa_id;
      data.tipo_usuario = 'comum';
      data.nivel = 'usuario';
    } else {
      throw new Error('Sem permissão para criar usuários');
    }

    // E-mail duplicado → mensagem amigável em vez de erro 500 do constraint
    const emailExistente = await query('SELECT id FROM usuarios WHERE email = $1', [data.email]);
    if (emailExistente.rows.length > 0) {
      throw new Error('Este e-mail já está cadastrado');
    }

    validarSenha(data.senha);
    const senhaHash = await bcrypt.hash(data.senha, 10);

    // Permissões: master tem todas, comum recebe as definidas (ou default)
    const permissoes = data.tipo_usuario === 'master'
      ? DEFAULT_PERMISSOES
      : (data.permissoes || DEFAULT_PERMISSOES);

    const result = await query(
      `INSERT INTO usuarios (
        nome, email, senha, empresa_id, nivel, tipo_usuario, permissoes, ativo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, nome, email, empresa_id, nivel, tipo_usuario, permissoes, ativo, created_at`,
      [
        data.nome,
        data.email,
        senhaHash,
        data.empresa_id,
        data.nivel,
        data.tipo_usuario,
        JSON.stringify(permissoes),
        data.ativo !== undefined ? data.ativo : true
      ]
    );

    const novoUsuario = result.rows[0];

    // Semear categorias padrão da empresa (PJ)
    if (novoUsuario.empresa_id) {
      await query('SELECT seed_categorias_pj($1)', [novoUsuario.id]);
    }

    // Provisionar instância WhatsApp automaticamente
    try {
      const porta = await whatsappProvisionService.criarInstancia(novoUsuario.id);
      novoUsuario.whatsapp_porta = porta;
      console.log(`[Usuário] WhatsApp provisionado na porta ${porta} para usuário ${novoUsuario.id}`);
    } catch (err: any) {
      console.error(`[Usuário] Falha ao provisionar WhatsApp para usuário ${novoUsuario.id}:`, err.message);
      // Não bloqueia a criação do usuário
    }

    return novoUsuario;
  },

  async update(id: string, data: any, caller: JwtPayload) {
    // Verificar permissão
    const target = await this.getById(id);

    if (caller.nivel === 'super_admin') {
      // Admin pode editar qualquer usuário
    } else if (caller.tipo_usuario === 'master') {
      // Master só pode editar usuários da sua empresa
      if (target.empresa_id !== caller.empresa_id) {
        throw new Error('Sem permissão para editar este usuário');
      }
      // Master não pode mudar tipo_usuario para master
      if (data.tipo_usuario === 'master' && target.tipo_usuario !== 'master') {
        throw new Error('Apenas o administrador do sistema pode criar usuários master');
      }
    } else {
      throw new Error('Sem permissão para editar usuários');
    }

    // E-mail duplicado (de outro usuário) → mensagem amigável
    if (data.email && data.email !== target.email) {
      const emailExistente = await query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [data.email, id]);
      if (emailExistente.rows.length > 0) {
        throw new Error('Este e-mail já está em uso por outro usuário');
      }
    }

    const fields = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.nome) {
      fields.push(`nome = $${paramCount}`);
      values.push(data.nome);
      paramCount++;
    }
    if (data.email) {
      fields.push(`email = $${paramCount}`);
      values.push(data.email);
      paramCount++;
    }
    if (data.empresa_id !== undefined && caller.nivel === 'super_admin') {
      fields.push(`empresa_id = $${paramCount}`);
      values.push(data.empresa_id);
      paramCount++;
    }
    if (data.tipo_usuario && caller.nivel === 'super_admin') {
      fields.push(`tipo_usuario = $${paramCount}`);
      values.push(data.tipo_usuario);
      paramCount++;
    }
    if (data.ativo !== undefined) {
      fields.push(`ativo = $${paramCount}`);
      values.push(data.ativo);
      paramCount++;
    }
    if (data.permissoes !== undefined) {
      fields.push(`permissoes = $${paramCount}`);
      values.push(JSON.stringify(data.permissoes));
      paramCount++;
    }
    if (data.senha) {
      validarSenha(data.senha);
      const senhaHash = await bcrypt.hash(data.senha, 10);
      fields.push(`senha = $${paramCount}`);
      values.push(senhaHash);
      paramCount++;
    }

    if (fields.length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    values.push(id);

    const result = await query(
      `UPDATE usuarios SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, nome, email, empresa_id, nivel, tipo_usuario, permissoes, ativo, created_at`,
      values
    );

    if (result.rows.length === 0) throw new Error('Usuário não encontrado');
    return result.rows[0];
  },

  async updatePermissoes(id: string, permissoes: Record<string, boolean>, caller: JwtPayload) {
    const target = await this.getById(id);

    // Apenas master/admin pode editar permissões
    if (caller.nivel !== 'super_admin' && caller.tipo_usuario !== 'master') {
      throw new Error('Sem permissão para editar permissões');
    }

    // Master só pode editar permissões de usuários da sua empresa
    if (caller.nivel !== 'super_admin' && target.empresa_id !== caller.empresa_id) {
      throw new Error('Sem permissão para editar permissões deste usuário');
    }

    // Não pode editar permissões de outro master (apenas admin pode)
    if (target.tipo_usuario === 'master' && caller.nivel !== 'super_admin') {
      throw new Error('Apenas o administrador pode editar permissões de usuários master');
    }

    const result = await query(
      `UPDATE usuarios SET permissoes = $1
       WHERE id = $2
       RETURNING id, nome, email, empresa_id, nivel, tipo_usuario, permissoes, ativo`,
      [JSON.stringify(permissoes), id]
    );

    if (result.rows.length === 0) throw new Error('Usuário não encontrado');
    return result.rows[0];
  },

  async delete(id: string, caller: JwtPayload) {
    const target = await this.getById(id);

    if (caller.nivel === 'super_admin') {
      // Admin pode deletar qualquer um (exceto a si mesmo)
      if (target.id === caller.userId) {
        throw new Error('Não é possível deletar seu próprio usuário');
      }
    } else if (caller.tipo_usuario === 'master') {
      // Master só pode deletar Comum da sua empresa
      if (target.empresa_id !== caller.empresa_id) {
        throw new Error('Sem permissão para deletar este usuário');
      }
      if (target.tipo_usuario === 'master') {
        throw new Error('Apenas o administrador pode deletar usuários master');
      }
    } else {
      throw new Error('Sem permissão para deletar usuários');
    }

    const result = await query('DELETE FROM usuarios WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new Error('Usuário não encontrado');
    return { message: 'Usuário deletado com sucesso' };
  },

  // Listar empresas (para admin ao criar master)
  async listEmpresas() {
    const result = await query(`
      SELECT e.id, e.nome, e.slug, e.ativo,
             a.status as assinatura_status, a.plano_ativo_ate, a.trial_expira_em
      FROM empresas e
      LEFT JOIN assinaturas a ON a.empresa_id = e.id
      WHERE e.ativo = true
      ORDER BY e.nome
    `);
    return result.rows;
  },

  // Criar nova empresa (apenas super_admin)
  async createEmpresa(nome: string, caller: JwtPayload) {
    if (caller.nivel !== 'super_admin') {
      throw new Error('Apenas administradores podem criar empresas');
    }

    if (!nome || nome.trim().length < 2) {
      throw new Error('Nome da empresa deve ter pelo menos 2 caracteres');
    }

    // Gerar slug a partir do nome
    const slug = nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Verificar se slug já existe
    const existing = await query('SELECT id FROM empresas WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      throw new Error('Já existe uma empresa com nome similar');
    }

    const result = await query(
      `INSERT INTO empresas (nome, slug, ativo) VALUES ($1, $2, true)
       RETURNING id, nome, slug, ativo`,
      [nome.trim(), slug]
    );

    return result.rows[0];
  }
};
