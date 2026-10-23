import { z } from "zod";

/**
 * **L'export des comptes destinataires pour le portail de la banque**, tel que
 * la fiche de l'entité émettrice le lit (doc
 * `documentation/comptabilite/prelevement/prerequis-export-ribs.md`). Aucune
 * coordonnée bancaire : un compte se reconnaît à sa société et aux quatre
 * derniers caractères de son IBAN ; l'IBAN ne sort que dans le fichier.
 */

/** Pourquoi un compte débité ne part pas à la banque. Une VALEUR : stable. */
export type AccountBankExclusionReasonView = "no_bic";

/** Un compte, nommé — à exporter, ou écarté. */
export interface AccountBankAccountView {
  /** `company_bank_accounts.id` — ce que « déjà connu » désigne. */
  readonly bankAccountId: string;
  readonly companyName: string;
  readonly ibanLast4: string;
}

export interface AccountBankExcludedView extends AccountBankAccountView {
  readonly reason: AccountBankExclusionReasonView;
}

/** Un export préparé. Importé, abandonné, ou ni l'un ni l'autre (« en vol »). */
export interface AccountBankExportSummaryView {
  readonly id: string;
  readonly createdAt: string;
  readonly accountCount: number;
  readonly importedAt: string | null;
  readonly abandonedAt: string | null;
}

/** La carte « Comptes à la banque ». */
export interface AccountBankExportsView {
  /** Comptes débités par un mandat actif de l'entité, hors écartés. */
  readonly debitedCount: number;
  /** Dont à exporter — ni connus de la banque, ni dans un export en vol. */
  readonly toExport: readonly AccountBankAccountView[];
  /** Dont dans un export préparé, ni importé ni abandonné. */
  readonly inFlightCount: number;
  /** Dont importés, ou déclarés « déjà connu ». */
  readonly knownCount: number;
  /** Combien un export prend au plus (réponse 8 de la banque). */
  readonly maxPerExport: number;
  readonly excluded: readonly AccountBankExcludedView[];
  /** Le plus récent d'abord. */
  readonly exports: readonly AccountBankExportSummaryView[];
}

export interface AccountBankExportCreatedView {
  readonly exportId: string;
}

/** Déclarer un compte « déjà connu de la banque », sans fichier. */
export const declareBankAccountKnownPayloadSchema = z.strictObject({
  bankAccountId: z.string().min(1),
});
export type DeclareBankAccountKnownPayload = z.infer<typeof declareBankAccountKnownPayloadSchema>;
