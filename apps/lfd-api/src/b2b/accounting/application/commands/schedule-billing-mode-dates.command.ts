/**
 * Programme les dates d'un mode de facturation de l'entité (plan
 * `plan-rythme-de-facturation.md`, §16). Le mode et les jours arrivent tels
 * que reçus : `billingModeOf` et `BillingRhythm` les jugent, et leur refus dit
 * ce qui est attendu.
 */
export class ScheduleBillingModeDatesCommand {
  constructor(
    readonly legalEntityId: string,
    readonly mode: string,
    readonly days: readonly number[],
    readonly staffId: string,
  ) {}
}
