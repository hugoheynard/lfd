/**
 * **« Un envoi de cette commande est-il déjà retiré ? »** — la question de
 * l'annulation (plan E7 reliquat, `documentation/commandes/plan-e7-reliquat-bati.md`,
 * §3 bis, fermé en L4c).
 *
 * Le retrait DÉCLARE et IMPLÉMENTE ce port, le commerce le lit — même figure
 * que `OrderHandoverHistoryReader`, mais une question à part (ISP) : l'historique
 * raconte le rang 1 pour le dossier de facturation, ceci regarde TOUS les
 * envois. Un reliquat retiré avant son rang 1 (possible depuis que le comptoir
 * laisse décocher le rang 1) est un sac parti : la commande ne s'annule plus.
 *
 * Lu sous le verrou de la ligne `orders`, que le retrait prend aussi avant
 * d'attester (`HandoverOrderLock`) : la réponse ne peut pas changer entre la
 * lecture et l'écriture de l'annulation.
 */
export abstract class ShipmentHandoverReader {
  /** Vrai dès qu'un envoi de la commande, quel que soit son rang, porte une attestation. */
  abstract anyHandedOver(orderId: string): Promise<boolean>;
}
