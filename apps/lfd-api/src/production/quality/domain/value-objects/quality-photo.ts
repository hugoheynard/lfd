import { InvalidQualityPhotoError } from "../errors/quality-record-errors.js";

/**
 * **10 Mo** par photo de contrôle (D8). Une photo de téléphone non réduite, HEIC
 * compris, y tient : le superviseur photographie au fournil, sans outil pour
 * réduire. `@lfd/contracts` en garde une copie (`QUALITY_PHOTO_MAX_BYTES`) ; le
 * test tient la parité.
 */
export const QUALITY_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Les quatre formats qu'un contrôle accepte (D8). */
export type QualityPhotoContentType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

/** Les marques `ftyp` d'un HEIF/HEIC d'appareil photo. */
const HEIC_BRANDS: ReadonlySet<string> = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
]);

const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * Le type d'une photo, relu dans ses octets de tête — le `mimetype` annoncé par
 * le client se falsifie d'un champ de formulaire, les octets non. `null` quand
 * ce n'est aucun des quatre.
 *
 * Réécrit ici plutôt qu'emprunté aux cartes à photo : elles sont `b2b/`, et
 * n'acceptent ni WebP ni HEIC (`CLAUDE.md` §3, plan D8).
 */
export function qualityPhotoContentType(bytes: Buffer): QualityPhotoContentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (ascii(bytes, 4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(bytes, 8, 12))) {
    return "image/heic";
  }
  return null;
}

/**
 * **La photo d'un contrôle**, validée au dépôt.
 *
 * Ni dimensions, ni ratio : une photo floue reste plus utile que pas de photo,
 * et les dimensions d'un HEIC ne se lisent pas sans décodeur. Ce qui est refusé
 * est ce qui coûterait (le poids) ou ne se reconnaîtrait pas (le format).
 *
 * `create()` est le seul constructeur : une photo non conforme n'existe pas en
 * mémoire, donc ne part jamais au stockage.
 */
export class QualityPhoto {
  private constructor(
    readonly bytes: Buffer,
    readonly contentType: QualityPhotoContentType,
  ) {}

  /** @throws {InvalidQualityPhotoError} vide, trop lourde, ou d'un format refusé. */
  static create(bytes: Buffer | null): QualityPhoto {
    if (bytes === null || bytes.length === 0) {
      throw new InvalidQualityPhotoError("aucune image reçue. Reprenez la photo.");
    }
    if (bytes.length > QUALITY_PHOTO_MAX_BYTES) {
      throw new InvalidQualityPhotoError(
        `elle pèse ${megabytes(bytes.length)} Mo, la limite est de ` +
          `${megabytes(QUALITY_PHOTO_MAX_BYTES)} Mo. Reprenez-la en qualité réduite.`,
      );
    }
    const contentType = qualityPhotoContentType(bytes);
    if (contentType === null) {
      throw new InvalidQualityPhotoError(
        "un JPEG, un PNG, un WebP ou un HEIC est attendu. Reprenez la photo avec l'appareil.",
      );
    }
    return new QualityPhoto(bytes, contentType);
  }

  get byteSize(): number {
    return this.bytes.length;
  }
}

function megabytes(bytes: number): string {
  return (bytes / BYTES_PER_MEGABYTE).toFixed(1);
}

function startsWith(bytes: Buffer, magic: readonly number[]): boolean {
  return bytes.length >= magic.length && magic.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Buffer, from: number, to: number): string {
  return bytes.length < to ? "" : bytes.subarray(from, to).toString("latin1");
}
