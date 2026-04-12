import { Router } from 'express';
import { register, login, logout, getMe } from '../controllers/authController';
import { authRateLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../middleware/asyncHandler';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, asyncHandler(register));
authRouter.post('/login', authRateLimiter, asyncHandler(login));
authRouter.post('/logout', requireAuth, asyncHandler(logout));
authRouter.get('/me', requireAuth, asyncHandler(getMe));
