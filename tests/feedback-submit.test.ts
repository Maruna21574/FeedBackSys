import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/config/env";

describe("odoslanie vsetkych poznamok (submit flow)", () => {
  let clientId: number;
  let projectId: number;
  let token: string;

  async function createDraft(note: string, url: string) {
    const res = await request(app).post(`/api/widget/${token}/items`).type("form").send({
      note,
      url,
      xPosition: 50,
      yPosition: 60,
      viewportWidth: 1280,
      viewportHeight: 720,
    });
    expect(res.status).toBe(201);
    return res.body.item.id as number;
  }

  beforeAll(async () => {
    const client = await prisma.client.create({
      data: { name: "Submit Test Client", email: "submit-test-client@example.com" },
    });
    clientId = client.id;

    token = crypto.randomBytes(24).toString("hex");

    const project = await prisma.project.create({
      data: {
        clientId,
        name: "Submit Test Project",
        url: "https://example.com",
        token,
        status: "active",
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    const batches = await prisma.feedbackBatch.findMany({ where: { projectId } });
    for (const batch of batches) {
      if (batch.pdfPath) {
        const filePath = path.join(env.storage.reports, batch.pdfPath);
        if (fs.existsSync(filePath)) fs.rmSync(filePath);
      }
    }

    await prisma.feedbackItem.deleteMany({ where: { projectId } });
    await prisma.feedbackBatch.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.client.delete({ where: { id: clientId } });
  });

  it("odoslanie bez ulozenych draftov vrati 400", async () => {
    const res = await request(app).post(`/api/widget/${token}/submit`);
    expect(res.status).toBe(400);
  });

  it("odoslanie draftov zmeni stav na 'new', vytvori batch a PDF", async () => {
    const itemAId = await createDraft("Prva pripomienka", "https://example.com/");
    const itemBId = await createDraft("Druha pripomienka", "https://example.com/o-nas");

    const submitRes = await request(app).post(`/api/widget/${token}/submit`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.ok).toBe(true);
    expect(submitRes.body.submittedCount).toBe(2);
    expect(submitRes.body.message).toContain("Ďakujeme za spätnú väzbu");

    const itemA = await prisma.feedbackItem.findUnique({ where: { id: itemAId } });
    const itemB = await prisma.feedbackItem.findUnique({ where: { id: itemBId } });
    expect(itemA?.status).toBe("new");
    expect(itemB?.status).toBe("new");
    expect(itemA?.submittedBatchId).toBe(itemB?.submittedBatchId);
    expect(itemA?.submittedAt).not.toBeNull();

    const batch = await prisma.feedbackBatch.findUnique({ where: { id: itemA!.submittedBatchId! } });
    expect(batch?.totalItems).toBe(2);
    expect(batch?.pdfPath).toBeTruthy();

    const pdfPath = path.join(env.storage.reports, batch!.pdfPath!);
    expect(fs.existsSync(pdfPath)).toBe(true);
  });

  it("po odoslani su drafty prazdne a dalsie odoslanie vrati 400", async () => {
    const listRes = await request(app).get(`/api/widget/${token}/items`);
    expect(listRes.body.items).toEqual([]);

    const submitRes = await request(app).post(`/api/widget/${token}/submit`);
    expect(submitRes.status).toBe(400);
  });
});
