/**
 * Ce que l'étiquette d'un sac dit de l'acheminement, en phrases prêtes à
 * poser — les MÊMES que les papiers du fournil.
 */
export interface OrderLabelHead {
  /** « Retrait Village · pro » — `fulfillmentLabelOf`, celui du dossier du jour. */
  readonly fulfillmentLabel: string;
  /** « 8 h 00 – 10 h 00 », « Pour 10:00 » ou « Sans heure convenue » — l'en-tête du bon. */
  readonly when: string;
}

/**
 * **« Comment le fournil titre-t-il cette commande ? »** — port que le fournil
 * PUBLIE et implémente, que le colisage lit pour imprimer l'étiquette d'un sac
 * (2026-10-25, demande de Hugo : « je ne peux pas faire d'étiquette pour les
 * sacs »).
 *
 * Même figure que {@link InscribedOrderHeaderReader} : le libellé et le
 * créneau sont composés par le fournil à partir de SON instantané, avec les
 * fonctions de ses papiers. Le colisage les pose tels quels — il ne recompose
 * pas, et l'étiquette ne peut pas dire autre chose que le bon.
 */
export abstract class OrderLabelHeadReader {
  /** `null` : la commande n'est pas inscrite à cette journée. */
  abstract headOf(serviceDay: string, orderId: string): Promise<OrderLabelHead | null>;
}
