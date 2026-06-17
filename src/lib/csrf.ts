import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

const TOKEN_FIELD = "_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Zabezpeci, ze kazda session ma CSRF token a vystavi ho do res.locals.csrfToken
 * (pre vlozenie do formularov ako skryte pole `_csrf`).
 */
export function csrfTokenMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

/**
 * Overi CSRF token na vsetkych nebezpecnych metodach (POST/PUT/PATCH/DELETE)
 * pre session-authentifikovane stranky (admin/klient). Widget API tento middleware
 * nepouziva - je autentifikovane cez project token, nie cookies.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const tokenFromRequest =
    (req.body && req.body[TOKEN_FIELD]) || req.headers["x-csrf-token"];

  if (!req.session.csrfToken || tokenFromRequest !== req.session.csrfToken) {
    return res.status(403).render("errors/error", {
      title: "Neplatna poziadavka",
      message: "Bezpecnostny token vyprsal alebo je neplatny. Vratte sa spat a skuste akciu znova.",
      layout: "layout",
    });
  }

  next();
}
