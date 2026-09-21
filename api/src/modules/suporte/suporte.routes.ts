import { Router } from 'express';
import multer from 'multer';
import { authRequired, authRequiredOuTokenNaQuery } from '../../middlewares/auth.middleware';
import { suporteController } from './suporte.controller';

/**
 * Upload de anexo de chamado.
 *
 * O multer só faz a primeira barreira (tamanho e MIME declarado). A validação que
 * decide é a do controller/service, que lê a ASSINATURA do arquivo — MIME e
 * extensão são afirmações de quem envia e passam com um `curl` bem montado.
 *
 * `limits.files: 1` é proposital: um anexo por requisição mantém a mensagem de
 * erro específica ("este arquivo é grande demais") em vez de genérica.
 */
const upload = multer({
  dest: '/tmp/suporte-uploads/',
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const aceitos = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
    if (aceitos.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Envie imagem (PNG, JPG, WEBP, GIF) ou PDF'));
  },
});

const router = Router();

// Métricas antes de `/tickets/:id` para o Express não ler "metricas" como um id.
router.get('/suporte/metricas', authRequired, suporteController.metricas);

router.get('/suporte/tickets', authRequired, suporteController.listar);
router.post('/suporte/tickets', authRequired, suporteController.criar);
router.get('/suporte/tickets/:id', authRequired, suporteController.detalhe);
router.post('/suporte/tickets/:id/mensagens', authRequired, suporteController.responder);
router.patch('/suporte/tickets/:id/status', authRequired, suporteController.alterarStatus);
router.patch('/suporte/tickets/:id/prioridade', authRequired, suporteController.alterarPrioridade);

// Anexos: sobe no contexto do chamado, baixa pelo id do anexo.
router.post('/suporte/tickets/:id/anexos', authRequired, upload.single('file'), suporteController.uploadAnexo);
// `authRequiredOuTokenNaQuery`: o print é renderizado por `<img src>`, que não
// manda header. Mesma razão da rota de mídia do WhatsApp.
router.get('/suporte/anexos/:anexoId', authRequiredOuTokenNaQuery, suporteController.baixarAnexo);

export default router;
