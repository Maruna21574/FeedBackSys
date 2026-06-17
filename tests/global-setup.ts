import { execSync } from "child_process";
import path from "path";
import fs from "fs";

/**
 * Vytvori cistu testovaciu SQLite databazu (prisma/test.db) pred behom testov.
 * Spusta sa raz pred celou test suitou (vitest globalSetup).
 */
export default function globalSetup(): void {
  const root = path.join(__dirname, "..");
  const testDbFile = path.join(root, "prisma", "test.db");

  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = testDbFile + suffix;
    if (fs.existsSync(file)) fs.rmSync(file);
  }

  execSync("npx prisma migrate deploy", {
    cwd: root,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });

  // Izolovane ulozisko pre testy (oddelene od storage/ pouzivaneho dev/produkcnym behom,
  // aby testy neprepisovali a nemazali realne screenshoty/PDF reporty).
  const testStorageRoot = path.join(root, "storage", "test");
  fs.rmSync(testStorageRoot, { recursive: true, force: true });
  for (const dir of ["uploads/screenshots", "uploads/attachments", "reports", "sessions"]) {
    fs.mkdirSync(path.join(testStorageRoot, dir), { recursive: true });
  }
}
