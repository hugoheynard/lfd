import type { OperationImageLibrary } from "../../channels/media/operation-image-library.js";
import { UnknownOperationImageError } from "../../domain/errors/operation-errors.js";
import type {
  OperationImage,
  OperationImageInput,
} from "../../domain/value-objects/operation-image.js";

/** L'image telle que l'écran la choisit : une image du fonds, par son adresse. */
export interface ChosenImage {
  readonly url: string;
}

/**
 * **L'image vient de la médiathèque, ou n'est pas** (plan
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * O3, lot 2) — la règle de Hugo du 2026-09-23 pour les fiches et les
 * familles, que le référentiel appliquait déjà aux opérations.
 *
 * L'adresse est l'identité de l'image ; la médiathèque la décrit et donne son
 * point focal. Le texte alternatif aussi est le sien, et il n'est pas copié :
 * les lectures le lui demandent (plan, « Après le lot 2 », Hugo 2026-10-16 —
 * comme pour les fiches depuis le 2026-09-23).
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
    return { url };
  }
  if (current !== null && current.url === url) {
    return { url, focal: current.focal };
  }
  const described = await library.describe(url);
  if (described === null) {
    throw new UnknownOperationImageError(url);
  }
  return { url, focal: described.focal };
}

/**
 * L'image telle que le journal la dit : son adresse. Ni le point focal ni le
 * texte alternatif n'y entrent — ce sont des décisions de la médiathèque,
 * tracées chez elle (`media_asset.described`), pas des gestes sur l'opération.
 */
export function journalImage(image: OperationImage | null): ChosenImage | null {
  return image === null ? null : { url: image.url };
}
