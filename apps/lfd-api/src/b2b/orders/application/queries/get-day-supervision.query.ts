/**
 * Query **staff** : la Supervision d'une date de service, `AAAA-MM-JJ`
 * (`documentation/order/plan-supervision-du-jour.md`).
 */
export class GetDaySupervisionQuery {
  constructor(readonly day: string) {}
}
