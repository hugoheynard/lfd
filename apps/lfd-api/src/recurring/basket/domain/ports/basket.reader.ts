import type { AdminSubscriptionRow, SubscriptionView } from "@lfd/contracts";

import type { IsoDate } from "../value-objects/iso-date.js";

/** Un membre d'une société, tel que la vue du staff le nomme. */
export interface BasketBuyerName {
  readonly userId: string;
  readonly name: string;
}

/**
 * Port de **lecture** des paniers. Une lecture ne rejoue aucune règle.
 *
 * Deux murs : le client lit **les siens** ; le back-office lit **ceux des
 * membres d'une société**, dont l'appelant lui donne la liste — le bloc ne
 * lit pas l'annuaire des comptes.
 *
 * Chaque panier vient avec ses échéances dont le jour de service est au plus
 * tôt `since`, triées par jour ; l'appelant fixe la fenêtre.
 */
export abstract class BasketReader {
  abstract listForBuyer(buyerUserId: string, since: IsoDate): Promise<readonly SubscriptionView[]>;

  /** Les paniers de ces acheteurs, plus récents d'abord, nommés. */
  abstract listForBuyers(
    buyers: readonly BasketBuyerName[],
    since: IsoDate,
  ): Promise<readonly AdminSubscriptionRow[]>;
}
