import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de **« Décider du départ »** (lot E6b,
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 12.2 et § 13).
 * Lus par l'équipe au téléphone : chacun nomme le cas et le geste de sortie.
 */

/** Q-I4 : une décision par envoi, définitive. */
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

/**
 * Plan E7 reliquat, choix 11 : le départ d'un reliquat ne se décide que tant
 * que son BL est prévu — son bac n'est pas fermé.
 */
export class RemainderNotDecidableError extends BusinessError {
  constructor(reference: string, rank: number, noteStatus: string | null) {
    super(
      "orders.shortfall_decision.remainder_not_planned",
      noteStatus === null
        ? `Le reste n° ${String(rank)} de ${reference} n'a pas de bon de livraison vivant : il a été annulé ou n'existe pas, ` +
            "et son départ ne se décide pas. Rechargez la commande pour voir ses envois."
        : `Le reste n° ${String(rank)} de ${reference} n'est plus à coliser (bon de livraison « ${noteStatus} ») : ` +
            "son départ ne se décide pas. Un reste déjà préparé est parti complet ; rechargez la commande pour le voir.",
    );
  }
}

/**
 * La carte n'est pas encore encaissée : le reste se rembourse sur ce qui a été
 * payé, et rien ne l'est (plan `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 2.1).
 */
export class CardOrderUnpaidShortfallError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall_decision.card_unpaid",
      `${reference} est réglée par carte, et la carte n'est pas encore encaissée : ` +
        "le départ incomplet attend le paiement. Relancez le règlement, ou complétez la commande.",
    );
  }
}

/**
 * Une hausse par carte attend son paiement ou son application : le reste
 * se calculerait sur un total qui va changer (plan E9, § 2.2).
 */
export class CardIncreasePendingShortfallError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall_decision.card_increase_pending",
      `${reference} a une hausse par carte en cours : le départ incomplet ne se décide pas tant ` +
        "qu'elle n'est ni payée et appliquée, ni abandonnée. Réglez-la depuis la fiche commande, puis recommencez.",
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
      `Aucune pièce de ${reference} n'est au bac : ce n'est pas un départ incomplet. Annulez la commande, ou attendez la production et remplissez le bac.`,
    );
  }
}
