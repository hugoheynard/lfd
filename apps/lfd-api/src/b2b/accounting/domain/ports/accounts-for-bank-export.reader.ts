/**
 * Un compte débité par un mandat actif de l'entité, prêt à partir à la banque.
 * Titulaire et adresse sont ceux du RIB, tels que la banque du client les
 * connaît — pas la raison sociale ni l'adresse de facturation.
 */
export interface AccountForBankExport {
  /** `company_bank_accounts.id`. */
  readonly bankAccountId: string;
  /** La société qui porte le RIB (le principal, pour un site qui garde le sien). */
  readonly companyId: string;
  /** Sa raison sociale — pour NOMMER le compte à l'écran et dans un refus. */
  readonly companyName: string;
  /** Son enseigne, `null` si elle n'en déclare pas — l'écran la montre d'abord. */
  readonly tradeName: string | null;
  /** Son SIREN, `null` s'il n'est pas connu. */
  readonly siren: string | null;
  readonly holder: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
  /** ISO 3166-1 alpha-2, celui de l'adresse du titulaire. */
  readonly countryCode: string;
  /** En clair — il vient d'être descellé. Ne se range nulle part. */
  readonly iban: string;
  /** Jamais vide : un compte sans BIC est écarté (`no_bic`). */
  readonly bic: string;
  /** Les quatre derniers caractères, pour reconnaître le compte à l'écran. */
  readonly ibanLast4: string;
  /** Le dépôt du RIB — l'ordre stable des 200 premiers (§ 2.2). */
  readonly recordedAt: Date;
}

/** Pourquoi un compte débité ne part pas à la banque. Une VALEUR : stable. */
export type AccountExclusionReason = "no_bic";

/** Un compte écarté, nommé par sa société. Aucune coordonnée bancaire. */
export interface AccountExcludedFromBankExport {
  readonly bankAccountId: string;
  readonly companyName: string;
  readonly tradeName: string | null;
  readonly holder: string;
  /** Les deux lettres de pays de l'IBAN — rien d'autre n'en sort. */
  readonly ibanCountry: string;
  readonly ibanLast4: string;
  readonly reason: AccountExclusionReason;
}

export interface AccountsForBankExport {
  readonly exportable: readonly AccountForBankExport[];
  readonly excluded: readonly AccountExcludedFromBankExport[];
}

/**
 * **Les comptes débités par les mandats actifs d'UNE entité**, descellés —
 * déclaré par la comptabilité, implémenté par `payments`, qui possède
 * `payment_mandates` et `company_bank_accounts` (même partage que
 * `MandatesForBankExportReader`, doc `prerequis-export-ribs.md` § 4, lot 2).
 *
 * Un compte n'y figure qu'une fois, même s'il porte plusieurs mandats ou
 * sites (R5). Les mandats repris d'un autre créancier n'y amènent pas leur
 * compte : leur mandat ne part pas à la banque, et le compte n'a donc pas à y
 * être déclaré (choix du 2026-10-23, § 7).
 */
export abstract class AccountsForBankExportReader {
  abstract debitedBy(creditorId: string): Promise<AccountsForBankExport>;
}
