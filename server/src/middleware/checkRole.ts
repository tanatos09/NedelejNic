import { Request, Response, NextFunction } from 'express';

export type AllowedRoles = 'PLAYER' | 'DEV' | 'ADMIN';

export function checkRole(...allowedRoles: AllowedRoles[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Uživatel není autentizován.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Nemáš oprávnění pro tuto akci.' });
      return;
    }

    next();
  };
}
