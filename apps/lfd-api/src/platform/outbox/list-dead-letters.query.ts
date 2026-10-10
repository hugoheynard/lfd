/** Lire les messages morts de la boîte d'envoi (plan §8), bornés. */
export class ListDeadLettersQuery {
  constructor(readonly limit: number) {}
}
