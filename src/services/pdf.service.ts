import fs from "fs";
import path from "path";
import { Response } from "express";
import PDFDocument from "pdfkit";
import { Client, FeedbackItem, Project } from "@prisma/client";
import { env } from "../config/env";
import { FEEDBACK_STATUS_LABELS, FeedbackStatus } from "../lib/constants";

interface PdfMeta {
  title: string;
  generatedAt?: Date;
}

function statusLabel(status: string): string {
  return FEEDBACK_STATUS_LABELS[status as FeedbackStatus] ?? status;
}

function buildDocument(items: FeedbackItem[], project: Project, client: Client, meta: PdfMeta): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  doc.fontSize(18).fillColor("#111111").text(meta.title);
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#6b7280");
  doc.text(`Projekt: ${project.name} (${project.url})`);
  doc.text(`Klient: ${client.name}`);
  doc.text(`Vygenerované: ${(meta.generatedAt ?? new Date()).toLocaleString("sk-SK")}`);
  doc.text(`Počet pripomienok: ${items.length}`);
  doc.fillColor("#111111");
  doc.moveDown();

  if (items.length === 0) {
    doc.fontSize(11).fillColor("#6b7280").text("Žiadne pripomienky.");
    return doc;
  }

  const groups = new Map<string, FeedbackItem[]>();
  for (const item of items) {
    const arr = groups.get(item.url) ?? [];
    arr.push(item);
    groups.set(item.url, arr);
  }

  for (const [url, groupItems] of groups) {
    if (doc.y > 700) doc.addPage();

    doc.moveDown(0.5);
    doc.fontSize(13).fillColor("#2563eb").text(url, { link: url, underline: true });
    doc.fillColor("#111111");
    doc.moveDown(0.3);

    for (const item of groupItems) {
      if (doc.y > 650) doc.addPage();

      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#111111")
        .text(`#${item.id} – ${statusLabel(item.status)}`);

      doc.font("Helvetica").fontSize(10).fillColor("#374151").text(item.note);

      doc.fontSize(8).fillColor("#6b7280");
      doc.text(`Pozícia: X ${item.xPosition}px, Y ${item.yPosition}px · Okno: ${item.viewportWidth}×${item.viewportHeight}px`);
      if (item.cssSelector) doc.text(`CSS selektor: ${item.cssSelector}`);
      doc.text(`Vytvorené: ${item.createdAt.toLocaleString("sk-SK")}`);

      if (item.screenshotPath) {
        const imgPath = path.join(env.storage.screenshots, item.screenshotPath);
        if (fs.existsSync(imgPath)) {
          try {
            if (doc.y > 480) doc.addPage();
            doc.moveDown(0.3);
            doc.image(imgPath, { fit: [420, 260] });
          } catch {
            // Poškodený alebo nepodporovaný obrázok - pokračuj bez neho.
          }
        }
      }

      doc.fillColor("#111111");
      doc.moveDown(0.8);
    }
  }

  return doc;
}

/**
 * Vystrieba PDF report priamo do HTTP odpovede (on-demand export, nic sa neuklada na disk).
 */
export function streamFeedbackPdf(
  res: Response,
  items: FeedbackItem[],
  project: Project,
  client: Client,
  title: string,
  fileName: string
): void {
  const doc = buildDocument(items, project, client, { title });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

  doc.pipe(res);
  doc.end();
}

/**
 * Vygeneruje PDF report pre odoslany batch a ulozi ho do storage/reports.
 * Vrati nazov suboru (relativny k storage/reports), ktory sa ulozi do FeedbackBatch.pdfPath.
 */
export async function generateBatchPdf(
  items: FeedbackItem[],
  project: Project,
  client: Client,
  batchId: number
): Promise<string> {
  const fileName = `batch-${batchId}.pdf`;
  const filePath = path.join(env.storage.reports, fileName);

  const doc = buildDocument(items, project, client, {
    title: `Report pripomienok – ${project.name}`,
  });

  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);
  doc.end();

  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", () => resolve());
    writeStream.on("error", reject);
  });

  return fileName;
}
