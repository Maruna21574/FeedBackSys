import { z } from "zod";
import { PROJECT_STATUSES, FEEDBACK_EDITABLE_STATUSES } from "../lib/constants";

export const loginSchema = z.object({
  email: z.string().trim().email("Zadajte platnú emailovú adresu."),
  password: z.string().min(1, "Zadajte heslo."),
});

export const createClientSchema = z.object({
  name: z.string().trim().min(1, "Zadajte názov klienta."),
  email: z.string().trim().email("Zadajte platnú emailovú adresu."),
  note: z.string().trim().optional().or(z.literal("")),
  password: z.string().min(6, "Heslo musí mať aspoň 6 znakov."),
});

export const createProjectSchema = z.object({
  clientId: z.coerce.number().int().positive("Vyberte klienta."),
  name: z.string().trim().min(1, "Zadajte názov projektu."),
  url: z.string().trim().url("Zadajte platnú URL adresu (vrátane https://)."),
});

export const updateProjectStatusSchema = z.object({
  status: z.enum(PROJECT_STATUSES),
});

export const updateFeedbackStatusSchema = z.object({
  status: z.enum(FEEDBACK_EDITABLE_STATUSES),
});

export const createInternalNoteSchema = z.object({
  note: z.string().trim().min(1, "Zadajte text poznámky."),
});

export const createFeedbackItemSchema = z.object({
  note: z.string().trim().min(1, "Zadajte text poznámky.").max(2000, "Poznámka je príliš dlhá."),
  url: z.string().trim().min(1, "Chýba URL stránky.").max(2000),
  pageTitle: z.string().trim().max(300).optional().or(z.literal("")),
  cssSelector: z.string().trim().max(500).optional().or(z.literal("")),
  xPosition: z.coerce.number().finite(),
  yPosition: z.coerce.number().finite(),
  viewportWidth: z.coerce.number().int().positive(),
  viewportHeight: z.coerce.number().int().positive(),
});
