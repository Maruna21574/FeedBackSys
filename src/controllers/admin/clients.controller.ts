import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { setFlash } from "../../lib/flash";
import { createClientSchema } from "../../validation/schemas";

export async function listClients(req: Request, res: Response): Promise<void> {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      projects: true,
      users: true,
    },
  });

  res.render("admin/clients/index", { title: "Klienti", clients });
}

export async function createClient(req: Request, res: Response): Promise<void> {
  const parsed = createClientSchema.safeParse(req.body);

  if (!parsed.success) {
    setFlash(req, "error", parsed.error.errors[0]?.message ?? "Neplatné údaje.");
    res.redirect("/admin/clients");
    return;
  }

  const { name, email, note, password } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    setFlash(req, "error", "Používateľ s týmto emailom už existuje.");
    res.redirect("/admin/clients");
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const client = await prisma.client.create({
    data: { name, email, note: note || null },
  });

  await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: "client",
      clientId: client.id,
    },
  });

  setFlash(req, "success", `Klient "${name}" bol vytvorený.`);
  res.redirect("/admin/clients");
}
