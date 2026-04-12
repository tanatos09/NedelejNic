import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { checkRole } from '../middleware/checkRole';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  listUsers,
  getUserDetail,
  changeUserRole,
  banUser,
  changeUserLevel,
  resetProgress,
  invalidateSession,
  getAuditLog,
} from '../controllers/adminController';

export const adminRouter = Router();

// Admin endpointy vyžadují ADMIN nebo DEV roli
adminRouter.use(requireAuth, checkRole('ADMIN', 'DEV'));

adminRouter.get('/users', asyncHandler(listUsers));
adminRouter.get('/users/:userId', asyncHandler(getUserDetail));
adminRouter.put('/users/:userId/role', asyncHandler(changeUserRole));
adminRouter.put('/users/:userId/ban', asyncHandler(banUser));
adminRouter.put('/users/:userId/level', asyncHandler(changeUserLevel));
adminRouter.post('/users/:userId/reset-progress', asyncHandler(resetProgress));
adminRouter.post('/users/:userId/invalidate-session', asyncHandler(invalidateSession));
adminRouter.get('/audit', asyncHandler(getAuditLog));
