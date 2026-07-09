import { Router } from 'express';
import multer from 'multer';
import { followupsController } from './followups.controller';

// Mesma política de upload do chat manual (formatos que o WhatsApp aceita, 20MB).
const upload = multer({
  dest: '/tmp/crm-uploads/',
  limits: { fileSize: 20 * 1024 * 1024 },
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

// Upload de mídia para anexar num follow-up (retorna media_url/mimetype/filename).
router.post('/followups/upload-media', upload.single('file'), followupsController.uploadMedia);

// Por lead
router.post('/leads/:leadId/followups', followupsController.criar);
router.get('/leads/:leadId/followups', followupsController.listar);

// Empresa-wide
router.get('/followups', followupsController.listarTodos);
router.get('/followups/metricas', followupsController.metricas);

// Config anti-ban (intervalo entre envios) — global por empresa
router.get('/followups/config', followupsController.getConfig);
router.put('/followups/config', followupsController.setConfig);

// Por ID
router.delete('/followups/:id', followupsController.cancelar);
router.patch('/followups/:id/reagendar', followupsController.reagendar);

export default router;
