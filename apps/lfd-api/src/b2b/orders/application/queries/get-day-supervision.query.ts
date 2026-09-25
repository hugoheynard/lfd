/**
 * Query **staff** : la Supervision d'une date de service, `AAAA-MM-JJ`
 * (`documentation/order/plan-supervision-du-jour.md`).
 *
 * `day` absent : le handler prend le jour courant de son `Clock`, à l'heure de
 * Paris (plan §5) — jamais l'horloge du poste.
 */
export class GetDaySupervisionQuery {
  constructor(readonly day?: string | undefined) {}
}
