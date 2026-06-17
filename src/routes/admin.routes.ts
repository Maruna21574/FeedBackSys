import { Router } from "express";
import { showDashboard } from "../controllers/admin/dashboard.controller";
import { listClients, createClient } from "../controllers/admin/clients.controller";
import {
  listProjects,
  createProject,
  showProjectDetail,
  updateProjectStatus,
  exportProjectFeedback,
} from "../controllers/admin/projects.controller";
import {
  listFeedback,
  showFeedbackDetail,
  updateFeedbackStatus,
  addInternalNote,
} from "../controllers/admin/feedback.controller";

export const adminRouter = Router();

adminRouter.get("/", showDashboard);

adminRouter.get("/clients", listClients);
adminRouter.post("/clients", createClient);

adminRouter.get("/projects", listProjects);
adminRouter.post("/projects", createProject);
adminRouter.get("/projects/:id", showProjectDetail);
adminRouter.get("/projects/:id/export", exportProjectFeedback);
adminRouter.post("/projects/:id/status", updateProjectStatus);

adminRouter.get("/feedback", listFeedback);
adminRouter.get("/feedback/:id", showFeedbackDetail);
adminRouter.post("/feedback/:id/status", updateFeedbackStatus);
adminRouter.post("/feedback/:id/notes", addInternalNote);
