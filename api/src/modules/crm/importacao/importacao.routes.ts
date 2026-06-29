import { Router } from 'express';
import multer from 'multer';
import { importacaoController } from './importacao.controller';

const upload = multer({
  dest: '/tmp/crm-imports/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    // Alguns navegadores enviam text/plain para CSV
    if (allowedMimes.includes(file.mimetype) ||
        file.originalname.endsWith('.csv') ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não permitido. Use CSV ou Excel (.xlsx, .xls)`));
    }
  }
});

const router = Router();

// Preview do arquivo (retorna colunas e primeiras linhas)
router.post('/importacao/preview', upload.single('file'), importacaoController.preview);

// Importar leads do arquivo
router.post('/importacao/importar', upload.single('file'), importacaoController.importar);

export default router;
