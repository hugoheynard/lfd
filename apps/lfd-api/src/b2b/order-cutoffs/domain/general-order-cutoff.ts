import { OrderCutoffScopeRetiredError } from "./order-cutoff-errors.js";

/** Ce que dit la règle générale : N jours avant, à telle heure, avec tel rattrapage. */
export interface GeneralOrderCutoffTerms {
  readonly daysBefore: number;
  /** `HH:MM`, pendule d'Europe/Paris. */
  readonly time: string;
  readonly graceMinutes: number;
}

/** Ce qu'un réglage demande — portée comprise, pour qu'elle puisse être refusée. */
export interface GeneralOrderCutoffRequest extends GeneralOrderCutoffTerms {
  readonly pickupAddressId: string | null;
  readonly weekday: string | null;
}

/**
 * **La règle générale d'heure limite** — la seule qui existe depuis le
 * 2026-10-21 (décision de Hugo, `limites-de-commande/schema-des-reglages.md`
 * §4, point 4).
 *
 * Elle porte UNE règle de refus, et c'est pour elle qu'elle existe : une
 * demande qui vise un point de retrait ou un jour de semaine est refusée
 * ({@link OrderCutoffScopeRetiredError}). La base le refuse aussi (CHECK
 * `order_cutoffs_general_only`) ; le domaine le refuse le premier, avec un
 * message qu'un membre du staff peut lire.
 *
 * Les bornes de forme (heure `HH:MM`, délai `0..14`, rattrapage `0..720`) sont
 * celles du contrat et restent tenues par lui.
 */
export class GeneralOrderCutoffRule {
  private constructor(
    readonly id: string,
    readonly terms: GeneralOrderCutoffTerms,
  ) {}

  /** Pose la règle générale pour la première fois. */
  static define(id: string, request: GeneralOrderCutoffRequest): GeneralOrderCutoffRule {
    return new GeneralOrderCutoffRule(id, termsOf(request));
  }

  /** Relit la règle rangée. */
  static rehydrate(id: string, terms: GeneralOrderCutoffTerms): GeneralOrderCutoffRule {
    return new GeneralOrderCutoffRule(id, terms);
  }

  /** La même règle, réglée autrement — son identifiant ne change pas. */
  redefine(request: GeneralOrderCutoffRequest): GeneralOrderCutoffRule {
    return new GeneralOrderCutoffRule(this.id, termsOf(request));
  }
}

function termsOf(request: GeneralOrderCutoffRequest): GeneralOrderCutoffTerms {
  if (request.pickupAddressId !== null || request.weekday !== null) {
    throw new OrderCutoffScopeRetiredError();
  }
  return {
    daysBefore: request.daysBefore,
    time: request.time,
    graceMinutes: request.graceMinutes,
  };
}
