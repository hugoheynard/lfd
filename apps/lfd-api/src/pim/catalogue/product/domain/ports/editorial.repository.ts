import type { WriteTicket } from "../../../../journal/pim-journal.js";
import type { Editorial, MediaItem } from "../value-objects/editorial.js";

/**
 * Écriture de la couche éditoriale.
 *
 * À la CRÉATION, les visuels partent avec elle : ils n'ont de sens qu'attachés,
 * et les écrire séparément ouvrirait une fenêtre où un produit a des images
 * sans fiche.
 *
 * Ensuite, ils vivent leur vie : le panneau Visuels remplace la liste sans
 * toucher aux textes, et le panneau Communication l'inverse. Les lier encore
 * obligerait chacun à renvoyer ce qu'il n'affiche pas — donc à l'écraser au
 * premier écran ouvert sur une donnée qu'il ne connaît pas.
 */
export abstract class EditorialRepository {
  abstract save(
    productId: string,
    editorial: Editorial,
    media: readonly MediaItem[],
    ticket: WriteTicket,
  ): Promise<void>;
  /** Remplace la liste entière des visuels, dans l'ordre reçu. */
  abstract replaceMedia(
    productId: string,
    media: readonly MediaItem[],
    ticket: WriteTicket,
  ): Promise<void>;
}
