import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de **« Décider du départ »** (lot E6b,
 * `documentation/commandes/plan-e6-le-depart-incomplet.md` § 12.2 et § 13).
 * Lus par l'équipe au téléphone : chacun nomme le cas et le geste de sortie.
 */

/** Q-I4 : une décision par commande, définitive. */
export class ShortfallAlreadyDecidedError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall_decision.already_decided",
      `Le départ de ${reference} est déjà décidé, et la décision est définitive : rien n'a été changé. Rechargez la commande pour la voir.`,
    );
  }
}

/** La décision ne vaut que pour une commande confirmée au plan, pas encore prête. */
export class ShortfallOrderNotConfirmedError extends BusinessError {
  constructor(reference: string, status: string) {
    super(
      "orders.shortfall_decision.not_confirmed",
      `${reference} n'est pas une commande confirmée au plan du fournil (statut « ${status} ») : son départ ne se décide pas. ` +
        "Une commande déjà prête est partie complète ; une commande annulée ne part pas.",
    );
  }
}

/** § 7 : le trop-perçu d'une carte n'a pas encore de chemin de retour. */
export class CardOrderShortfallError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall_decision.card",
      `${reference} est réglée par carte : le départ incomplet viendra avec le remboursement partiel (E9). ` +
        "D'ici là, complétez la commande, ou annulez-la et recommandez ce qui est au bac.",
    );
  }
}

/** § 13 : un bon de fidélité imputé n'a pas de règle de répartition. */
export class VoucherOrderShortfallError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall_decision.voucher",
      `${reference} porte un bon de fidélité : un départ incomplet ne sait pas encore le répartir. ` +
        "Complétez la commande, ou annulez-la (le bon est rendu) et recommandez ce qui est au bac.",
    );
  }
}

/** § 13 : un montant sans l'ajustement qui l'a produit ne se recalcule pas sur ce qui part. */
export class OrderTooOldForShortfallError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall_decision.too_old",
      `${reference} est une commande trop ancienne pour un départ incomplet : sa remise, ses frais ou sa surtaxe ` +
        "n'ont pas gardé la règle qui les a produits, et ne se recalculent pas sur ce qui part. " +
        "Complétez la commande, ou annulez-la et recommandez ce qui est au bac.",
    );
  }
}

/** § 13 : rien au bac — ce n'est pas un départ incomplet, c'est une annulation. */
export class NothingDepartsError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall_decision.nothing_departs",
      `Aucune pièce de ${reference} n'est au bac : rien ne partirait. Annulez la commande.`,
    );
  }
}
