import type { BillingRhythmKind } from "../../domain/value-objects/billing-rhythm.js";

/**
 * Règle le rythme de facturation de l'entité — mensuel, deux fois par mois,
 * ou chaque semaine, et ses jours de clôture (plan
 * `plan-rythme-de-facturation.md`, §2.1 et §10).
 *
 * Les jours arrivent tels que saisis : c'est le value object `BillingRhythm`
 * qui juge leur nombre et leurs bornes, et son refus qui le dit.
 */
export class SetBillingRhythmCommand {
  constructor(
    readonly legalEntityId: string,
    readonly kind: BillingRhythmKind,
    readonly days: readonly number[],
  ) {}
}
