import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { gameRouter } from './routes/game';
import { adminRouter } from './routes/admin';

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use('/auth', authRouter);
app.use('/', gameRouter);
app.use('/admin', adminRouter);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Interní chyba serveru.' });
});

export default app;
