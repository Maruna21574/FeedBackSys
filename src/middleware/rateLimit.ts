import rateLimit from "express-rate-limit";

/**
 * Obmedzenie pokusov o prihlasenie - ochrana proti brute-force.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Príliš veľa pokusov o prihlásenie. Skúste to znova o 15 minút.",
});

/**
 * Obmedzenie pre verejne widget API (volane z webov klientov).
 */
export const widgetRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa požiadaviek, skúste to o chvíľu znova." },
});
