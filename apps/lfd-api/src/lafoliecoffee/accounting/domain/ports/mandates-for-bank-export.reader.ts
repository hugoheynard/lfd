import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/** Un mandat actif de l'entité, prêt à partir à la banque. */
export interface MandateForBankExport {
  readonly mandateId: string;
  /** La RUM. */
  readonly reference: string;
  /** Le débiteur figé à la frappe — celui dont le `pain.008` écrit le nom. */
  readonly debtorCompanyId: string;
  /** En clair — il vient d'être descellé. Ne se range nulle part. */
  readonly iban: string;
  /** Jamais vide : un mandat sans BIC est écarté (`no_bic`). */
  readonly bic: string;
  /** `accepted_at` — le jour du papier. */
  readonly signedAt: Date;
  readonly scheme: SepaScheme;
  readonly paymentType: MandatePaymentType;
}

/**
 * Pourquoi un mandat actif ne part pas à la banque (plan § 2 bis-5) :
 * repris d'un autre créancier (`creditor_id` nul — colonnes L/M du modèle, à
 * voir avec la banque, A17), sans compte recopié, ou sans BIC.
 */
export type BankExportExclusionReason = "taken_over" | "no_account" | "no_bic";

/** Un mandat actif écarté, et sa raison. Aucune coordonnée bancaire. */
export interface MandateExcludedFromBankExport {
  readonly mandateId: string;
  readonly reference: string;
  readonly debtorCompanyId: string;
  readonly reason: BankExportExclusionReason;
}

export interface MandatesForBankExport {
  readonly exportable: readonly MandateForBankExport[];
  readonly excluded: readonly MandateExcludedFromBankExport[];
}

/**
 * **Les mandats actifs d'UNE entité émettrice**, comptes descellés — déclaré
 * par la comptabilité, implémenté par `payments`, qui possède
 * `payment_mandates` et `company_bank_accounts` (même partage que
 * `CollectionMandatesReader`, plan § 2 bis-2).
 *
 * Un port à part des lecteurs du lot, qui sont indexés par société : celui-ci
 * est filtré par créancier, et rend aussi ce qu'il écarte, pour que l'écran
 * le nomme au lieu de le taire.
 *
 * ⚠️ Les mandats repris (`creditor_id` nul) ne sont rattachés à AUCUNE entité ;
 * ils sont rendus écartés quelle que soit l'entité demandée.
 */
export abstract class MandatesForBankExportReader {
  abstract activeOf(creditorId: string): Promise<MandatesForBankExport>;
}
