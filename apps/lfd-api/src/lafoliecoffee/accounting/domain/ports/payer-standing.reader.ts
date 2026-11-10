import type { BillingFollow } from "./statement-billing.reader.js";

/** Un compte client, et ses périodes `billing` en cours à l'instant demandé. */
export interface PayerStanding {
  readonly companyId: string;
  readonly name: string;
  /** La société est au statut `active` (ni en attente, ni suspendue, ni résiliée). */
  readonly active: boolean;
  /** Les périodes `billing` où ce compte est le SITE, qui couvrent l'instant. */
  readonly follows: readonly BillingFollow[];
}

/**
 * **Ce compte est-il un payeur ?** (plan `plan-rythme-de-facturation.md`,
 * §16.6-5) — lu pour refuser un mode posé sur un site qui facture chez un
 * autre. Le jugement est du domaine (`billingFollowAt`, comme `billedPayerOf`) ;
 * ce port ne rend que les faits.
 */
export abstract class PayerStandingReader {
  /** Le compte et ses périodes `billing` à `at`, ou `null` s'il n'existe pas. */
  abstract standingOf(companyId: string, at: Date): Promise<PayerStanding | null>;
}
