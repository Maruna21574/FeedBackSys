import { Router } from "express";
import { showClientPortal, downloadReport } from "../controllers/client.controller";

export const clientRouter = Router();

clientRouter.get("/", showClientPortal);
clientRouter.get("/reports/:batchId", downloadReport);
