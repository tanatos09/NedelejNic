import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuta
  max: 5,
  message: { error: 'Příliš mnoho pokusů. Zkus to znovu za minutu.' },
  standardHeaders: true,
  legacyHeaders: false,
});
