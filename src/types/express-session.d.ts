import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    role?: "admin" | "client";
    userName?: string;
    clientId?: number | null;
    csrfToken?: string;
    flash?: FlashMessage[];
  }
}

export interface FlashMessage {
  type: "success" | "error" | "info";
  text: string;
}
