import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import { authRouter } from './routes/auth';
import { gameRouter } from './routes/game';

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Session-based auth — cookie expires when browser closes (no maxAge set)
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn(
    '[warn] SESSION_SECRET není nastaven! Používám nezabezpečený výchozí secret. Nikdy nepoužívej v produkci.'
  );
}

app.use(
  session({
    // Note: default MemoryStore — pro produkci vyměň za connect-pg-simple nebo redis
    secret: sessionSecret || 'insecure-default-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      // Bez maxAge = session cookie (vyprší se zavřením prohlížeče)
    },
  })
);

app.use('/auth', authRouter);
app.use('/', gameRouter);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Interní chyba serveru.' });
});

export default app;
