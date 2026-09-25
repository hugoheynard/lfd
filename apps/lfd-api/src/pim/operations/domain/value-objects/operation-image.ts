import type { OperationImage } from "@lfd/pim-contracts";

import { InvalidOperationImageError } from "../errors/operation-errors.js";

export type { OperationImage };

/**
 * **L'image d'une opération** : une URL de la médiathèque et son texte
 * alternatif, ou rien.
 *
 * Le texte alternatif peut être vide — une image décorative n'a rien à dire à
 * un lecteur d'écran —, l'adresse jamais : une image sans adresse n'affiche
 * rien, et compterait pourtant comme « une image » à l'écran.
 *
 * @throws {InvalidOperationImageError} l'adresse est vide.
 */
export function operationImage(raw: OperationImage | null): OperationImage | null {
  if (raw === null) {
    return null;
  }
  const url = raw.url.trim();
  if (url === "") {
    throw new InvalidOperationImageError();
  }
  return { url, alt: raw.alt.trim() };
}
