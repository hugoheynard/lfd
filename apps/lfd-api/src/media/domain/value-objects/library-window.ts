import { DomainError } from "../../../platform/shared/errors/app-error.js";
import type { LibrarySort } from "./library-order.js";

/**
 * Plafond d'une page. Une médiathèque se parcourt à l'œil : au-delà, l'écran
 * charge des aperçus que personne ne regarde, et le premier fonds sérieux
 * ferait une réponse de plusieurs mégaoctets.
 */
const MAX_PAGE = 100;
const DEFAULT_PAGE = 60;

/** Le décalage ne se combine ni avec un curseur ni avec un autre ordre que le dépôt. */
export class UnsupportedLibraryOffsetError extends DomainError {
  constructor() {
    super(
      "media.library.offset_unsupported",
      "La médiathèque ne se lit plus par décalage qu'en tri par dépôt et sans curseur : reprenez la lecture avec le curseur `next` de la page précédente (`after`).",
    );
  }
}

/** Combien d'images, et à partir d'où — une fois bornés. */
export interface LibraryWindow {
  readonly limit: number;
  readonly offset: number;
}

/**
 * La fenêtre d'une page du fonds, bornée.
 *
 * Bornée ICI et pas au bord : « donne-moi toute la bibliothèque » n'est pas
 * une intention qu'on sert, quel que soit le chemin d'entrée.
 *
 * Le décalage est l'ancienne lecture, gardée en attendant que l'écran lise le
 * curseur (2026-10-10) : il n'a de sens qu'en tri par dépôt et sans curseur.
 *
 * @throws {UnsupportedLibraryOffsetError} un décalage avec un curseur ou un autre tri.
 */
export function libraryWindow(request: {
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
  readonly withCursor: boolean;
  readonly sort: LibrarySort;
}): LibraryWindow {
  const limit = Math.min(Math.max(Math.trunc(request.limit ?? DEFAULT_PAGE), 1), MAX_PAGE);
  const offset = Math.max(Math.trunc(request.offset ?? 0), 0);
  if (offset > 0 && (request.withCursor || request.sort !== "deposited")) {
    throw new UnsupportedLibraryOffsetError();
  }
  return { limit, offset };
}
