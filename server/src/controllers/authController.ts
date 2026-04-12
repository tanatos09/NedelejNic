import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../prisma';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const BCRYPT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRY = '7d';

export async function register(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Vyplň uživatelské jméno a heslo.' });
    return;
  }

  if (typeof username !== 'string' || !USERNAME_REGEX.test(username)) {
    res.status(400).json({
      error: 'Uživatelské jméno musí mít 3–20 znaků (a–z, A–Z, 0–9, _).',
    });
    return;
  }

  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Heslo musí mít alespoň 6 znaků.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { username, passwordHash },
      select: { id: true, username: true, role: true, level: true },
    });

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        level: user.level,
      },
    });
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      res.status(409).json({ error: 'Toto uživatelské jméno je již obsazeno.' });
      return;
    }
    throw err;
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Vyplň uživatelské jméno a heslo.' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'Špatné uživatelské jméno nebo heslo.' });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({ error: 'Tvůj účet je zablokován.' });
    return;
  }

  // Update lastLogin timestamp
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      level: user.level,
    },
  });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Uživatel není autentizován.' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, username: true, role: true, level: true, isBanned: true },
  });

  if (!user) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  res.json(user);
}
