import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

// Minimalna platna PNG signatura (8 bajtov) + nieco navyse, aby ju
// detectImageType() rozpoznal ako image/png.
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("widget API", () => {
  let clientId: number;
  let projectId: number;
  let otherProjectId: number;
  let token: string;
  let otherToken: string;
  let createdItemId: number;

  beforeAll(async () => {
    const client = await prisma.client.create({
      data: { name: "Widget Test Client", email: "widget-test-client@example.com" },
    });
    clientId = client.id;

    token = crypto.randomBytes(24).toString("hex");
    otherToken = crypto.randomBytes(24).toString("hex");

    const project = await prisma.project.create({
      data: { clientId, name: "Widget Test Project", url: "https://example.com", token, status: "active" },
    });
    projectId = project.id;

    const otherProject = await prisma.project.create({
      data: { clientId, name: "Other Project", url: "https://example.com", token: otherToken, status: "active" },
    });
    otherProjectId = otherProject.id;
  });

  afterAll(async () => {
    await prisma.feedbackItem.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } });
    await prisma.project.deleteMany({ where: { id: { in: [projectId, otherProjectId] } } });
    await prisma.client.delete({ where: { id: clientId } });
  });

  it("neplatny token vrati 404 a neodhali ziadne data", async () => {
    const res = await request(app).get("/api/widget/neexistujuci-token/items");
    expect(res.status).toBe(404);
  });

  it("zoznam draftov je na zaciatku prazdny", async () => {
    const res = await request(app).get(`/api/widget/${token}/items`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("vytvorenie draftu bez poznamky vrati 400", async () => {
    const res = await request(app).post(`/api/widget/${token}/items`).type("form").send({
      url: "https://example.com",
      xPosition: 10,
      yPosition: 20,
      viewportWidth: 1280,
      viewportHeight: 720,
    });
    expect(res.status).toBe(400);
  });

  it("vytvori novy draft so screenshotom", async () => {
    const res = await request(app)
      .post(`/api/widget/${token}/items`)
      .field("note", "Testovacia poznamka")
      .field("url", "https://example.com")
      .field("pageTitle", "Uvod")
      .field("cssSelector", "#cta")
      .field("xPosition", "100")
      .field("yPosition", "200")
      .field("viewportWidth", "1280")
      .field("viewportHeight", "720")
      .attach("screenshot", VALID_PNG, "test.png");

    expect(res.status).toBe(201);
    expect(res.body.item.status).toBe("draft");
    expect(res.body.item.screenshotUrl).toMatch(/^\/uploads\/screenshots\/.+\.png$/);
    createdItemId = res.body.item.id;
  });

  it("odmietne nepodporovany typ screenshotu", async () => {
    const res = await request(app)
      .post(`/api/widget/${token}/items`)
      .field("note", "Druha poznamka")
      .field("url", "https://example.com")
      .field("xPosition", "10")
      .field("yPosition", "10")
      .field("viewportWidth", "1280")
      .field("viewportHeight", "720")
      .attach("screenshot", Buffer.from("not an image"), "test.txt");

    expect(res.status).toBe(400);
  });

  it("zoznam draftov obsahuje vytvoreny item", async () => {
    const res = await request(app).get(`/api/widget/${token}/items`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(createdItemId);
  });

  it("iny projekt nevidi a nemoze zmazat cudzi draft", async () => {
    const listRes = await request(app).get(`/api/widget/${otherToken}/items`);
    expect(listRes.body.items).toEqual([]);

    const delRes = await request(app).delete(`/api/widget/${otherToken}/items/${createdItemId}`);
    expect(delRes.status).toBe(404);
  });

  it("zmaze draft", async () => {
    const res = await request(app).delete(`/api/widget/${token}/items/${createdItemId}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const listRes = await request(app).get(`/api/widget/${token}/items`);
    expect(listRes.body.items).toEqual([]);
  });
});
