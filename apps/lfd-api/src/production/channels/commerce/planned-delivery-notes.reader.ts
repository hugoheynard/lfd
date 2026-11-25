import type { Doc } from "../../../platform/pdf/paper-pdf-kit.js";

/**
 * **Un bon de livraison, prêt à se dessiner** sur la page courante du
 * dossier du jour. Il tourne lui-même ses pages quand son tableau déborde, et
 * porte son propre en-tête (logo, « BON DE LIVRAISON », numéro).
 *
 * Une fonction et non des données : le dessin du BL appartient au commerce
 * (`lafoliecoffee/delivery-notes`), et `production → b2b` est fermé. Le fournil ne sait
 * rien de ce qu'un BL contient — il lui donne une page, et compte les pages
 * qu'il a prises.
 */
export type DeliveryNoteDrawing = (doc: Doc) => void;

/**
 * **Le BL de transport de ces commandes, au moment d'imprimer le dossier**
 * (Hugo, 2026-10-25 : « imprimer le BL prévu avec chaque fiche de commande »).
 *
 * Déclaré par le fournil, implémenté par le commerce avec le rendu même du BL
 * non chiffré, relié dans `appBootstrap`. Port à lui (ISP) : le dossier ne lit
 * ni les BL ni les commandes — il reçoit de quoi les poser.
 */
export abstract class PlannedDeliveryNotesReader {
  /**
   * Par commande, le dessin de son BL de transport. Une commande sans BL
   * vivant (pas encore né, annulé, commande inconnue) est ABSENTE : le dossier
   * n'imprime alors aucun BL pour elle, jamais un BL deviné.
   */
  abstract drawingsOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, DeliveryNoteDrawing>>;
}

/**
 * **Les commandes qui n'ont pas encore leur BL** — la question que l'envoi du
 * dossier pose à l'arrêt, avant de partir (décidé par Hugo le 2026-11-25 :
 * « on doit toujours avoir tous les BL »).
 *
 * L'arrêt est écouté par deux abonnés sans ordre entre eux : le commerce, qui
 * fait naître les BL, et le fournil, qui envoie et archive le dossier. Le
 * fournil demande donc d'abord ici ce qui manque, et attend.
 *
 * Port à lui (ISP) : une lecture groupée des seuls BL, sans dessin ni
 * commande. Une commande inconnue, ou dont le seul BL est annulé, est rendue
 * comme sans BL.
 */
export abstract class DeliveryNotesBornReader {
  abstract withoutNote(orderIds: readonly string[]): Promise<readonly string[]>;
}

/**
 * **Le BL de transport d'exemple**, pour le dossier du jour de la planche des
 * documents. Port à part (ISP) : seul l'exemple le demande, et il ne lit
 * aucune commande réelle.
 */
export abstract class SpecimenDeliveryNoteReader {
  abstract specimenDrawing(now: Date): Promise<DeliveryNoteDrawing>;
}
