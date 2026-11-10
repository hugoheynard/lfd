/**
 * Le calendrier des trois rythmes d'une entité — clôtures, avis et échéances
 * sur six semaines (tableau de bord de la comptabilité).
 */
export class GetBillingRhythmsCalendarQuery {
  constructor(readonly legalEntityId: string) {}
}
