import type { Doc } from "../../../platform/pdf/paper-pdf-kit.js";

/**
 * **Un bon de livraison, prêt à se dessiner** sur la page courante du
 * dossier du jour. Il tourne lui-même ses pages quand son tableau déborde, et
 * porte son propre en-tête (logo, « BON DE LIVRAISON », numéro).
 *
 * Une fonction et non des données : le dessin du BL appartient au commerce
 * (`b2b/delivery-notes`), et `production → b2b` est fermé. Le fournil ne sait
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
 * **Le BL de transport d'exemple**, pour le dossier du jour de la planche des
 * documents. Port à part (ISP) : seul l'exemple le demande, et il ne lit
 * aucune commande réelle.
 */
export abstract class SpecimenDeliveryNoteReader {
  abstract specimenDrawing(now: Date): Promise<DeliveryNoteDrawing>;
}
