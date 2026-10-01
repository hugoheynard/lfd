/**
 * **La procédure de livraison d'une commande, lue VIVANTE** (plan « Ma
 * tournée », MT-D5 v2) — les étapes que le client a écrites pour l'adresse
 * reliée à la commande : entrer par la cour, code du portail…
 *
 * Elle n'est PAS figée au départ, et c'est voulu : une consigne corrigée par
 * le client doit atteindre le livreur en route. Ce que le départ fige
 * (adresse, contact, fenêtre) est ce qui a été PROMIS ; la procédure est un
 * mode d'emploi.
 *
 * La livraison DÉCLARE, le commerce implémente (`b2b/orders/infrastructure/`),
 * relié dans `appBootstrap/delivery-feed.module.ts`. Le commerce lit sous le
 * mur `(adresse, société)` : une adresse qui n'est pas à la société de la
 * commande ne rend aucune étape.
 */
export abstract class DeliveryProceduresReader {
  /**
   * Les étapes de chaque commande, dans l'ordre. Une commande sans adresse
   * reliée, ou dont l'adresse n'a pas de procédure, est absente.
   */
  abstract proceduresOf(orderIds: readonly string[]): Promise<readonly DeliveryOrderProcedure[]>;
}

/** La procédure de l'adresse reliée à une commande. */
export interface DeliveryOrderProcedure {
  readonly orderId: string;
  readonly steps: readonly DeliveryProcedureStep[];
}

/**
 * Une étape. La clé de stockage de la photo ne sort pas du commerce : sa
 * présence et sa révision seulement, comme la feuille de route.
 */
export interface DeliveryProcedureStep {
  readonly id: string;
  readonly title: string;
  /** `""` quand l'étape n'a pas de texte. */
  readonly body: string;
  readonly hasPhoto: boolean;
  readonly photoRevision: string | null;
}
