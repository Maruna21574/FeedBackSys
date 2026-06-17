import path from "path";
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import session from "express-session";
import sessionFileStore from "session-file-store";
import expressLayouts from "express-ejs-layouts";

import { env } from "./config/env";
import {
  PROJECT_STATUS_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_COLORS,
  FEEDBACK_EDITABLE_STATUSES,
} from "./lib/constants";
import { csrfTokenMiddleware, csrfProtection } from "./lib/csrf";
import { flashMiddleware } from "./lib/flash";
import { widgetRateLimiter } from "./middleware/rateLimit";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { widgetRouter } from "./routes/widget.routes";
import { dashboardRouter } from "./routes/index";

const FileStore = sessionFileStore(session);

export const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

// crossOriginResourcePolicy je vypnuty, pretoze /widget.js, /widget.css a obrazky
// musia byt nacitatelne z webov klientov (inych originov), nielen z tejto domeny.
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:"],
      },
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Staticke assety (CSS/JS dashboardu, widget.js/css, demo stranka)
app.use(express.static(env.publicDir));

// Nahrane screenshoty a prilohy (nahodne UUID nazvy => bezpecne servovat staticky)
app.use("/uploads", express.static(path.join(env.storage.root, "uploads")));

// ---------------------------------------------------------------------------
// Widget API - verejne, scoped cez :token, vlastne CORS a rate limit.
// Mountuje sa skor, nez session middleware - widget requesty nepotrebuju cookies.
// ---------------------------------------------------------------------------
const widgetCors = cors({
  origin: env.widgetCorsOrigin === "*" ? "*" : env.widgetCorsOrigin.split(",").map((o) => o.trim()),
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

app.use("/api/widget", widgetCors, widgetRateLimiter, widgetRouter);

// ---------------------------------------------------------------------------
// Session-based dashboard (admin / klient / login)
// ---------------------------------------------------------------------------
app.use(
  session({
    store: new FileStore({ path: env.storage.sessions, retries: 0, logFn: () => {} }),
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: "feedback.sid",
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      maxAge: 1000 * 60 * 60 * 8, // 8 hodin
    },
  })
);

app.set("views", env.viewsDir);
app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", "layout");

app.use(csrfTokenMiddleware);
app.use(flashMiddleware);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.currentPath = req.path;
  res.locals.currentUser = req.session.userId
    ? { id: req.session.userId, name: req.session.userName, role: req.session.role }
    : null;
  res.locals.appUrl = env.appUrl;
  res.locals.PROJECT_STATUS_LABELS = PROJECT_STATUS_LABELS;
  res.locals.FEEDBACK_STATUS_LABELS = FEEDBACK_STATUS_LABELS;
  res.locals.FEEDBACK_STATUS_COLORS = FEEDBACK_STATUS_COLORS;
  res.locals.FEEDBACK_EDITABLE_STATUSES = FEEDBACK_EDITABLE_STATUSES;
  next();
});

app.use(csrfProtection);

app.use(dashboardRouter);

app.use(notFoundHandler);
app.use(errorHandler);
