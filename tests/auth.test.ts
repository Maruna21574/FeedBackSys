import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

function extractCsrf(html: string): string {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match) throw new Error("CSRF token sa v HTML nenasiel.");
  return match[1];
}

describe("autentifikacia a autorizacia", () => {
  let testClientId: number;

  beforeAll(async () => {
    const adminPassword = await bcrypt.hash("admin123", 10);
    const clientPassword = await bcrypt.hash("client123", 10);

    await prisma.user.create({
      data: {
        name: "Test Admin",
        email: "test-admin@example.com",
        password: adminPassword,
        role: "admin",
      },
    });

    const testClient = await prisma.client.create({
      data: { name: "Test Client Co.", email: "test-client-co@example.com" },
    });
    testClientId = testClient.id;

    await prisma.user.create({
      data: {
        name: "Test Client User",
        email: "test-client@example.com",
        password: clientPassword,
        role: "client",
        clientId: testClient.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ["test-admin@example.com", "test-client@example.com"] } },
    });
    await prisma.client.delete({ where: { id: testClientId } });
  });

  it("zobrazi prihlasovaciu stranku", async () => {
    const res = await request(app).get("/login");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Prihlásenie");
  });

  it("nepristupne /admin bez prihlasenia presmeruje na /login", async () => {
    const res = await request(app).get("/admin");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("nespravne udaje presmeruju spat na /login", async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get("/login");
    const csrfToken = extractCsrf(loginPage.text);

    const res = await agent.post("/login").type("form").send({
      _csrf: csrfToken,
      email: "test-admin@example.com",
      password: "nespravne-heslo",
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("admin sa prihlasi, vidi /admin, ale nie /client", async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get("/login");
    const csrfToken = extractCsrf(loginPage.text);

    const loginRes = await agent.post("/login").type("form").send({
      _csrf: csrfToken,
      email: "test-admin@example.com",
      password: "admin123",
    });
    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toBe("/admin");

    const adminRes = await agent.get("/admin");
    expect(adminRes.status).toBe(200);

    const clientRes = await agent.get("/client");
    expect(clientRes.status).toBe(403);
  });

  it("klient sa prihlasi, vidi /client, ale nie /admin", async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get("/login");
    const csrfToken = extractCsrf(loginPage.text);

    const loginRes = await agent.post("/login").type("form").send({
      _csrf: csrfToken,
      email: "test-client@example.com",
      password: "client123",
    });
    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toBe("/client");

    const clientRes = await agent.get("/client");
    expect(clientRes.status).toBe(200);

    const adminRes = await agent.get("/admin");
    expect(adminRes.status).toBe(403);
  });

  it("POST /admin/clients bez CSRF tokenu vrati 403", async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get("/login");
    const csrfToken = extractCsrf(loginPage.text);

    await agent.post("/login").type("form").send({
      _csrf: csrfToken,
      email: "test-admin@example.com",
      password: "admin123",
    });

    const res = await agent.post("/admin/clients").type("form").send({
      name: "Bez CSRF",
      email: "bez-csrf@example.com",
      password: "ahojahoj",
    });

    expect(res.status).toBe(403);
  });
});
