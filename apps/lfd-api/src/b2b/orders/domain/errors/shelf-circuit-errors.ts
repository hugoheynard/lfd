import { quantityFigure, type SaleQuantity } from "@lfd/money";

import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **circuit du jour J** à la passation (plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §11.1, §12,
 * lot L4) : une commande prise sur la vitrine n'a ni heure limite ni plan du
 * fournil ; ce qui la limite, c'est le point qui la sert encore aujourd'hui,
 * et ce qui reste en vitrine. Lus au comptoir et dans la boutique : chaque
 * message dit le cas réel et le geste de sortie.
 */

/**
 * Le point n'a plus de créneau de retrait aujourd'hui pour cette clientèle —
 * ou n'en a aucun (Q5 : pas d'heure de fin à régler, ce sont les créneaux
 * restants du site qui décident ; jamais un horaire inventé).
 */
export class NoPickupLeftTodayError extends BusinessError {
  constructor(readonly siteLabel: string | null) {
    super(
      "orders.shelf.no_pickup_left",
      siteLabel === null
        ? "Ce point de retrait ne sert plus de commande aujourd'hui : choisissez un autre point, ou une journée à partir de demain."
        : `Le point « ${siteLabel} » n'a plus de créneau de retrait aujourd'hui : choisissez un autre point, ou une journée à partir de demain.`,
    );
  }
}

/**
 * Ce qui reste en vitrine ne couvre pas la ligne — y compris un article
 * absent du stock du jour (un panier mixte, §3 : « un panier pour
 * aujourd'hui ne contient que des articles du stock du jour »).
 */
export class ShelfStockShortError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly label: string,
    readonly left: SaleQuantity,
    readonly asked: SaleQuantity,
  ) {
    super(
      "orders.shelf.stock_short",
      left.amount <= 0
        ? `« ${label} » n'est plus en vitrine à ce point aujourd'hui : retirez-le du panier, ou commandez pour demain.`
        : `Il ne reste que ${quantityFigure(left)} « ${label} » en vitrine à ce point aujourd'hui (demandé : ${quantityFigure(asked)}) : réduisez la quantité, ou commandez pour demain.`,
    );
  }
}

/**
 * Un pro sans crédit au compte, au comptoir, quand le réglage refuse ce cas
 * (Q7, « Pro sans crédit : refuser ») : le « Retrait immédiat » se règle au
 * compte, et ce client n'en a pas.
 */
export class ShelfWithoutCreditRefusedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "orders.shelf.without_credit",
      "Ce client n'a pas de crédit au compte, et le réglage Jour même refuse le retrait sur la vitrine sans crédit : passez une commande programmée, ou ouvrez-lui un crédit au compte.",
    );
  }
}
