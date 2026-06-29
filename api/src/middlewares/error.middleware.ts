import { Request, Response, NextFunction } from 'express';

export const errorHandler = (error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Erro capturado:', error);
  return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' });
};
