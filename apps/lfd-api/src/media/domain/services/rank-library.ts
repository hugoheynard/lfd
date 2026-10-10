import { BusinessError } from "../../../platform/shared/errors/app-error.js";

import {
  comesAfter,
  compareImages,
  positionOf,
  type LibraryPosition,
  type LibrarySort,
  type RankedImage,
} from "../value-objects/library-order.js";

/**
 * Le plus grand fonds filtré qu'on classe EN MÉMOIRE.
 *
 * Les emplois viennent des porteurs, par le canal : ni l'ordre « emplois » ni
 * le filtre « inutilisées » ne peuvent se poser en SQL. On lit donc l'URL de
 * chaque candidat, on demande leurs emplois, on classe ici. Tenable en milliers
 * (quelques dizaines d'octets par image, un aller-retour par paquet de
 * porteurs) ; au-delà, c'est une requête qu'on refuse plutôt qu'un processus
 * qu'on sature.
 */
export const MAX_RANKED_IMAGES = 5000;

/** Le fonds filtré dépasse ce qu'on classe en mémoire. */
export class LibraryTooLargeToRankError extends BusinessError {
  constructor() {
    super(
      "media.library.too_large_to_rank",
      `Plus de ${MAX_RANKED_IMAGES} images correspondent : le tri par emplois et le filtre « inutilisées » ne s'appliquent pas à autant. Restreignez d'abord par mot-clé, par période ou par recherche.`,
    );
  }
}

export interface RankRequest {
  readonly sort: LibrarySort;
  readonly limit: number;
  /** Le décalage de l'ancien écran ; ignoré dès qu'une position est donnée. */
  readonly offset: number;
  readonly after?: LibraryPosition | undefined;
  /** Ne garder que les images qu'aucun porteur n'affiche. */
  readonly unused?: boolean | undefined;
}

export interface RankedPage {
  readonly images: readonly RankedImage[];
  /** Le total du filtre, « inutilisées » compris. */
  readonly total: number;
  readonly next: LibraryPosition | null;
}

/**
 * Classe et découpe un fonds dont on connaît déjà les emplois.
 *
 * Le curseur y est une POSITION (clé + URL), comme en SQL, et pas un rang :
 * une image déposée entre deux pages s'insère à sa place sans décaler la
 * suivante. Ce qui peut encore bouger, c'est l'image elle-même — un emploi de
 * plus la fait remonter —, et ça, aucun curseur ne le tient.
 */
export function rankLibrary(images: readonly RankedImage[], request: RankRequest): RankedPage {
  if (images.length > MAX_RANKED_IMAGES) {
    throw new LibraryTooLargeToRankError();
  }
  const kept = request.unused === true ? images.filter((image) => image.uses === 0) : images;
  const ordered = [...kept].sort((a, b) => compareImages(request.sort, a, b));
  const { after } = request;
  const remaining =
    after === undefined
      ? ordered.slice(request.offset)
      : ordered.filter((image) => comesAfter(image, after));
  const page = remaining.slice(0, request.limit);
  const last = page.at(-1);
  const next =
    remaining.length > page.length && last !== undefined ? positionOf(request.sort, last) : null;
  return { images: page, total: kept.length, next };
}
