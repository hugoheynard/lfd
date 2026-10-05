import type { BillingCycle } from "../services/billing-cycle.js";

/**
 * Une période de suivi `billing` (`company_follows`) : de `validFrom` inclus à
 * `validTo` exclu, le site `companyId` était réglé par `payerId`.
 */
export interface BillingFollow {
  readonly companyId: string;
  readonly payerId: string;
  /** Le payeur, tel qu'il se reconnaît — pour « payé par … ». */
  readonly payerName: string;
  readonly validFrom: Date;
  /** `null` = en cours. */
  readonly validTo: Date | null;
}

/** Un sous-compte qui règle seul : listé sur le relevé de son principal, sans montant. */
export interface SelfPayingEntity {
  readonly companyId: string;
  readonly name: string;
}

/**
 * **Qui règle pour qui**, vu du relevé de cycle (vue payeur, avant S4).
 *
 * Un port à part de `CycleOrdersReader` : l'un lit des commandes, l'autre des
 * décisions datées de la hiérarchie des comptes. Le relevé est le seul à
 * croiser les deux, et le croisement est du domaine (`billedPayerOf`).
 *
 * ⚠️ Disparaît en partie avec S4 : une fois `orders.billed_company_id` figé à la
 * passation, le payeur se lit sur la commande et `followsTowards` n'a plus de
 * lecteur (plan-sous-comptes §2.3).
 */
export abstract class StatementBillingReader {
  /** Les périodes `billing` dont `payerId` est le payeur, qui chevauchent le cycle. */
  abstract followsTowards(payerId: string, cycle: BillingCycle): Promise<readonly BillingFollow[]>;

  /** Les périodes `billing` de `companyId` lui-même (il est le site), qui chevauchent le cycle. */
  abstract followsOf(companyId: string, cycle: BillingCycle): Promise<readonly BillingFollow[]>;

  /**
   * Les sous-comptes ACTUELS de `parentId` (`parent_company_id`) qui ne suivent
   * pas `billing` à `at` : des entités qui règlent seules.
   */
  abstract selfPayingSubAccounts(parentId: string, at: Date): Promise<readonly SelfPayingEntity[]>;
}
