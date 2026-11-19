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
   * Un CRUD, et c'est voulu : aucune règle ne peut refuser ces textes une fois
   * la fiche trouvée. Leur forme est tenue par le value object (`editorial`) ;
   * l'existence de la fiche, supprimée comprise, par `requireProduct` ; et une
   * fiche archivée reçoit ses textes comme une fiche en vente. Un agrégat
   * n'aurait aucun invariant à porter.
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
   * Un CRUD, pour la même raison que `save` : la liste est jugée par
   * construction (`mediaItems` — URL obligatoire, rôle unique là où il doit
   * l'être, position dérivée du rang), et rien de l'état de la fiche ne la
   * refuse.
   */
  abstract replaceMedia(
    productId: string,
    media: readonly MediaItem[],
    ticket: WriteTicket,
  ): Promise<void>;
}
