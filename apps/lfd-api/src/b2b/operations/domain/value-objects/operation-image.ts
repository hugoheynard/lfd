import { InvalidOperationImageError } from "../errors/operation-errors.js";

/** L'image d'une opération : son adresse et son texte alternatif. */
export interface OperationImage {
  readonly url: string;
  readonly alt: string;
}

/**
 * **L'image d'une opération**, ou rien.
 *
 * Le texte alternatif peut être vide — une image décorative n'a rien à dire à
 * un lecteur d'écran —, l'adresse jamais : une image sans adresse n'affiche
 * rien, et compterait pourtant comme « une image » à l'écran.
 *
 * ⚠️ Au lot 1, rien ne vérifie que l'adresse est une image de la médiathèque :
 * le commerce ne la lit pas (`b2b → media` interdit). Le choix depuis la
 * médiathèque, et le porteur qui la compte, sont le lot 2 (O3 du plan).
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
