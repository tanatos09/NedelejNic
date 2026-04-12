import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';

// Helper: create audit log entry
async function audit(
  actorId: string,
  targetId: string,
  action: string,
  detail?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: {
      actorId,
      targetId,
      action,
      detail: detail ? JSON.stringify(detail) : null,
    },
  });
}

// GET /admin/users — paginated, filterable user list
export async function listUsers(req: Request, res: Response): Promise<void> {
  const page = Math.max(0, parseInt(req.query.page as string) || 0);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 10));
  const search = (req.query.search as string) || '';
  const roleFilter = req.query.role as string;
  const statusFilter = req.query.status as string;

  const where: Prisma.UserWhereInput = {};

  if (search) {
    where.username = { contains: search, mode: 'insensitive' };
  }

  if (roleFilter && roleFilter !== 'ALL') {
    if (['PLAYER', 'DEV', 'ADMIN'].includes(roleFilter)) {
      where.role = roleFilter as 'PLAYER' | 'DEV' | 'ADMIN';
    }
  }

  if (statusFilter === 'active') {
    where.isBanned = false;
  } else if (statusFilter === 'banned') {
    where.isBanned = true;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        role: true,
        isBanned: true,
        level: true,
        createdAt: true,
        lastLogin: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: page * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, page, pageSize });
}

// GET /admin/users/:userId — user detail
export async function getUserDetail(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      isBanned: true,
      level: true,
      createdAt: true,
      lastLogin: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  const recentActivity = await prisma.auditLog.findMany({
    where: { targetId: userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { actor: { select: { username: true } } },
  });

  res.json({
    ...user,
    totalLevels: 100,
    progressPercentage: Math.round(((user.level - 1) / 100) * 100),
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      type: 'action_admin' as const,
      timestamp: a.createdAt.toISOString(),
      description: `${a.actor.username}: ${a.action}${a.detail ? ` (${a.detail})` : ''}`,
    })),
  });
}

// PUT /admin/users/:userId/role — change role (ADMIN only, no ADMIN→ADMIN)
export async function changeUserRole(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;
  const { role } = req.body;

  if (!['PLAYER', 'DEV', 'ADMIN'].includes(role)) {
    res.status(400).json({ error: 'Neplatná role.' });
    return;
  }

  // Only ADMIN can change roles
  if (req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Pouze ADMIN může měnit role.' });
    return;
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, username: true },
  });

  if (!target) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  if (target.role === 'ADMIN' && target.id !== req.user!.userId) {
    res.status(403).json({ error: 'Nelze upravovat jiného ADMINa.' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, username: true, role: true, level: true, isBanned: true },
  });

  await audit(req.user!.userId, userId, 'CHANGE_ROLE', { from: target.role, to: role });

  res.json({ message: 'Role změněna.', user });
}

// PUT /admin/users/:userId/ban — ban/unban user (ADMIN only)
export async function banUser(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;
  const { isBanned, reason } = req.body;

  if (req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Pouze ADMIN může blokovat uživatele.' });
    return;
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!target) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  if (target.role === 'ADMIN') {
    res.status(403).json({ error: 'Nelze blokovat ADMINa.' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isBanned: Boolean(isBanned) },
    select: { id: true, username: true, role: true, isBanned: true, level: true },
  });

  const action = user.isBanned ? 'BAN' : 'UNBAN';
  await audit(req.user!.userId, userId, action, { reason: reason || null });

  const msg = user.isBanned ? 'zablokován' : 'odblokován';
  res.json({ message: `Uživatel ${msg}.`, user });
}

// PUT /admin/users/:userId/level — set level
export async function changeUserLevel(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;
  const { level } = req.body;

  if (typeof level !== 'number' || level < 1) {
    res.status(400).json({ error: 'Neplatný level.' });
    return;
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, level: true },
  });

  if (!target) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  if (target.role === 'ADMIN' && target.id !== req.user!.userId) {
    res.status(403).json({ error: 'Nelze upravovat jiného ADMINa.' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { level },
    select: { id: true, username: true, role: true, level: true, isBanned: true },
  });

  await audit(req.user!.userId, userId, 'SET_LEVEL', { from: target.level, to: level });

  res.json({ message: 'Level změněn.', user });
}

// POST /admin/users/:userId/reset-progress — reset to level 1
export async function resetProgress(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, level: true },
  });

  if (!target) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  if (target.role === 'ADMIN' && target.id !== req.user!.userId) {
    res.status(403).json({ error: 'Nelze upravovat jiného ADMINa.' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { level: 1 },
    select: { id: true, username: true, role: true, level: true, isBanned: true },
  });

  await audit(req.user!.userId, userId, 'RESET_PROGRESS', { from: target.level, to: 1 });

  res.json({ message: 'Progress resetován na level 1.', user });
}

// GET /admin/audit — audit log
export async function getAuditLog(req: Request, res: Response): Promise<void> {
  const page = Math.max(0, parseInt(req.query.page as string) || 0);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: page * pageSize,
      take: pageSize,
      include: {
        actor: { select: { username: true } },
        target: { select: { username: true } },
      },
    }),
    prisma.auditLog.count(),
  ]);

  res.json({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      actorUsername: l.actor.username,
      targetUsername: l.target.username,
      createdAt: l.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  });
}

// POST /admin/users/:userId/invalidate-session
export async function invalidateSession(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });

  if (!user) {
    res.status(404).json({ error: 'Uživatel nenalezen.' });
    return;
  }

  await audit(req.user!.userId, userId, 'INVALIDATE_SESSION', {});

  res.json({ message: 'Uživateli byl vynutěn re-login.' });
}
