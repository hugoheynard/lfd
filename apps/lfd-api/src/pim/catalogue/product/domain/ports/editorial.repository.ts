import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
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
  /**
   * Le satellite de la fiche : la règle qui peut refuser est portée par
   * `Product` — une fiche archivée ne reçoit pas de textes
   * (`Product.requireEditable`), et le handler la juge avant d'écrire ici. La
   * forme des textes est tenue par le value object (`editorial`), l'existence
   * de la fiche, supprimée comprise, par `requireProduct`. Ce port n'écrit que
   * ce que la fiche a accepté.
   */
  abstract save(
    productId: string,
    editorial: Editorial,
    media: readonly MediaItem[],
    ticket: WriteTicket,
  ): Promise<void>;
  /**
   * Remplace la liste entière des visuels, dans l'ordre reçu.
   *
   * Comme `save` : une fiche archivée refuse ses visuels
   * (`Product.requireEditable`, jugé par le handler avant cette écriture), et
   * la liste est jugée par construction (`mediaItems` — URL obligatoire, rôle
   * unique là où il doit l'être, position dérivée du rang).
   */
  abstract replaceMedia(
    productId: string,
    media: readonly MediaItem[],
    ticket: WriteTicket,
  ): Promise<void>;
}
