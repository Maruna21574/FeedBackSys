import path from "path";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

export async function showClientPortal(req: Request, res: Response): Promise<void> {
  const clientId = req.session.clientId ?? null;

  if (!clientId) {
    res.status(403).render("errors/error", {
      title: "Prístup odmietnutý",
      message: "Váš účet nie je prepojený so žiadnym klientom.",
    });
    return;
  }

  const [projects, batches] = await Promise.all([
    prisma.project.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: {
        feedbackItems: {
          where: { status: { not: "draft" } },
          orderBy: { submittedAt: "desc" },
        },
      },
    }),
    prisma.feedbackBatch.findMany({
      where: { clientId },
      orderBy: { submittedAt: "desc" },
      include: { project: true },
    }),
  ]);

  res.render("client/dashboard", { title: "Môj projekt", projects, batches });
}

export async function downloadReport(req: Request, res: Response): Promise<void> {
  const clientId = req.session.clientId ?? null;

  if (!clientId) {
    res.status(403).render("errors/error", {
      title: "Prístup odmietnutý",
      message: "Váš účet nie je prepojený so žiadnym klientom.",
    });
    return;
  }

  const batchId = Number(req.params.batchId);
  const batch = await prisma.feedbackBatch.findUnique({ where: { id: batchId } });

  if (!batch || batch.clientId !== clientId || !batch.pdfPath) {
    res.status(404).render("errors/error", {
      title: "Report nenájdený",
      message: "Požadovaný report neexistuje.",
    });
    return;
  }

  res.download(path.join(env.storage.reports, batch.pdfPath));
}
