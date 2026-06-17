import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { Request, Response } from "express";
import { FeedbackItem, Project } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { detectImageType } from "../lib/upload";
import { createFeedbackItemSchema } from "../validation/schemas";
import { generateBatchPdf } from "../services/pdf.service";
import { sendFeedbackSubmittedEmail } from "../services/email.service";

function getProjectByToken(token: string): Promise<Project | null> {
  return prisma.project.findUnique({ where: { token } });
}

function serializeItem(item: FeedbackItem) {
  return {
    id: item.id,
    url: item.url,
    pageTitle: item.pageTitle,
    note: item.note,
    xPosition: item.xPosition,
    yPosition: item.yPosition,
    viewportWidth: item.viewportWidth,
    viewportHeight: item.viewportHeight,
    cssSelector: item.cssSelector,
    status: item.status,
    screenshotUrl: item.screenshotPath ? `/uploads/screenshots/${item.screenshotPath}` : null,
    createdAt: item.createdAt,
  };
}

/**
 * Vrati aktivne poznamky pre dany projekt - drafty aj odoslane (new/in_progress).
 * Widget ich pouziva na zobrazenie pinov. Piny zmiznu az ked admin nastavi
 * stav na "done" alebo "rejected".
 */
export async function listActiveItems(req: Request, res: Response): Promise<void> {
  const project = await getProjectByToken(req.params.token);
  if (!project) {
    res.status(404).json({ error: "Projekt nenájdený." });
    return;
  }

  const url = typeof req.query.url === "string" ? req.query.url : undefined;

  const where: Record<string, unknown> = {
    projectId: project.id,
    status: { in: ["draft", "new", "in_progress"] },
  };
  if (url) where.url = url;

  const items = await prisma.feedbackItem.findMany({ where, orderBy: { createdAt: "asc" } });
  res.json({ items: items.map(serializeItem) });
}

/**
 * Ulozi novu poznamku ako draft (bez odoslania - ziadny email). Volitelne prijima
 * screenshot a prilohu (multipart), oba su overene podla magic bytes (PNG/JPEG/WEBP).
 */
export async function createDraftItem(req: Request, res: Response): Promise<void> {
  const project = await getProjectByToken(req.params.token);
  if (!project) {
    res.status(404).json({ error: "Projekt nenájdený." });
    return;
  }

  if (project.status !== "active") {
    res.status(403).json({ error: "Tento projekt už nie je aktívny." });
    return;
  }

  const parsed = createFeedbackItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Neplatné údaje." });
    return;
  }

  const files = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
  const screenshotFile = files.screenshot?.[0];
  const attachmentFile = files.attachment?.[0];

  let screenshotPath: string | null = null;
  let attachmentPath: string | null = null;

  if (screenshotFile) {
    const detected = detectImageType(screenshotFile.buffer);
    if (!detected) {
      res.status(400).json({ error: "Nepodporovaný formát screenshotu (povolené: PNG, JPEG, WEBP)." });
      return;
    }
    const fileName = `${crypto.randomUUID()}.${detected.ext}`;
    await fs.writeFile(path.join(env.storage.screenshots, fileName), screenshotFile.buffer);
    screenshotPath = fileName;
  }

  if (attachmentFile) {
    const detected = detectImageType(attachmentFile.buffer);
    if (!detected) {
      res.status(400).json({ error: "Nepodporovaný formát prílohy (povolené: PNG, JPEG, WEBP)." });
      return;
    }
    const fileName = `${crypto.randomUUID()}.${detected.ext}`;
    await fs.writeFile(path.join(env.storage.attachments, fileName), attachmentFile.buffer);
    attachmentPath = fileName;
  }

  const { note, url, pageTitle, cssSelector, xPosition, yPosition, viewportWidth, viewportHeight } = parsed.data;

  const item = await prisma.feedbackItem.create({
    data: {
      projectId: project.id,
      url,
      pageTitle: pageTitle || null,
      note,
      screenshotPath,
      attachmentPath,
      xPosition,
      yPosition,
      viewportWidth,
      viewportHeight,
      cssSelector: cssSelector || null,
      status: "draft",
    },
  });

  res.status(201).json({ item: serializeItem(item) });
}

/**
 * Zmaze draft poznamku (pred odoslanim). Nikdy nedovoli zmazat uz odoslanu poznamku.
 */
export async function deleteDraftItem(req: Request, res: Response): Promise<void> {
  const project = await getProjectByToken(req.params.token);
  if (!project) {
    res.status(404).json({ error: "Projekt nenájdený." });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Neplatné ID poznámky." });
    return;
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const item = await tx.feedbackItem.findUnique({ where: { id } });
    if (!item || item.projectId !== project.id || item.status !== "draft") {
      return false;
    }
    await tx.feedbackItem.delete({ where: { id } });
    return true;
  });

  if (!deleted) {
    res.status(404).json({ error: "Poznámka nenájdená." });
    return;
  }

  res.json({ ok: true });
}

/**
 * Odosle vsetky draft poznamky projektu: prepne ich na "new", vytvori FeedbackBatch,
 * vygeneruje PDF report a posle adminovi jeden suhrnny email.
 */
export async function submitDrafts(req: Request, res: Response): Promise<void> {
  const project = await getProjectByToken(req.params.token);
  if (!project) {
    res.status(404).json({ error: "Projekt nenájdený." });
    return;
  }

  const drafts = await prisma.feedbackItem.findMany({
    where: { projectId: project.id, status: "draft" },
    orderBy: { createdAt: "asc" },
  });

  if (drafts.length === 0) {
    res.status(400).json({ error: "Nemáte žiadne neuložené poznámky na odoslanie." });
    return;
  }

  const client = await prisma.client.findUnique({ where: { id: project.clientId } });
  if (!client) {
    res.status(404).json({ error: "Klient nenájdený." });
    return;
  }

  const submittedAt = new Date();

  const batch = await prisma.feedbackBatch.create({
    data: {
      projectId: project.id,
      clientId: client.id,
      totalItems: drafts.length,
      submittedAt,
    },
  });

  await prisma.feedbackItem.updateMany({
    where: { id: { in: drafts.map((d) => d.id) } },
    data: { status: "new", submittedBatchId: batch.id, submittedAt },
  });

  const submittedItems = drafts.map((d) => ({
    ...d,
    status: "new",
    submittedBatchId: batch.id,
    submittedAt,
  }));

  let pdfFileName: string | null = null;
  try {
    pdfFileName = await generateBatchPdf(submittedItems, project, client, batch.id);
    await prisma.feedbackBatch.update({ where: { id: batch.id }, data: { pdfPath: pdfFileName } });
  } catch (err) {
    console.error("[widget] Generovanie PDF reportu zlyhalo:", err);
  }

  const pageCount = new Set(drafts.map((d) => d.url)).size;

  await sendFeedbackSubmittedEmail({
    project,
    client,
    batch,
    itemCount: drafts.length,
    pageCount,
    pdfFileName,
  });

  res.json({
    ok: true,
    message: "Ďakujeme za spätnú väzbu. Vaše pripomienky sme prijali a čoskoro sa vám ozveme.",
    submittedCount: drafts.length,
  });
}
