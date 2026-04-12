import { Router } from 'express';
import { getLevel, postResult } from '../controllers/gameController';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../middleware/asyncHandler';

export const gameRouter = Router();

gameRouter.get('/level/:id', requireAuth, asyncHandler(getLevel));
gameRouter.post('/result', requireAuth, asyncHandler(postResult));
