import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { setFlash } from "../../lib/flash";
import { generateProjectToken } from "../../lib/tokens";
import { createProjectSchema, updateProjectStatusSchema } from "../../validation/schemas";
import { FEEDBACK_STATUSES } from "../../lib/constants";
import { streamFeedbackPdf } from "../../services/pdf.service";

const PAGE_SIZE = 20;

function buildFeedbackFilter(projectId: number, query: Request["query"]): {
  where: Record<string, unknown>;
  urlFilter: string;
  statusFilter: string;
} {
  const urlFilter = typeof query.url === "string" ? query.url : "";
  const statusFilter = typeof query.status === "string" ? query.status : "";

  const where: Record<string, unknown> = { projectId };
  if (urlFilter) where.url = urlFilter;
  if (statusFilter && (FEEDBACK_STATUSES as readonly string[]).includes(statusFilter)) {
    where.status = statusFilter;
  }

  return { where, urlFilter, statusFilter };
}

export async function listProjects(req: Request, res: Response): Promise<void> {
  const [projects, clients] = await Promise.all([
    prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        _count: { select: { feedbackItems: true } },
      },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
  ]);

  res.render("admin/projects/index", { title: "Projekty", projects, clients });
}

export async function createProject(req: Request, res: Response): Promise<void> {
  const parsed = createProjectSchema.safeParse(req.body);

  if (!parsed.success) {
    setFlash(req, "error", parsed.error.errors[0]?.message ?? "Neplatné údaje.");
    res.redirect("/admin/projects");
    return;
  }

  const { clientId, name, url } = parsed.data;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    setFlash(req, "error", "Vybraný klient neexistuje.");
    res.redirect("/admin/projects");
    return;
  }

  const project = await prisma.project.create({
    data: {
      clientId,
      name,
      url,
      token: generateProjectToken(),
      status: "active",
    },
  });

  setFlash(req, "success", `Projekt "${name}" bol vytvorený.`);
  res.redirect(`/admin/projects/${project.id}`);
}

export async function showProjectDetail(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);

  const project = await prisma.project.findUnique({
    where: { id },
    include: { client: true },
  });

  if (!project) {
    res.status(404).render("errors/error", {
      title: "Projekt nenájdený",
      message: "Požadovaný projekt neexistuje.",
    });
    return;
  }

  const { where, urlFilter, statusFilter } = buildFeedbackFilter(id, req.query);
  const page = Math.max(1, Number(req.query.page) || 1);

  const [feedbackItems, total, distinctUrls] = await Promise.all([
    prisma.feedbackItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.feedbackItem.count({ where }),
    prisma.feedbackItem.findMany({
      where: { projectId: id },
      select: { url: true },
      distinct: ["url"],
    }),
  ]);

  const filters = { url: urlFilter, status: statusFilter };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  res.render("admin/projects/detail", {
    title: project.name,
    project,
    feedbackItems,
    urls: distinctUrls.map((u) => u.url),
    filters,
    pagination: {
      page,
      totalPages,
      total,
      qs: (overrides: Record<string, unknown>) => {
        const params: Record<string, string> = {};
        if (filters.url) params.url = filters.url;
        if (filters.status) params.status = filters.status;
        for (const [k, v] of Object.entries(overrides)) params[k] = String(v);
        return new URLSearchParams(params).toString();
      },
    },
  });
}

export async function exportProjectFeedback(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);

  const project = await prisma.project.findUnique({
    where: { id },
    include: { client: true },
  });

  if (!project) {
    res.status(404).render("errors/error", {
      title: "Projekt nenájdený",
      message: "Požadovaný projekt neexistuje.",
    });
    return;
  }

  const { where } = buildFeedbackFilter(id, req.query);
  // Export obsahuje len odoslane pripomienky (drafty su interna vec widgetu).
  if (!("status" in where)) {
    where.status = { not: "draft" };
  }

  const feedbackItems = await prisma.feedbackItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const fileName = `projekt-${project.id}-pripomienky.pdf`;
  streamFeedbackPdf(res, feedbackItems, project, project.client, `Report pripomienok – ${project.name}`, fileName);
}

export async function updateProjectStatus(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const parsed = updateProjectStatusSchema.safeParse(req.body);

  if (!parsed.success) {
    setFlash(req, "error", "Neplatný stav projektu.");
    res.redirect(`/admin/projects/${id}`);
    return;
  }

  await prisma.project.update({ where: { id }, data: { status: parsed.data.status } });

  setFlash(req, "success", "Stav projektu bol zmenený.");
  res.redirect(`/admin/projects/${id}`);
}
