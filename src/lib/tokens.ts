import crypto from "crypto";

/**
 * Vygeneruje bezpecny nahodny token pre projekt (pouziva sa vo widget snippete).
 * Token nesie iba pravo na operacie widget API daneho projektu (drafty + submit).
 */
export function generateProjectToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Vygeneruje nahodne unikatne meno suboru so zachovanou priponou.
 */
export function generateFileName(originalName: string): string {
  const ext = originalName.includes(".")
    ? originalName.slice(originalName.lastIndexOf("."))
    : "";
  return `${crypto.randomUUID()}${ext.toLowerCase()}`;
}
