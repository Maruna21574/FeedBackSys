import { Router } from "express";
import { authRouter } from "./auth.routes";
import { adminRouter } from "./admin.routes";
import { clientRouter } from "./client.routes";
import { requireAuth, requireRole } from "../middleware/auth";

export const dashboardRouter = Router();

dashboardRouter.use("/", authRouter);
dashboardRouter.use("/admin", requireAuth, requireRole("admin"), adminRouter);
dashboardRouter.use("/client", requireAuth, requireRole("client"), clientRouter);

// Domovska stranka presmeruje na prislusny dashboard / login.
dashboardRouter.get("/", (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
    return;
  }
  res.redirect(req.session.role === "admin" ? "/admin" : "/client");
});
