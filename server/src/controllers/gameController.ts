import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { getLevelConfig, signLevel } from '../levels';

export async function getLevel(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Uživatel není autentizován.' });
    return;
  }

  const levelId = parseInt(req.params.id, 10);
  if (isNaN(levelId) || levelId < 1) {
    res.status(400).json({ error: 'Neplatné ID levelu.' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { level: true, isBanned: true },
  });

  if (!user) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({ error: 'Tvůj účet je zablokován.' });
    return;
  }

  // DEV/ADMIN can access any level; PLAYER must match their current level
  if (req.user.role === 'PLAYER' && levelId !== user.level) {
    res.status(403).json({ error: 'Nemáš přístup k tomuto levelu.' });
    return;
  }

  let config;
  try {
    config = getLevelConfig(levelId);
  } catch (e: unknown) {
    res.status(404).json({ error: e instanceof Error ? e.message : 'Level nenalezen.' });
    return;
  }
  const endTime = config.end?.time ?? 0;
  const signature = signLevel(config.id, endTime, req.user.userId);
  res.json({ ...config, signature });
}

export async function postResult(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Uživatel není autentizován.' });
    return;
  }

  const { result, levelId, signature } = req.body;

  if (result !== 'success' && result !== 'fail') {
    res.status(400).json({ error: 'Neplatný výsledek.' });
    return;
  }

  if (typeof levelId !== 'number' || levelId < 1) {
    res.status(400).json({ error: 'Neplatné ID levelu.' });
    return;
  }

  if (typeof signature !== 'string' || !signature) {
    res.status(400).json({ error: 'Chybí podpis levelu.' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { level: true, isBanned: true },
  });

  if (!user) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({ error: 'Tvůj účet je zablokován.' });
    return;
  }

  // DEV/ADMIN: skip level validation (can play any level)
  if (req.user.role === 'PLAYER' && levelId !== user.level) {
    res.status(403).json({ error: 'Neplatný level pro odeslání výsledku.' });
    return;
  }

  let config;
  try {
    config = getLevelConfig(levelId);
  } catch (e: unknown) {
    res.status(404).json({ error: e instanceof Error ? e.message : 'Level nenalezen.' });
    return;
  }
  const endTime = config.end?.time ?? 0;
  const expected = signLevel(config.id, endTime, req.user.userId);
  if (signature !== expected) {
    res.status(403).json({ error: 'Neplatný podpis.' });
    return;
  }

  // DEV/ADMIN: don't auto-increment level (they control progression)
  const isDev = req.user.role === 'DEV' || req.user.role === 'ADMIN';
  let newLevel = user.level;

  if (!isDev) {
    const updated = await prisma.user.update({
      where: { id: req.user.userId },
      data: { level: { increment: 1 } },
      select: { level: true },
    });
    newLevel = updated.level;
  }

  const message =
    result === 'success' ? 'Zvládl jsi to! Postupuješ dál.' : 'Nevadí. Jdeš dál tak jako tak.';

  res.json({ message, newLevel, devMode: isDev });
}
