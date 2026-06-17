import { Request, Response, NextFunction } from "express";
import { Role } from "../lib/constants";

/**
 * Vyzaduje prihlaseneho pouzivatela (admin alebo klient). Inak presmeruje na login.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.redirect("/login");
    return;
  }
  next();
}

/**
 * Vyzaduje prihlaseneho pouzivatela s konkretnou rolou. Pri spravnej autentifikacii,
 * ale nespravnej role vrati 403 (nie redirect na login - pouzivatel je prihlaseny,
 * len nema opravnenie na danu sekciu).
 */
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session.userId) {
      res.redirect("/login");
      return;
    }
    if (req.session.role !== role) {
      res.status(403).render("errors/error", {
        title: "Prístup zamietnutý",
        message: "Na zobrazenie tejto stránky nemáte oprávnenie.",
      });
      return;
    }
    next();
  };
}
