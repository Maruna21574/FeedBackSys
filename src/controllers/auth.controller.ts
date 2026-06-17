import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { setFlash } from "../lib/flash";
import { loginSchema } from "../validation/schemas";
import { Role } from "../lib/constants";

export function showLoginPage(req: Request, res: Response): void {
  if (req.session.userId) {
    res.redirect(req.session.role === "admin" ? "/admin" : "/client");
    return;
  }
  res.render("auth/login", { title: "Prihlásenie", layout: "layout-blank" });
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    setFlash(req, "error", "Zadajte platný email a heslo.");
    res.redirect("/login");
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    setFlash(req, "error", "Nesprávny email alebo heslo.");
    res.redirect("/login");
    return;
  }

  req.session.userId = user.id;
  req.session.role = user.role as Role;
  req.session.userName = user.name;
  req.session.clientId = user.clientId ?? null;

  res.redirect(user.role === "admin" ? "/admin" : "/client");
}

export function logout(req: Request, res: Response): void {
  req.session.destroy(() => {
    res.redirect("/login");
  });
}
