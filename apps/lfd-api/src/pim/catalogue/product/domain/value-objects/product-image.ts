import { imageDimensions, sniffContentType } from "@lfd/storage";

import { DomainError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Les types acceptés pour un visuel de catalogue.
 *
 * Liste d'**acceptation**, pas de refus : ce qui n'y est pas est refusé, et
 * l'ajout d'un format est une décision qu'on relit. Un SVG est du code exécuté
 * par le navigateur qui l'affiche — l'accepter mettrait du script sur notre
 * domaine média. L'AVIF et le HEIC sont absents pour une raison plus bête : ils
 * partagent l'en-tête `ftyp` du MP4, que le renifleur appelle aujourd'hui
 * `audio/mp4`.
 */
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * Plafond métier. Une photo de produit publiée dépasse rarement 2 Mo une fois
 * exportée ; 10 Mo laisse passer un export brut sans laisser passer une vidéo
 * renommée. Le multipart coupe bien plus haut, en garde-fou DoS — ce plafond-ci
 * est une règle, pas une protection.
 */
const MAX_BYTES = 10 * 1024 * 1024;

/** En deçà, ce n'est pas un visuel de catalogue : c'est une icône ou une erreur. */
const MIN_EDGE_PIXELS = 200;

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
