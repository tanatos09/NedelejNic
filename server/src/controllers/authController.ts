import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../prisma';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const BCRYPT_ROUNDS = 12;

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

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { username, password: hash },
      select: { id: true, username: true, level: true },
    });

    req.session.userId = user.id;
    req.session.username = user.username;

    res.status(201).json({ username: user.username, level: user.level });
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

  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: 'Špatné uživatelské jméno nebo heslo.' });
    return;
  }

  req.session.userId = user.id;
  req.session.username = user.username;

  res.json({ username: user.username, level: user.level });
}

export async function logout(req: Request, res: Response): Promise<void> {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Chyba při odhlášení.' });
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Byl jsi odhlášen.' });
  });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    select: { username: true, level: true },
  });

  if (!user) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  res.json(user);
}
