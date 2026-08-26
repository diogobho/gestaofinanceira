import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import fs from 'fs';
import path from 'path';
import { suporteService, StatusTicket, ErroValidacao } from './suporte.service';

const STATUS_VALIDOS: StatusTicket[] = ['aberto', 'aguardando_cliente', 'aguardando_suporte', 'resolvido', 'fechado'];

/**
 * Quem atende: hoje só o super_admin da DuoFuturo.
 *
 * Está isolado nesta função de propósito. Quando existirem papéis de suporte
 * (atendente, gestor), o que muda é o corpo daqui — nenhuma rota precisa saber
 * COMO se decide quem atende, só perguntar.
 */
function ehSuporte(req: AuthRequest): boolean {
  return req.user?.nivel === 'super_admin';
}

/**
 * Escopo de leitura de UM chamado.
 *
 * Atendente (Central) lê qualquer um. Cliente lê só o que ele mesmo abriu — o par
 * empresa+usuário. Antes o recorte era só por empresa, então trocar o id na URL
 * dava acesso ao chamado de um colega da mesma empresa.
 */
function escopo(req: AuthRequest): [number | undefined, number | undefined] {
  if (ehSuporte(req)) return [undefined, undefined];
  return [req.user?.empresa_id, req.user?.userId || req.user?.id];
}

/**
 * Erro do cliente vs. erro nosso.
 *
 * Antes todo `catch` devolvia `error.message` com 400 — inclusive mensagem de
 * driver do Postgres. Um `42P08 inconsistent types deduced for parameter $2`
 * chegou a ser a resposta visível de "marcar como resolvido". Texto interno não
 * é assunto de cliente: só `ErroValidacao` atravessa; o resto vira 500 genérico
 * e o detalhe fica no log do servidor.
 */
function responderErro(res: Response, erro: any, contexto: string) {
  if (erro instanceof ErroValidacao) {
    return res.status(400).json({ message: erro.message });
  }
  console.error(`[suporte] falha inesperada em ${contexto} —`, erro?.message || erro);
  return res.status(500).json({ message: 'Não foi possível concluir a operação. Tente de novo em instantes.' });
}

