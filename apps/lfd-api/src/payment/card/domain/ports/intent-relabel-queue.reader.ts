/**
 * **La file des libellés dus** (plan `documentation/payment/plan-pointage-stripe.md`,
 * lot 2) — ce que le balayage reprend : les paiements dont le libellé est à
 * poser et l'échéance passée, la plus ancienne d'abord. Lecture seule.
 */
export abstract class IntentRelabelQueue {
  abstract due(at: Date, limit: number): Promise<readonly string[]>;
}
