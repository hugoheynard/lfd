import type { WriteTicket } from "../../../../journal/pim-journal.js";
import type { MediaItem } from "../../../shared/domain/value-objects/media.js";
import type { CategoryEditorial } from "../value-objects/category-editorial.js";

/**
 * Écriture des textes et des visuels d'une famille.
 *
 * Deux verbes et non un, comme pour une fiche : la section « Communication »
 * remplace les textes sans toucher aux visuels, et la section « Visuels »
 * l'inverse. Les lier obligerait chacune à renvoyer ce qu'elle n'affiche pas —
 * donc à l'écraser au premier écran ouvert sur une donnée qu'il ne connaît pas.
 */
export abstract class CategoryEditorialRepository {
  abstract saveTexts(
    categoryId: string,
    editorial: CategoryEditorial,
    ticket: WriteTicket,
  ): Promise<void>;
  /** Remplace la liste entière des visuels, dans l'ordre reçu. */
  abstract replaceMedia(
    categoryId: string,
    media: readonly MediaItem[],
    ticket: WriteTicket,
  ): Promise<void>;
}
