import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { getLevelConfig, signLevel } from '../levels';

export async function getLevel(req: Request, res: Response): Promise<void> {
  const levelId = parseInt(req.params.id, 10);
  if (isNaN(levelId) || levelId < 1) {
    res.status(400).json({ error: 'Neplatné ID levelu.' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    select: { level: true },
  });

  if (!user) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  if (levelId !== user.level) {
    res.status(403).json({ error: 'Nemáš přístup k tomuto levelu.' });
    return;
  }

  const config = getLevelConfig(levelId);
  const signature = signLevel(config.id, config.end.time, req.session.userId!);
  res.json({ ...config, signature });
}

export async function postResult(req: Request, res: Response): Promise<void> {
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
    where: { id: req.session.userId },
    select: { level: true },
  });

  if (!user) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  if (levelId !== user.level) {
    res.status(403).json({ error: 'Neplatný level pro odeslání výsledku.' });
    return;
  }

  const config = getLevelConfig(levelId);
  const expected = signLevel(config.id, config.end.time, req.session.userId!);
  if (signature !== expected) {
    res.status(403).json({ error: 'Neplatný podpis.' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: req.session.userId },
    data: { level: { increment: 1 } },
    select: { level: true },
  });

  const message =
    result === 'success' ? 'Zvládl jsi to! Postupuješ dál.' : 'Nevadí. Jdeš dál tak jako tak.';

  res.json({ message, newLevel: updated.level });
}
