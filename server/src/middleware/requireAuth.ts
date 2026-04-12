import { Request, Response, NextFunction } from 'express';
import { verifyJWT } from './verifyJWT';

// Alias pro verifyJWT - udržuje kompatibilitu s existujícím kódem
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  verifyJWT(req, res, next);
}
