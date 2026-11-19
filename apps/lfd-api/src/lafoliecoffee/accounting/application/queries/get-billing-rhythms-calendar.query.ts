/**
 * Le calendrier des trois rythmes d'une entité — clôtures, avis et échéances
 * sur un mois calendaire (tableau de bord de la comptabilité). Sans mois, le
 * mois en cours à Paris.
 */
export class GetBillingRhythmsCalendarQuery {
  constructor(
    readonly legalEntityId: string,
    readonly month: string | null = null,
  ) {}
}
