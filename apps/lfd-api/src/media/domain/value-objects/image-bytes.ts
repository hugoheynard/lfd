import { MEDIA_LIMITS } from "@lfd/pim-contracts";
import { imageDimensions, sniffContentType } from "@lfd/storage";

import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les bornes viennent du CONTRAT depuis le 2026-09-23, et n'étaient nulle part
 * ailleurs avant.
 *
 * 🔴 Elles vivaient ici, en trois constantes privées, et l'écran n'en disait
 * rien : le seul moyen d'apprendre qu'un fichier est trop lourd était de se le
 * faire refuser. Deux gabarits recopiaient déjà la liste des formats en dur.
 * Une règle que l'écran annonce et que le serveur applique ne peut pas vivre à
 * deux endroits — l'un des deux finit par mentir.
 *
 * Ce fichier reste le seul à REFUSER. Le contrat ne fait que publier les
 * chiffres pour que l'écran puisse prévenir.
 *
 * L'AVIF et le HEIC sont absents pour une raison plus bête que le SVG : ils
 * partagent l'en-tête `ftyp` du MP4, que le renifleur appelle aujourd'hui
 * `audio/mp4`.
 */
const ACCEPTED: readonly string[] = MEDIA_LIMITS.acceptedTypes;
const MAX_BYTES = MEDIA_LIMITS.maxBytes;
const MIN_EDGE_PIXELS = MEDIA_LIMITS.minEdgePixels;

export class UnsupportedImageError extends DomainError {
  constructor(reason: string) {
    super("catalogue.media.unsupported_image", `Visuel refusé : ${reason}`);
  }
}

/** Une image validée : ses octets, et ce qu'ils disent d'eux-mêmes. */
export interface ProductImage {
  readonly bytes: Buffer;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

/**
 * Valide des octets déposés, et rend ce qu'on en a constaté.
 *
 * **Rien n'est cru sur parole.** Ni le `Content-Type` annoncé par le
 * navigateur, ni l'extension du fichier, ni les dimensions : tout est relu dans
 * les octets. C'est la seule défense qui tienne — un fichier hostile s'annonce
 * toujours correctement.
 *
 * L'ordre des contrôles est délibéré : on refuse ce qui est vide, puis ce qui
 * est trop gros (avant de faire travailler quoi que ce soit dessus), puis ce
 * dont le type n'est pas accepté, et seulement ensuite on mesure.
 */
export function productImage(bytes: Buffer): ProductImage {
  if (bytes.length === 0) {
    throw new UnsupportedImageError("le fichier est vide.");
  }
  if (bytes.length > MAX_BYTES) {
    throw new UnsupportedImageError(
      `${megabytes(bytes.length)} Mo dépassent la limite de ${megabytes(MAX_BYTES)} Mo.`,
    );
  }

  const contentType = sniffContentType(bytes);
  if (contentType === null || !isAccepted(contentType)) {
    throw new UnsupportedImageError(
      `format non accepté — PNG, JPEG ou WebP attendus (reçu : ${contentType ?? "inconnu"}).`,
    );
  }

  const size = imageDimensions(bytes);
  if (size === null) {
    // Le type est reconnu mais l'en-tête ne se lit pas : le fichier est tronqué
    // ou trafiqué. Le laisser passer donnerait un visuel sans dimensions dont
    // personne ne saurait dire, plus tard, s'il est cassé ou simplement ancien.
    throw new UnsupportedImageError("les dimensions sont illisibles — fichier incomplet ?");
  }
  if (size.width < MIN_EDGE_PIXELS || size.height < MIN_EDGE_PIXELS) {
    throw new UnsupportedImageError(
      `${size.width}×${size.height} est trop petit — ${MIN_EDGE_PIXELS} px minimum sur chaque côté.`,
    );
  }

  return {
    bytes,
    contentType,
    width: size.width,
    height: size.height,
    byteLength: bytes.length,
  };
}

function isAccepted(mime: string): boolean {
  return ACCEPTED.some((accepted) => accepted === mime);
}

function megabytes(count: number): string {
  return (count / (1024 * 1024)).toFixed(1).replace(".", ",");
}
