// SQLite v Prisma nepodporuje enumy, takze role a stavy su String polia.
// Tieto konstanty su jediny zdroj pravdy pre povolene hodnoty v celej appke.

export const ROLES = ["admin", "client"] as const;
export type Role = (typeof ROLES)[number];

export const PROJECT_STATUSES = ["active", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Aktívny",
  archived: "Archivovaný",
};

export const FEEDBACK_STATUSES = ["draft", "new", "in_progress", "done", "rejected"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

// Stavy, do ktorych moze admin manualne prepnut feedback (draft je len interny stav pred odoslanim)
export const FEEDBACK_EDITABLE_STATUSES = ["new", "in_progress", "done", "rejected"] as const;

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  draft: "Rozpracované",
  new: "Nové",
  in_progress: "V riešení",
  done: "Hotové",
  rejected: "Zamietnuté",
};

export const FEEDBACK_STATUS_COLORS: Record<FeedbackStatus, string> = {
  draft: "gray",
  new: "blue",
  in_progress: "blue",
  done: "green",
  rejected: "red",
};
