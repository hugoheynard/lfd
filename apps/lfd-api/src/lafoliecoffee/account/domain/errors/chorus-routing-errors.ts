import { CHORUS_ROUTING_ERRORS } from "@lfd/contracts";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Le devis de période sans engagement exigé** (400) : sans numéro
 * d'engagement à attendre, il n'y a rien que le devis puisse recevoir.
 */
export class ChorusRoutingQuoteWithoutCommitmentError extends DomainError {
  constructor() {
    super(
      CHORUS_ROUTING_ERRORS.quoteWithoutCommitment,
      "L'engagement « sur le devis de la période » suppose que cet organisme exige un numéro " +
        "d'engagement. Cochez « Engagement exigé », ou gardez l'engagement à la commande.",
    );
  }
}

/**
 * **Le devis de période sans mercuriale active** (409) : l'organisme engage
 * son budget sur des prix convenus d'avance, et c'est la mercuriale qui les
 * tient.
 */
export class ChorusRoutingQuoteWithoutMercurialeError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      CHORUS_ROUTING_ERRORS.quoteWithoutMercuriale,
      "Ce client n'a pas de mercuriale active aujourd'hui : l'engagement sur le devis de la " +
        "période repose sur les prix convenus avec lui. Posez d'abord sa mercuriale (onglet " +
        "Tarifs), puis choisissez ce mode.",
    );
  }
}

/**
 * **Le mode ne change pas sous des commandes non facturées** (409) : elles
 * ont été passées sous l'autre mode, et la facture de la période les
 * mélangerait.
 */
export class ChorusRoutingTimingLockedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      CHORUS_ROUTING_ERRORS.timingLockedByOrders,
      "Des commandes au compte de ce client ne sont pas encore facturées : le moment de " +
        "l'engagement ne peut changer qu'une fois la période facturée. Gardez le mode actuel " +
        "et revenez après la facture.",
    );
  }
}

/**
 * **Le devis de période n'est pas encore disponible** (409) : sans lui, un
 * payeur commanderait sans numéro et sa clôture resterait bloquée.
 */
export class ChorusRoutingPeriodQuoteUnavailableError extends BusinessError {
  constructor() {
    super(
      CHORUS_ROUTING_ERRORS.periodQuoteUnavailable,
      "Le devis de période n'est pas encore disponible : gardez l'engagement à la commande " +
        "pour ce client.",
    );
  }
}
