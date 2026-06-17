import multer from "multer";
import { env } from "../config/env";

/**
 * Multer ulozi sub do pamate - obsah skontrolujeme podla "magic bytes"
 * (detectImageType) skor, nez ho zapiseme na disk pod nahodnym nazvom.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadSizeMb * 1024 * 1024 },
});

interface ImageSignature {
  ext: "png" | "jpg" | "webp";
  mime: string;
  check: (buffer: Buffer) => boolean;
}

const SIGNATURES: ImageSignature[] = [
  {
    ext: "png",
    mime: "image/png",
    check: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    ext: "jpg",
    mime: "image/jpeg",
    check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "webp",
    mime: "image/webp",
    check: (b) =>
      b.length >= 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
];

/**
 * Zisti realny typ obrazka podla obsahu suboru (nie podla nazvu/mimetype z requestu).
 * Vrati null, ak subor nie je podporovany obrazok (PNG/JPEG/WEBP).
 */
export function detectImageType(buffer: Buffer): { ext: string; mime: string } | null {
  for (const sig of SIGNATURES) {
    if (sig.check(buffer)) {
      return { ext: sig.ext, mime: sig.mime };
    }
  }
  return null;
}
