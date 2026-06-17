import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { Client, FeedbackBatch, Project } from "@prisma/client";
import { env } from "../config/env";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter(): ReturnType<typeof nodemailer.createTransport> | null {
  if (!env.smtp.host) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }

  return transporter;
}

interface BatchSubmittedParams {
  project: Project;
  client: Client;
  batch: FeedbackBatch;
  itemCount: number;
  pageCount: number;
  pdfFileName: string | null;
}

/**
 * Posle adminovi suhrnny email po odoslani vsetkych pripomienok klientom (jeden email na batch).
 * SMTP chyby sa iba zaloguju - neblokuju uspesnu odpoved klientovi (PDF a DB update uz prebehli).
 */
export async function sendFeedbackSubmittedEmail(params: BatchSubmittedParams): Promise<void> {
  const { project, client, batch, itemCount, pageCount, pdfFileName } = params;

  if (!env.adminNotificationEmail) {
    console.log("[email] ADMIN_NOTIFICATION_EMAIL nie je nastavený, notifikácia sa nezasiela.");
    return;
  }

  const projectUrl = `${env.appUrl}/admin/projects/${project.id}`;
  const subject = `Nové pripomienky – ${project.name} (${client.name})`;
  const text = [
    `Klient "${client.name}" odoslal ${itemCount} pripomienok pre projekt "${project.name}".`,
    `Počet stránok s pripomienkami: ${pageCount}.`,
    "",
    `Zobraziť v administrácii: ${projectUrl}`,
  ].join("\n");

  const attachments: { filename: string; path: string }[] = [];
  if (pdfFileName) {
    const filePath = path.join(env.storage.reports, pdfFileName);
    if (fs.existsSync(filePath)) {
      attachments.push({ filename: pdfFileName, path: filePath });
    }
  }

  const transport = getTransporter();

  if (!transport) {
    console.log("[email] SMTP nie je nakonfigurovaný, notifikácia sa iba zaloguje:");
    console.log(`[email]   To: ${env.adminNotificationEmail}`);
    console.log(`[email]   Subject: ${subject}`);
    console.log(`[email]   Batch: #${batch.id}, prílohy: ${attachments.map((a) => a.filename).join(", ") || "žiadne"}`);
    console.log(`[email]   ${text.replace(/\n/g, "\n[email]   ")}`);
    return;
  }

  try {
    await transport.sendMail({
      from: env.smtp.from,
      to: env.adminNotificationEmail,
      subject,
      text,
      attachments,
    });
  } catch (err) {
    console.error("[email] Odoslanie notifikácie zlyhalo:", err);
  }
}
