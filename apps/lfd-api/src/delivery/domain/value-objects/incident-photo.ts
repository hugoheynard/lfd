import { InvalidIncidentPhotoError } from "../errors/delivery-doorstep-errors.js";

/** Le poids maximal d'une photo de problème — celle d'un téléphone, sans retouche. */
export const INCIDENT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export type IncidentPhotoContentType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

/** Les marques HEIF d'un iPhone et de ses cousins, lues à l'octet 8. */
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
 * Le type d'une photo, relu dans ses octets — le `mimetype` annoncé se
 * falsifie d'un champ de formulaire, les octets non. `null` : aucun des quatre.
 */
export function incidentPhotoContentType(bytes: Buffer): IncidentPhotoContentType | null {
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
 * **La photo d'un problème signalé** (`a-la-porte.md`, § 3) — facultative,
 * prise sur le trottoir. Ni taille minimale ni ratio : une photo floue reste
 * plus utile que pas de photo. Ce qui reste refusé coûterait au lecteur (le
 * poids) ou ne s'afficherait pas (un format inconnu). Les mêmes formats que la
 * photo de contrôle qualité : le téléphone est le même.
 *
 * `create()` est le seul constructeur : une photo refusée ne part jamais au
 * stockage.
 */
export class IncidentPhoto {
  private constructor(
    readonly bytes: Buffer,
    readonly contentType: IncidentPhotoContentType,
  ) {}

  /** @throws {InvalidIncidentPhotoError} vide, trop lourde, ou d'un format refusé. */
  static create(bytes: Buffer): IncidentPhoto {
    if (bytes.length === 0) {
      throw new InvalidIncidentPhotoError("aucune image reçue.");
    }
    if (bytes.length > INCIDENT_PHOTO_MAX_BYTES) {
      throw new InvalidIncidentPhotoError(
        `elle pèse ${megabytes(bytes.length)} Mo, la limite est de ` +
          `${megabytes(INCIDENT_PHOTO_MAX_BYTES)} Mo.`,
      );
    }
    const contentType = incidentPhotoContentType(bytes);
    if (contentType === null) {
      throw new InvalidIncidentPhotoError("un JPEG, un PNG, un WebP ou un HEIC est attendu.");
    }
    return new IncidentPhoto(bytes, contentType);
  }
}

function megabytes(bytes: number): string {
  return (bytes / BYTES_PER_MEGABYTE).toFixed(1);
}

function startsWith(bytes: Buffer, magic: readonly number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Buffer, from: number, to: number): string {
  return bytes.length < to ? "" : bytes.subarray(from, to).toString("latin1");
}
