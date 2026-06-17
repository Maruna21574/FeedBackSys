import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { setFlash } from "../../lib/flash";
import { updateFeedbackStatusSchema, createInternalNoteSchema } from "../../validation/schemas";
import { FEEDBACK_STATUSES } from "../../lib/constants";

const PAGE_SIZE = 20;

function safeRedirect(value: unknown, fallback: string): string {
  if (
    typeof value === "string" &&
    (value.startsWith("/admin/feedback") || value.startsWith("/admin/projects/"))
  ) {
    return value;
  }
  return fallback;
}

export async function listFeedback(req: Request, res: Response): Promise<void> {
  const projectIdRaw = typeof req.query.projectId === "string" ? req.query.projectId : "";
  const statusFilter = typeof req.query.status === "string" ? req.query.status : "";
  const urlFilter = typeof req.query.url === "string" ? req.query.url : "";
  const page = Math.max(1, Number(req.query.page) || 1);

  const where: Record<string, unknown> = { status: { not: "draft" } };

  const projectId = projectIdRaw ? Number(projectIdRaw) : null;
  if (projectId) where.projectId = projectId;

  if (statusFilter && (FEEDBACK_STATUSES as readonly string[]).includes(statusFilter)) {
    where.status = statusFilter;
  }

  if (urlFilter) where.url = { contains: urlFilter };

  const [items, total, projects] = await Promise.all([
    prisma.feedbackItem.findMany({
      where,
      include: { project: { include: { client: true } } },
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.feedbackItem.count({ where }),
    prisma.project.findMany({ orderBy: { name: "asc" }, include: { client: true } }),
  ]);

  const filters = { projectId: projectIdRaw, status: statusFilter, url: urlFilter };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  res.render("admin/feedback/index", {
    title: "Feedbacky",
    items,
    projects,
    filters,
    pagination: {
      page,
      totalPages,
      total,
      qs: (overrides: Record<string, unknown>) => {
        const params: Record<string, string> = {};
        if (filters.projectId) params.projectId = filters.projectId;
        if (filters.status) params.status = filters.status;
        if (filters.url) params.url = filters.url;
        for (const [k, v] of Object.entries(overrides)) params[k] = String(v);
        return new URLSearchParams(params).toString();
      },
    },
  });
}

export async function showFeedbackDetail(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);

  const item = await prisma.feedbackItem.findUnique({
    where: { id },
    include: {
      project: { include: { client: true } },
      internalNotes: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!item) {
    res.status(404).render("errors/error", {
      title: "Feedback nenájdený",
      message: "Požadovaná pripomienka neexistuje.",
    });
    return;
  }

  res.render("admin/feedback/detail", { title: `Pripomienka #${item.id}`, item });
}

export async function updateFeedbackStatus(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const parsed = updateFeedbackStatusSchema.safeParse(req.body);
  const redirectTo = safeRedirect(req.body.redirectTo, `/admin/feedback/${id}`);

  if (!parsed.success) {
    setFlash(req, "error", "Neplatný stav.");
    res.redirect(redirectTo);
    return;
  }

  const item = await prisma.feedbackItem.findUnique({ where: { id } });
  if (!item) {
    res.status(404).render("errors/error", {
      title: "Feedback nenájdený",
      message: "Požadovaná pripomienka neexistuje.",
    });
    return;
  }

  await prisma.feedbackItem.update({ where: { id }, data: { status: parsed.data.status } });

  setFlash(req, "success", "Stav pripomienky bol zmenený.");
  res.redirect(redirectTo);
}

export async function addInternalNote(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const parsed = createInternalNoteSchema.safeParse(req.body);

  if (!parsed.success) {
    setFlash(req, "error", parsed.error.errors[0]?.message ?? "Neplatná poznámka.");
    res.redirect(`/admin/feedback/${id}`);
    return;
  }

  const item = await prisma.feedbackItem.findUnique({ where: { id } });
  if (!item) {
    res.status(404).render("errors/error", {
      title: "Feedback nenájdený",
      message: "Požadovaná pripomienka neexistuje.",
    });
    return;
  }

  await prisma.internalNote.create({
    data: {
      feedbackItemId: id,
      userId: req.session.userId!,
      note: parsed.data.note,
    },
  });

  setFlash(req, "success", "Interná poznámka bola pridaná.");
  res.redirect(`/admin/feedback/${id}`);
}
