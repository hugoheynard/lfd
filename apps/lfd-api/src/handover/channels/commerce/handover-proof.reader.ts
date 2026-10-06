import type { StoredDocument } from "../../../platform/storage/document-store.js";
import type { HandoverProofExhibit } from "../../domain/services/handover-proof-exhibit.js";
import type { HandoverProofPiece } from "../../domain/value-objects/handover-proof-image.js";

/**
 * **Les preuves de remise à la porte, en lecture, pour le commerce**
 * (`a-la-porte.md`, § 10, lot « voir les preuves ») — pour répondre à
 * une contestation depuis la fiche d'une commande.
 *
 * Le sens est l'INVERSE des trois lecteurs voisins : ici le retrait publie
 * ET implémente, le commerce lit — comme `OrderHandedOverEvent`. Les pièces
 * appartiennent au retrait (L6-C9) ; le commerce ne lit pas sa table.
 *
 * 🔴 Aucune clé de stockage ne sort : une image se demande par la COMMANDE,
 * et c'est l'adaptateur qui retrouve la clé de la pièce de cette commande-là.
 * Une clé reçue d'un client ouvrirait n'importe quelle image du bucket.
 */
export abstract class HandoverProofReader {
  /** La preuve à montrer, ou `null` : cette commande n'a pas été remise à la porte. */
  abstract ofOrder(orderId: string): Promise<HandoverProofExhibit | null>;

  /**
   * L'image de cette pièce, pour CETTE commande, ou `null` : pas de pièce, pas
   * de signature, ou déjà effacée.
   *
   * @throws {HandoverProofImageUnreadableError} les octets rangés ne sont pas une image.
   */
  abstract image(orderId: string, piece: HandoverProofPiece): Promise<StoredDocument | null>;
}
