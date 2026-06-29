import { Router, Request, Response } from 'express';
import multer from 'multer';
import multerStorage from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { disparosEmailController } from './disparos-email.controller';

const router = Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
});

const EMAIL_IMAGES_DIR = '/var/www/apps/gestao_financeira/uploads/email-images';
const imageStorage = multerStorage.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(EMAIL_IMAGES_DIR, { recursive: true });
    cb(null, EMAIL_IMAGES_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

router.post('/email-images', uploadImage.single('imagem'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  const url = `https://duofuturo.mooo.com/api/gestao/uploads/email-images/${req.file.filename}`;
  return res.json({ url });
});

router.get('/disparos-email/leads', disparosEmailController.listarLeads);
router.post('/disparos-email', upload.array('anexos', 5), disparosEmailController.iniciar);
router.get('/disparos-email', disparosEmailController.listar);
router.get('/disparos-email/:id', disparosEmailController.getStatus);

export default router;
