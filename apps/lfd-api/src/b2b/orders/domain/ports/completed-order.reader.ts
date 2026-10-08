/**
 * Les commandes **définitives** : remises (`fulfilled`) ET encaissées
 * (`paymentStatus = paid`) — plan
 * `documentation/comptabilite/fidelite/plan-points-de-fidelite.md`, D3.
 *
 * ## Pourquoi c'est `orders` qui l'expose
 *
 * La fidélité crédite des points sur ces commandes, mais elle ne lit pas les
 * tables de la commande : une classe d'un contexte qui interroge celles d'un
 * autre en Prisma direct franchit une frontière que la porte d'imports ne voit
 * pas (`CLAUDE.md` §3). La règle « définitive » est donc écrite ICI, une fois,
 * par le contexte qui possède les deux colonnes.
 *
 * ⚠️ `not_required` n'est PAS un encaissement : chez un pro, il veut dire
 * « payé à terme » (D3, `orders.prisma`). Ce port ne le rend jamais.
 *
 * Une `clientele` nulle (commandes d'avant la distinction) n'est jamais rendue
 * non plus : elle ne dit ni « pro » ni « public », et rien ne la crédite (D1).
 */

/** Une commande définitive, telle que la fidélité en a besoin — et rien de plus. */
export interface CompletedOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly clientele: "pro" | "public";
  /** Nul pour le public, ou pour un pro dont la société a été supprimée. */
  readonly companyId: string | null;
  readonly placedByUserId: string;
  /**
   * La personne a un compte connectable. Faux = un **invité** : ses points
   * seraient inaccessibles (D1). L'identifiant de connexion lui-même ne sort
   * pas d'ici — seul ce booléen.
   */
  readonly buyerHasAccount: boolean;
  /** Les marchandises **hors taxe**, avant remise — centimes. */
  readonly subtotalCents: number;
  /** La remise du point de retrait, **hors taxe** — centimes. */
  readonly discountCents: number;
  /** La part du bon de fidélité imputée, **hors taxe** — centimes, `0` sans bon. */
  readonly voucherDiscountCents: number;
}

/** Un lot, et le curseur du suivant (`null` = plus rien après). */
export interface CompletedOrderPage {
  readonly orders: readonly CompletedOrder[];
  readonly nextAfter: string | null;
}

export abstract class CompletedOrderReader {
  /** La commande si elle est définitive, `null` sinon — ou si elle n'existe pas. */
  abstract findCompleted(orderId: string): Promise<CompletedOrder | null>;

  /**
   * Au plus `limit` commandes définitives d'identifiant strictement supérieur à
   * `after`, dans l'ordre des identifiants : un parcours par lots bornés qui ne
   * saute ni ne répète rien, même si l'état change entre deux lots.
   */
  abstract listCompleted(after: string | null, limit: number): Promise<CompletedOrderPage>;
}
