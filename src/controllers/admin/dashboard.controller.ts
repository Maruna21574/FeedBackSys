import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";

export async function showDashboard(req: Request, res: Response): Promise<void> {
  const [clientsCount, activeProjectsCount, newCount, inProgressCount, totalFeedbackCount, recentBatches] =
    await Promise.all([
      prisma.client.count(),
      prisma.project.count({ where: { status: "active" } }),
      prisma.feedbackItem.count({ where: { status: "new" } }),
      prisma.feedbackItem.count({ where: { status: "in_progress" } }),
      prisma.feedbackItem.count({ where: { status: { not: "draft" } } }),
      prisma.feedbackBatch.findMany({
        take: 5,
        orderBy: { submittedAt: "desc" },
        include: { project: true, client: true },
      }),
    ]);

  res.render("admin/dashboard", {
    title: "Dashboard",
    stats: {
      clientsCount,
      activeProjectsCount,
      newCount,
      inProgressCount,
      totalFeedbackCount,
    },
    recentBatches,
  });
}
