import type { PayerStanding } from "./payer-standing.reader.js";

/**
 * **Tous les comptes clients, et leurs périodes `billing` en cours** — de quoi
 * compter les clients d'un rythme, défaut mensuel compris. Le tri « payeur ou
 * site » reste au domaine (`isBillingPayerAt`, le critère de
 * `requireBillingPayer`). Port à part de `PayerStandingReader` (ISP) : un seul
 * compte d'un côté, tous de l'autre, et pas les mêmes consommateurs.
 */
export abstract class PayerStandingsReader {
  abstract allAt(at: Date): Promise<readonly PayerStanding[]>;
}
