import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/** Un mandat ACTIF, avec son créancier — ce qui rattache une commande à une entité. */
export interface CollectionMandate {
  readonly mandateId: string;
  readonly companyId: string;
  /** `null` = RUM reprise d'un autre créancier : elle ne rattache à aucune entité. */
  readonly creditorId: string | null;
  readonly reference: string;
  /** En clair — il vient d'être déscellé. Le lot le rescelle sur sa ligne. */
  readonly iban: string;
  readonly bic: string | null;
  readonly scheme: SepaScheme;
  readonly paymentType: MandatePaymentType;
  readonly signedAt: Date;
}

/**
 * Les mandats actifs des payeurs, **tous créanciers confondus** — déclaré par la
 * comptabilité, implémenté par `payments` (même raison que
 * `DebtorMandateReader` : les tables sont les siennes).
 *
 * Un port à part de `DebtorMandateReader` parce que la réponse n'a pas la même
 * forme : celui-là rend UN mandat par société et tait le créancier, ce qui
 * ferait choisir au hasard entre deux entités. Celui-ci rend tout, et c'est la
 * constitution qui refuse l'ambiguïté (plan §1).
 *
 * Un mandat actif sans compte recopié n'est pas rendu : il ne peut rien débiter.
 */
export abstract class CollectionMandatesReader {
  abstract activeFor(companyIds: readonly string[]): Promise<readonly CollectionMandate[]>;
}
