import { Request, Response, NextFunction } from "express";
import { FlashMessage } from "../types/express-session";

/**
 * Ulozi flash spravu do session - zobrazi sa pri najblizsom renderovani stranky.
 */
export function setFlash(req: Request, type: FlashMessage["type"], text: string): void {
  if (!req.session.flash) {
    req.session.flash = [];
  }
  req.session.flash.push({ type, text });
}

/**
 * Vyberie flash spravy zo session do res.locals.flash a vycisti ich.
 */
export function flashMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.locals.flash = req.session.flash ?? [];
  req.session.flash = [];
  next();
}
