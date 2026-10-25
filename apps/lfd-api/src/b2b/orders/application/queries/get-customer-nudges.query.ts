/**
 * Query **staff** : les relances d'un retrait en retard d'une date de
 * service, `AAAA-MM-JJ`, et leurs délais — ce que la Supervision lit pour
 * choisir le bouton et dire « Rappel envoyé le … par … » (Hugo, 2026-10-25).
 */
export class GetCustomerNudgesQuery {
  constructor(readonly day: string) {}
}
