import { REQUEST_PHOTO_BOUNDS } from "@lfd/contracts";
import { imageDimensions } from "@lfd/storage";

import { megabytes } from "../../shared/photo-cards/domain/value-objects/card-photo.js";
import { InvalidRequestPhotoError } from "./errors/contact-errors.js";

/** Les trois formats qu'un signalement accepte (`REQUEST_PHOTO_BOUNDS`). */
export type RequestPhotoContentType = (typeof REQUEST_PHOTO_BOUNDS.contentTypes)[number];

interface AcceptedFormat {
  readonly contentType: RequestPhotoContentType;
  readonly matches: (bytes: Buffer) => boolean;
}

const RIFF = Buffer.from("RIFF", "ascii");
const WEBP = Buffer.from("WEBP", "ascii");
const WEBP_TAG_OFFSET = 8;

/** Reconnu aux octets de tête : le `mimetype` annoncé se falsifie, les octets non. */
const ACCEPTED_FORMATS: readonly AcceptedFormat[] = [
  {
    contentType: "image/jpeg",
    matches: (bytes) => startsWith(bytes, Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    contentType: "image/png",
    matches: (bytes) =>
      startsWith(bytes, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    contentType: "image/webp",
    matches: (bytes) =>
      startsWith(bytes, RIFF) &&
      bytes.subarray(WEBP_TAG_OFFSET, WEBP_TAG_OFFSET + WEBP.length).equals(WEBP),
  },
];

/**
 * **Une photo de signalement**, validée (`demandes-clients.md`, §7).
 *
 * Pas la `CardPhoto` du socle `b2b/shared/photo-cards/` : elle n'admet ni
 * WebP (que les téléphones produisent) ni 5 Mo, et sa mécanique de liste —
 * permuter, remplacer, retirer — n'a pas d'objet ici : un signalement reçoit
 * ses photos une fois. Le poids, le format relu aux octets et la lecture des
 * dimensions sont les mêmes règles (vérifié le 2026-10-09).
 *
 * `create()` est le seul constructeur : une photo non conforme n'existe pas
 * en mémoire, donc ne part jamais au stockage.
 */
export class RequestPhoto {
  private constructor(
    readonly bytes: Buffer,
    readonly contentType: RequestPhotoContentType,
  ) {}

  /** @throws {InvalidRequestPhotoError} vide, trop lourde, d'un format refusé ou tronquée. */
  static create(bytes: Buffer): RequestPhoto {
    if (bytes.length === 0) {
      throw new InvalidRequestPhotoError("le fichier est vide. Reprenez la photo.");
    }
    if (bytes.length > REQUEST_PHOTO_BOUNDS.maxBytes) {
      throw new InvalidRequestPhotoError(
        `elle pèse ${megabytes(bytes.length)} Mo, la limite est de ` +
          `${megabytes(REQUEST_PHOTO_BOUNDS.maxBytes)} Mo. Réduisez-la ou choisissez-en une autre.`,
      );
    }
    const contentType = requestPhotoContentType(bytes);
    if (contentType === null) {
      throw new InvalidRequestPhotoError(
        "un JPEG, un PNG ou un WebP est attendu (ni HEIC, ni PDF). Enregistrez la photo dans l'un de ces formats.",
      );
    }
    if (imageDimensions(bytes) === null) {
      throw new InvalidRequestPhotoError(
        "l'image est tronquée : ses dimensions ne se lisent pas. Reprenez la photo.",
      );
    }
    return new RequestPhoto(bytes, contentType);
  }

  get sizeBytes(): number {
    return this.bytes.length;
  }
}

/** Le type d'une photo, relu dans ses octets ; `null` hors des trois formats admis. */
export function requestPhotoContentType(bytes: Buffer): RequestPhotoContentType | null {
  return ACCEPTED_FORMATS.find((candidate) => candidate.matches(bytes))?.contentType ?? null;
}

function startsWith(bytes: Buffer, magic: Buffer): boolean {
  return bytes.subarray(0, magic.length).equals(magic);
}
