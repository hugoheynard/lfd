import type { OperationImageLibrary } from "../../channels/media/operation-image-library.js";
import { UnknownOperationImageError } from "../../domain/errors/operation-errors.js";
import type {
  OperationImage,
  OperationImageInput,
} from "../../domain/value-objects/operation-image.js";

/** L'image telle que l'écran la choisit : une image du fonds, et le texte alternatif de l'opération. */
export interface ChosenImage {
  readonly url: string;
  readonly alt: string;
}

/**
 * **L'image vient de la médiathèque, ou n'est pas** (plan
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * O3, lot 2) — la règle de Hugo du 2026-09-23 pour les fiches et les
 * familles, que le référentiel appliquait déjà aux opérations.
 *
 * L'adresse est l'identité de l'image ; la médiathèque la décrit et donne son
 * point focal. Le texte alternatif reste celui de l'OPÉRATION, comme au
 * référentiel (`mediatheque.md` §7 bis : « l'alternative de l'opération ») :
 * la même image peut se dire autrement dans une autre annonce.
 *
 * Seulement si l'image CHANGE : la même adresse garde son point (que
 * `refocusImage` tient à jour), et une image retirée du fonds depuis
 * n'empêche pas de corriger une faute dans le nom. Une adresse vide n'est pas
 * demandée au fonds : l'agrégat la refuse en 400, ce qui dit mieux le cas.
 *
 * @throws {UnknownOperationImageError} la médiathèque ne connaît pas cette image.
 */
export async function imageFromLibrary(
  library: OperationImageLibrary,
  chosen: ChosenImage | null,
  current: OperationImage | null,
): Promise<OperationImageInput | null> {
  if (chosen === null) {
    return null;
  }
  const url = chosen.url.trim();
  if (url === "") {
    return chosen;
  }
  if (current !== null && current.url === url) {
    return { url, alt: chosen.alt, focal: current.focal };
  }
  const described = await library.describe(url);
  if (described === null) {
    throw new UnknownOperationImageError(url);
  }
  return { url, alt: chosen.alt, focal: described.focal };
}

/**
 * L'image telle que le journal la dit : l'adresse et le texte alternatif.
 * Le point focal n'y entre pas — c'est une décision de la médiathèque,
 * tracée chez elle (`media_asset.described`), pas un geste sur l'opération.
 */
export function journalImage(image: OperationImage | null): ChosenImage | null {
  return image === null ? null : { url: image.url, alt: image.alt };
}
