import { Request, Response, NextFunction } from "express";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).render("errors/error", {
    title: "Stránka nenájdená",
    message: "Požadovaná stránka neexistuje.",
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  console.error(err);

  const message =
    err instanceof Error && (err as { expose?: boolean }).expose
      ? err.message
      : "Nastala neočakávaná chyba. Skúste to prosím znova.";

  res.status(500).render("errors/error", {
    title: "Chyba servera",
    message,
  });
}
