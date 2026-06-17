import { Router } from "express";
import { showLoginPage, login, logout } from "../controllers/auth.controller";
import { loginRateLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.get("/login", showLoginPage);
authRouter.post("/login", loginRateLimiter, login);
authRouter.post("/logout", logout);
