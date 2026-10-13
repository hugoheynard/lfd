import { BusinessError, TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **restitution d'un bon** à l'annulation de sa commande
 * (doc `documentation/commandes/annulation/fusion-du-bon.md`, lot C3b). Aucun
 * ne devrait sortir d'un parcours normal : chacun dit que l'état du bon et
 * celui de la commande se contredisent, ou qu'une écriture concurrente est
 * passée entre la lecture et l'écriture.
 */

/** Refondre un reliquat qui n'est pas celui de ce bon, ou plus disponible — **409**. */
export class LoyaltyVoucherNotMergeableError extends BusinessError {
  constructor(remainderId: string, why: string) {
    super(
      "loyalty.voucher_not_mergeable",
      `Le reliquat ${remainderId} ne peut pas être refondu dans son bon d'origine (${why}) : ` +
        "l'état du bon et celui de la commande se contredisent, à signaler à l'équipe technique.",
    );
  }
}

/** Éteindre un bon engagé qui n'est pas échu, ou pas engagé — **409**. */
export class LoyaltyVoucherNotLapsableError extends BusinessError {
  constructor(voucherId: string, why: string) {
    super(
      "loyalty.voucher_not_lapsable",
      `Le bon ${voucherId} ne peut pas être déclaré échu (${why}) : ` +
        "à signaler à l'équipe technique.",
    );
  }
}

/**
 * Rendre tel quel un bon dont le reliquat est déjà soldé — **409**. Le rendre
 * à pleine valeur À CÔTÉ de son reliquat doublerait la valeur : seule la
 * restitution (`reinstate`) sait refondre le reliquat.
 */
export class LoyaltyVoucherRemainderSettledError extends BusinessError {
  constructor(voucherId: string) {
    super(
      "loyalty.voucher_remainder_settled",
      `Le bon ${voucherId} a déjà laissé son reliquat : il ne peut pas être rendu tel quel, ` +
        "la valeur serait comptée deux fois. À signaler à l'équipe technique.",
    );
  }
}

/**
 * Le bon a changé d'état entre sa lecture et son écriture — **500**,
 * rejouable. Un instantané périmé n'écrase jamais un état plus récent (lot
 * C3b, C3b.2) : relancer le geste relit le bon tel qu'il est.
 */
export class LoyaltyVoucherChangedMeanwhileError extends TechnicalError {
  constructor(voucherId: string) {
    super(
      "loyalty.voucher_changed_meanwhile",
      `Le bon de fidélité ${voucherId} a changé pendant l'opération : rien n'a été écrit. Relancez le geste.`,
    );
  }
}

/**
 * Un reliquat engagé sans commande vivante qui le porte — **409**. La
 * réservation en transaction le rend impossible ; s'il arrive, on refuse
 * plutôt que de nommer une commande au hasard.
 */
export class LoyaltyRemainderCarrierMissingError extends BusinessError {
  constructor(remainderId: string) {
    super(
      "loyalty.remainder_carrier_missing",
      `Le reliquat ${remainderId} est engagé, mais aucune commande en cours ne le porte : ` +
        "l'annulation est refusée. À signaler à l'équipe technique.",
    );
  }
}
