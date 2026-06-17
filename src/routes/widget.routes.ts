import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { upload } from "../lib/upload";
import {
  listDraftItems,
  createDraftItem,
  deleteDraftItem,
  submitDrafts,
} from "../controllers/widget.controller";

export const widgetRouter = Router();

const uploadFields = upload.fields([
  { name: "screenshot", maxCount: 1 },
  { name: "attachment", maxCount: 1 },
]);

/**
 * Obali multer middleware tak, aby chyby (napr. prilis velky subor) skoncili
 * ako JSON 400 odpoved, a nie ako HTML error stranka z globalneho error handlera.
 */
function handleUpload(req: Request, res: Response, next: NextFunction): void {
  uploadFields(req, res, (err: unknown) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? "Súbor je príliš veľký."
          : "Nepodarilo sa nahrať súbor.";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

widgetRouter.get("/:token/items", listDraftItems);
widgetRouter.post("/:token/items", handleUpload, createDraftItem);
widgetRouter.delete("/:token/items/:id", deleteDraftItem);
widgetRouter.post("/:token/submit", submitDrafts);
