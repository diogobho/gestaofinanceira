import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { contatosController } from './contatos.controller';

const upload = multer({
  dest: '/tmp/crm-uploads/',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
      'video/mp4', 'video/webm',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo nao permitido: ${file.mimetype}`));
    }
  }
});

const router = Router();

router.get('/contatos', contatosController.list);
router.get('/contatos/nao-convertidos', contatosController.listNaoConvertidos);
router.get('/contatos/grupos', contatosController.getGrupos);
router.get('/contatos/grupos/:groupId/participantes', contatosController.getParticipantesGrupo);
router.post('/contatos/grupos/:groupId/importar', contatosController.importarParticipantesComoLeads);
router.get('/contatos/:id', contatosController.getById);
router.get('/contatos/:id/historico', contatosController.getHistorico);
router.post('/contatos/sincronizar', contatosController.sincronizar);
router.post('/contatos/:id/mensagem', contatosController.enviarMensagem);
router.post('/contatos/:id/media', upload.single('file'), contatosController.enviarMedia);
router.post('/contatos/:id/marcar-lido', contatosController.marcarLido);
router.post('/contatos/registrar-webhook', contatosController.registrarWebhook);

export default router;
