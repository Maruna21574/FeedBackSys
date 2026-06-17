import dotenv from "dotenv";
import path from "path";

dotenv.config();

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: num(process.env.PORT, 3000),
  appUrl: process.env.APP_URL ?? "http://localhost:3000",

  databaseUrl: process.env.DATABASE_URL ?? "file:./prisma/dev.db",

  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-insecure-secret",

  adminNotificationEmail: process.env.ADMIN_NOTIFICATION_EMAIL ?? "",

  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: num(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "Feedback Tool <no-reply@example.com>",
  },

  widgetCorsOrigin: process.env.WIDGET_CORS_ORIGIN ?? "*",

  maxUploadSizeMb: num(process.env.MAX_UPLOAD_SIZE_MB, 5),

  // Absolutne cesty k uloznym priecinkom (mimo public/, sluzia sa cez staticku route)
  // Cesty su odvodene od pracovneho adresara procesu (projekt sa spusta z root priecinka,
  // a to rovnako v dev rezime cez tsx aj v produkcii cez `node dist/src/server.js`).
  // STORAGE_DIR umoznuje presmerovat ulozisko (napr. pre testy, aby nepretazovali
  // realne storage/ dáta) - relativna cesta sa odvodzuje od process.cwd().
  storage: (() => {
    const storageDir = process.env.STORAGE_DIR ?? "storage";
    const root = path.isAbsolute(storageDir) ? storageDir : path.join(process.cwd(), storageDir);
    return {
      root,
      screenshots: path.join(root, "uploads", "screenshots"),
      attachments: path.join(root, "uploads", "attachments"),
      reports: path.join(root, "reports"),
      sessions: path.join(root, "sessions"),
    };
  })(),

  viewsDir: path.join(process.cwd(), "src", "views"),
  publicDir: path.join(process.cwd(), "public"),
};
