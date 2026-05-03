import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadFile } from '../../services/storageService';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const url = await uploadFile(file.buffer, file.mimetype, file.originalname);
    res.json({ url });
  } catch (err) {
    console.error('Erro no upload:', err);
    res.status(500).json({ error: 'Erro ao fazer upload da mídia' });
  }
});

export default router;
