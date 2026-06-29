import { Router } from 'express';
import multer from 'multer';
import { leadsController } from './leads.controller';

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

// Rotas aninhadas em /funis/:funilId/leads
router.get('/funis/:funilId/leads', leadsController.listByFunil);

// Load more por estágio (paginação)
router.get('/estagios/:estagioId/leads', leadsController.listByEstagio);

// Rotas diretas em /leads (estáticas antes das parametrizadas)
router.get('/leads/origens', leadsController.getOrigens);
router.get('/leads/verificar-duplicata', leadsController.verificarDuplicata);
router.get('/leads/:id', leadsController.getById);
router.get('/leads/:id/atividades', leadsController.getAtividades);
router.post('/leads', leadsController.create);
router.post('/leads/do-whatsapp', leadsController.createFromWhatsApp);
router.put('/leads/:id', leadsController.update);
router.put('/leads/:id/mover', leadsController.mover);
router.put('/leads/:id/transferir-funil', leadsController.transferirFunil);
router.put('/leads/:id/arquivar', leadsController.arquivar);
router.put('/leads/:id/reativar', leadsController.reativar);
router.delete('/leads/:id', leadsController.delete);

// Tags
router.post('/leads/:id/tags', leadsController.addTag);
router.delete('/leads/:id/tags/:tagId', leadsController.removeTag);

// WhatsApp messaging via lead (auto-cria contato se necessario)
router.post('/leads/:id/mensagem', leadsController.enviarMensagemWhatsApp);
router.post('/leads/:id/media', upload.single('file'), leadsController.enviarMediaWhatsApp);
router.get('/leads/:id/historico-whatsapp', leadsController.getHistoricoWhatsApp);
router.post('/leads/:id/marcar-lido', leadsController.marcarLidoWhatsApp);

export default router;
