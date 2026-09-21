import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { JwtPayload } from '../../config/jwt';
import { whatsappProvisionService } from '../../services/whatsapp-provision.service';
import { portaParaUsuarioNovo } from '../whatsapp/canal/contas';
import { assinaturasService } from '../assinaturas/assinaturas.service';
import { isAdminEmpresa, isSuperAdmin, rankTipo, TIPOS_VALIDOS } from '../../shared/roles';

// Permissões padrão — alinhadas às seções atuais do sistema (o módulo
// 'relatorios' foi removido; 'agente' = Agente IA). Deve espelhar o
// PERMISSOES_PJ / UserPermissoes do frontend (admin/UserManagement.tsx).
const DEFAULT_PERMISSOES = {
  dashboard: true,
  crm: true,
  clientes: true,
  receitas: true,
  despesas: true,
  parcelas: true,
  sessoes: true,
  whatsapp: true,
  agente: true
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

/**
 * Barra a ação que deixaria a empresa sem NENHUM administrador ativo (master ou
 * creator) — seja rebaixando o último, seja desativando-o. Sem isso a conta ficaria
 * inadministrável: ninguém para gerir usuários nem para configurar o agente, e só o
 * super_admin poderia destravar.
 * Não se aplica a quem já é comum: tirar um comum nunca afeta a administração.
 */
async function garantirAdminRemanescente(target: any, mensagem: string) {
  if (target.tipo_usuario === 'comum') return;
  const outros = await query(
    `SELECT COUNT(*)::int AS total FROM usuarios
     WHERE empresa_id = $1 AND tipo_usuario <> 'comum' AND ativo = true AND id != $2`,
    [target.empresa_id, target.id]
  );
  if (outros.rows[0].total === 0) throw new Error(mensagem);
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

    if (isAdminEmpresa(caller)) {
      // Master e creator veem apenas usuários da sua empresa
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

    // Master/creator só podem ver usuários da sua empresa
    if (caller && !isSuperAdmin(caller) && isAdminEmpresa(caller)) {
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
    } else if (isAdminEmpresa(caller)) {
      // Master e creator criam Comum apenas na sua empresa; promover para master ou
      // creator é feito depois, pela edição (que valida a hierarquia).
      data.empresa_id = caller.empresa_id;
      data.tipo_usuario = 'comum';
      data.nivel = 'usuario';
    } else {
      throw new Error('Sem permissão para criar usuários');
    }

    // Limite de usuários do plano. O super_admin passa direto: é ele quem provisiona
    // empresa e master, e travá-lo impediria criar a primeira conta de um cliente novo.
    if (caller.nivel !== 'super_admin') {
      const { limite, emUso } = await assinaturasService.getLimiteUsuarios(data.empresa_id);
      if (limite != null && emUso >= limite) {
        throw new Error(
          `Limite de ${limite} usuários atingido no seu plano. ` +
          `Aumente a quantidade de usuários em "Minha Conta" para adicionar mais.`
        );
      }
    }

    // E-mail duplicado → mensagem amigável em vez de erro 500 do constraint
    const emailExistente = await query('SELECT id FROM usuarios WHERE email = $1', [data.email]);
    if (emailExistente.rows.length > 0) {
      throw new Error('Este e-mail já está cadastrado');
    }

    validarSenha(data.senha);
    const senhaHash = await bcrypt.hash(data.senha, 10);

    // Permissões: master/creator têm todas, comum recebe as definidas (ou default)
    const permissoes = data.tipo_usuario === 'comum'
      ? (data.permissoes || DEFAULT_PERMISSOES)
      : DEFAULT_PERMISSOES;

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

    // Empresa no número oficial: o usuário novo entra direto nele (porta virtual),
    // sem instância nem QR Code — ver whatsapp/canal/contas.ts.
    const portaOficial = await portaParaUsuarioNovo(novoUsuario.empresa_id);
    if (portaOficial) {
      await query('UPDATE usuarios SET whatsapp_porta = $1 WHERE id = $2', [portaOficial, novoUsuario.id]);
      novoUsuario.whatsapp_porta = portaOficial;
      return novoUsuario;
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
    } else if (isAdminEmpresa(caller)) {
      // Master/creator só podem editar usuários da sua empresa
      if (target.empresa_id !== caller.empresa_id) {
        throw new Error('Sem permissão para editar este usuário');
      }
      // O administrador do SISTEMA nunca é editável daqui: ele tem empresa_id (hoje a 1)
      // e aparece na lista daquela empresa — sem esta trava, o master de lá poderia
      // rebaixá-lo ou desativá-lo.
      if (isSuperAdmin(target)) {
        throw new Error('Sem permissão para editar este usuário');
      }
      // Ninguém mexe em quem está acima: um master não edita o creator (o dono).
      if (rankTipo(target.tipo_usuario) > rankTipo(caller.tipo_usuario)) {
        throw new Error('Sem permissão para editar o usuário creator (dono da empresa)');
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
    // Tipo de usuário: o super_admin troca em qualquer conta; master e creator trocam
    // dentro da própria empresa (já validado acima), com três travas — ninguém promove
    // acima do próprio papel (um master não cria um creator), ninguém mexe no próprio
    // tipo (se rebaixasse a si mesmo perderia o acesso a /admin e ninguém desfaria) e a
    // empresa nunca fica sem administrador ativo.
    // O tipo viaja no JWT (8h, sem refresh): para o usuário alterado a mudança só vale
    // no próximo login.
    if (data.tipo_usuario && data.tipo_usuario !== target.tipo_usuario) {
      if (!TIPOS_VALIDOS.includes(data.tipo_usuario)) {
        throw new Error('Tipo de usuário inválido');
      }
      if (!isSuperAdmin(caller)) {
        if (rankTipo(data.tipo_usuario) > rankTipo(caller.tipo_usuario)) {
          throw new Error('Apenas o creator (dono da empresa) pode definir outro usuário como creator');
        }
        if (Number(target.id) === Number(caller.userId)) {
          throw new Error('Você não pode alterar o seu próprio tipo de usuário');
        }
        await garantirAdminRemanescente(target, 'A empresa precisa de pelo menos um usuário master ou creator ativo');
      }

      fields.push(`tipo_usuario = $${paramCount}`);
      values.push(data.tipo_usuario);
      paramCount++;

      // Master/creator têm acesso a tudo (é o que o create já faz). Promover sem abrir
      // as permissões deixaria um administrador com módulos bloqueados no menu.
      // Só quando o payload não traz permissões próprias — senão a UPDATE teria duas
      // atribuições para a mesma coluna.
      if (data.tipo_usuario !== 'comum' && data.permissoes === undefined) {
        fields.push(`permissoes = $${paramCount}`);
        values.push(JSON.stringify(DEFAULT_PERMISSOES));
        paramCount++;
      }
    }
    if (data.ativo !== undefined) {
      // Desativar tem o mesmo efeito prático de rebaixar: aplica as mesmas travas de
      // auto-bloqueio e de "último master" (a lista da tela agora mostra o botão nas
      // linhas de master, e a rota é acessível a qualquer master).
      if (data.ativo === false && !isSuperAdmin(caller)) {
        if (Number(target.id) === Number(caller.userId)) {
          throw new Error('Você não pode desativar a sua própria conta');
        }
        await garantirAdminRemanescente(target, 'A empresa precisa de pelo menos um usuário master ou creator ativo');
      }
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

    // Apenas quem administra a empresa pode editar permissões
    if (!isAdminEmpresa(caller)) {
      throw new Error('Sem permissão para editar permissões');
    }

    // Master/creator só editam permissões de usuários da sua empresa
    if (!isSuperAdmin(caller) && target.empresa_id !== caller.empresa_id) {
      throw new Error('Sem permissão para editar permissões deste usuário');
    }

    // Master e creator têm todos os módulos por definição — restringir um deles pela
    // tela de permissões só criaria um administrador com o menu quebrado.
    if (target.tipo_usuario !== 'comum' && !isSuperAdmin(caller)) {
      throw new Error('Usuários master e creator têm acesso a todos os módulos');
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
    } else if (isAdminEmpresa(caller)) {
      // Só dá para deletar quem está ABAIXO na hierarquia: master apaga comum, creator
      // apaga comum e master. Ninguém apaga um par nem quem está acima — para isso,
      // rebaixe primeiro (o que já obedece às travas de tipo).
      if (target.empresa_id !== caller.empresa_id) {
        throw new Error('Sem permissão para deletar este usuário');
      }
      if (rankTipo(target.tipo_usuario) >= rankTipo(caller.tipo_usuario)) {
        throw new Error(`Sem permissão para deletar um usuário ${target.tipo_usuario}`);
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