export const suporteController = {
  async criar(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      const usuarioId = req.user?.userId || req.user?.id;
      if (!empresaId || !usuarioId) return res.status(401).json({ message: 'Não autenticado' });

      const { assunto, categoria, prioridade, mensagem, email_contato } = req.body;
      const ticket = await suporteService.criar({
        empresaId,
        usuarioId,
        assunto,
        categoria,
        prioridade,
        mensagem,
        emailContato: email_contato,
      });
      return res.status(201).json({ ticket });
    } catch (error: any) {
      return responderErro(res, error, 'criar');
    }
  },

  async listar(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      const usuarioId = req.user?.userId || req.user?.id;
      if (!empresaId || !usuarioId) return res.status(401).json({ message: 'Não autenticado' });

      const tickets = await suporteService.listar({
        empresaId,
        usuarioId,
        todos: ehSuporte(req),
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
      });
      return res.json({ tickets, atendente: ehSuporte(req) });
    } catch (error: any) {
      return responderErro(res, error, 'listar');
    }
  },

  async detalhe(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      if (!empresaId) return res.status(401).json({ message: 'Não autenticado' });

      // O atendente enxerga qualquer empresa; o cliente, só a dele — o filtro
      // por empresa é o que impede ler o chamado de outro cliente pelo id.
      const [escEmpresa, escUsuario] = escopo(req);
      const ticket = await suporteService.getById(Number(req.params.id), escEmpresa, escUsuario);
      if (!ticket) return res.status(404).json({ message: 'Chamado não encontrado' });

      const mensagens = await suporteService.getMensagens(ticket.id, escEmpresa);
      return res.json({ ticket, mensagens, atendente: ehSuporte(req) });
    } catch (error: any) {
      return responderErro(res, error, 'detalhe');
    }
  },

  async responder(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      const usuarioId = req.user?.userId || req.user?.id;
      if (!empresaId || !usuarioId) return res.status(401).json({ message: 'Não autenticado' });

      const atendente = ehSuporte(req);
      const [escEmpresa, escUsuario] = escopo(req);
      const ticket = await suporteService.getById(Number(req.params.id), escEmpresa, escUsuario);
      if (!ticket) return res.status(404).json({ message: 'Chamado não encontrado' });

      const anexoIds = Array.isArray(req.body.anexo_ids)
        ? req.body.anexo_ids.map(Number).filter(Number.isInteger)
        : undefined;

      // Nota interna é exclusiva de quem atende — e não muda o status do chamado
      // nem avisa o cliente. Um cliente pedindo `interna: true` é ignorado.
      if (atendente && req.body.interna === true) {
        const nota = await suporteService.notaInterna(ticket.id, usuarioId, req.body.conteudo);
        return res.status(201).json({ mensagem: nota });
      }

      const mensagem = atendente
        ? await suporteService.responderComoSuporte(ticket.id, usuarioId, req.body.conteudo, anexoIds)
        : await suporteService.responderComoCliente(ticket.id, usuarioId, req.body.conteudo, anexoIds);

      return res.status(201).json({ mensagem });
    } catch (error: any) {
      return responderErro(res, error, 'responder');
    }
  },

  async alterarStatus(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      if (!empresaId) return res.status(401).json({ message: 'Não autenticado' });

      const status = req.body.status as StatusTicket;
      if (!STATUS_VALIDOS.includes(status)) {
        return res.status(400).json({ message: 'Status inválido' });
      }
      // O cliente pode dar por resolvido ou reabrir o próprio chamado; fechar de
      // vez é do atendente, para ninguém encerrar um caso que ainda está em pé.
      if (!ehSuporte(req) && status === 'fechado') {
        return res.status(403).json({ message: 'Só a equipe de suporte fecha um chamado' });
      }

      const [escEmpresa, escUsuario] = escopo(req);
      const ticket = await suporteService.getById(Number(req.params.id), escEmpresa, escUsuario);
      if (!ticket) return res.status(404).json({ message: 'Chamado não encontrado' });

      const atualizado = await suporteService.alterarStatus(ticket.id, status, escEmpresa, req.user?.userId || req.user?.id);
      return res.json({ ticket: atualizado });
    } catch (error: any) {
      return responderErro(res, error, 'alterarStatus');
    }
  },

  /** Prioridade é da equipe. Cliente não altera (ver `criar` no service). */
  async alterarPrioridade(req: AuthRequest, res: Response) {
    try {
      const usuarioId = req.user?.userId || req.user?.id;
      if (!usuarioId) return res.status(401).json({ message: 'Não autenticado' });
      if (!ehSuporte(req)) {
        return res.status(403).json({ message: 'Só a equipe de suporte altera a prioridade' });
      }
      const ticket = await suporteService.alterarPrioridade(
        Number(req.params.id), String(req.body.prioridade), usuarioId
      );
      return res.json({ ticket });
    } catch (error: any) {
      return responderErro(res, error, 'alterarPrioridade');
    }
  },

  /**
   * Upload de anexo. As validações da premissa 2, em ordem de custo:
   * autorização → tamanho → extensão → MIME declarado → ASSINATURA do conteúdo.
   *
   * A checagem de assinatura existe porque MIME e extensão são AFIRMAÇÕES do
   * cliente: `curl -F "file=@shell.sh;type=image/png"` passa nas duas. Só os
   * primeiros bytes dizem o que o arquivo é de fato.
   */
  async uploadAnexo(req: AuthRequest, res: Response) {
    const arquivo = (req as any).file;
    const limpar = () => { if (arquivo?.path) fs.promises.unlink(arquivo.path).catch(() => {}); };
    try {
      const empresaId = req.user?.empresa_id;
      const usuarioId = req.user?.userId || req.user?.id;
      if (!empresaId || !usuarioId) { limpar(); return res.status(401).json({ message: 'Não autenticado' }); }
      if (!arquivo) return res.status(400).json({ message: 'Nenhum arquivo enviado' });

      // O anexo pertence a um chamado, e o chamado tem de ser acessível a quem sobe.
      const [escEmpresa, escUsuario] = escopo(req);
      const ticket = await suporteService.getById(Number(req.params.id), escEmpresa, escUsuario);
      if (!ticket) { limpar(); return res.status(404).json({ message: 'Chamado não encontrado' }); }

      const validacao = await suporteService.validarArquivoAnexo(arquivo);
      if (!validacao.ok) { limpar(); return res.status(400).json({ message: validacao.erro }); }

      const anexo = await suporteService.moverERegistrarAnexo({
        ticketId: ticket.id,
        empresaId: ticket.empresa_id,
        usuarioId,
        arquivoTemporario: arquivo.path,
        nomeOriginal: arquivo.originalname,
        mimetype: validacao.mimetype!,
        tamanhoBytes: arquivo.size,
      });
      return res.status(201).json({ anexo });
    } catch (error: any) {
      limpar();
      return responderErro(res, error, 'uploadAnexo');
    } finally {
      // O arquivo já foi COPIADO para o destino; o temporário do multer sai sempre.
      limpar();
    }
  },

  /** Download de anexo, autorizado pela empresa do chamado. */
  async baixarAnexo(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      if (!empresaId) return res.status(401).json({ message: 'Não autenticado' });

      const anexo = await suporteService.getAnexoParaDownload(
        Number(req.params.anexoId),
        ehSuporte(req) ? undefined : empresaId
      );
      // 404 e não 403: "existe mas não é seu" já conta algo sobre o outro cliente.
      if (!anexo) return res.status(404).json({ message: 'Anexo não encontrado' });

      const absoluto = suporteService.caminhoAbsolutoAnexo(anexo.caminho);
      if (!absoluto || !fs.existsSync(absoluto)) {
        return res.status(404).json({ message: 'Arquivo não encontrado' });
      }
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Type', anexo.mimetype);
      // `inline` para o print abrir na aba; o nome vai entre aspas porque pode ter
      // espaço. Sem `filename`, o navegador salvaria com o UUID.
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(anexo.nome_original).replace(/"/g, '')}"`);
      return res.sendFile(absoluto);
    } catch (error: any) {
      return responderErro(res, error, 'baixarAnexo');
    }
  },

  /** Sugestão da IA para o ATENDENTE. Não envia nada ao cliente. */
  async sugestaoIA(req: AuthRequest, res: Response) {
    try {
      if (!ehSuporte(req)) {
        return res.status(403).json({ message: 'Recurso da equipe de suporte' });
      }
      const sugestao = await suporteService.sugestaoParaAtendente(Number(req.params.id));
      return res.json(sugestao);
    } catch (error: any) {
      return responderErro(res, error, 'sugestaoIA');
    }
  },

  /** Métricas: consolidado para a equipe, recorte da empresa para o cliente. */
  async metricas(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      if (!empresaId) return res.status(401).json({ message: 'Não autenticado' });
      const dados = await suporteService.metricas(ehSuporte(req) ? undefined : empresaId);
      return res.json({ ...dados, atendente: ehSuporte(req) });
    } catch (error: any) {
      return responderErro(res, error, 'metricas');
    }
  },
};
