import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus propres à la commande d'un particulier composée en TTC — plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 5, voie B).
 */

/**
 * R5 — une surtaxe de retard sur une commande de particulier. Elle n'existe
 * que pour une société passée après l'heure limite sur dérogation ; la
 * boutique n'en pose pas (`place-shop-order.handler.ts`, relu le 2026-10-27).
 */
export class LateFeeOnPersonalOrderError extends DomainError {
  constructor() {
    super(
      "orders.late_fee.personal_order",
      "Cette commande de particulier porte une surtaxe de retard : la surtaxe ne " +
        "s'applique qu'à une commande de société passée après l'heure limite. " +
        "Repasser la commande sans dérogation, ou la passer pour la société.",
    );
  }
}

/**
 * Une commande composée en TTC (`exact_ht`) pour une société. La méthode se
 * décide à la passation sur l'absence de société ; une révision la relit et
 * ne change pas la société — ce cas ne vient que d'une donnée corrompue.
 */
export class ExactVatMethodForCompanyError extends DomainError {
  constructor() {
    super(
      "orders.vat_method.company_order",
      "Cette commande de société est marquée « composée en TTC », un calcul réservé " +
        "aux particuliers : elle ne peut pas être recalculée ainsi. Signaler la " +
        "commande à l'équipe technique.",
    );
  }
}
