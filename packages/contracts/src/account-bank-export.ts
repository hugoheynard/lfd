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

/**
 * Pourquoi la banque connaît un compte sans notre fichier (doc § 2.6) : saisi
 * à la main dans CENET, ou signalé comme déjà connu par la banque. Des VALEURS.
 */
export const KNOWN_BANK_ACCOUNT_REASON_VALUES = ["entered_in_cenet", "reported_by_bank"] as const;
export type KnownBankAccountReasonView = (typeof KNOWN_BANK_ACCOUNT_REASON_VALUES)[number];

/**
 * Où en est un compte débité : à exporter, dans un export en vol, importé par
 * un export, déclaré connu (avec sa raison), ou écarté du fichier.
 */
export type AccountBankStandingView =
  | { readonly kind: "to_export" }
  | { readonly kind: "in_flight" }
  | { readonly kind: "imported"; readonly at: string }
  | { readonly kind: "declared"; readonly reason: KnownBankAccountReasonView; readonly at: string }
  | { readonly kind: "excluded"; readonly reason: AccountBankExclusionReasonView };

/** Une ligne du tableau des comptes. L'IBAN ne s'y montre que masqué. */
export interface AccountBankRowView {
  readonly bankAccountId: string;
  readonly companyName: string;
  /** L'enseigne de la société, `null` si elle n'en déclare pas. */
  readonly tradeName: string | null;
  /** Le titulaire du RIB, tel que la banque du client le connaît. */
  readonly holder: string;
  /** Les deux lettres de pays de l'IBAN. */
  readonly ibanCountry: string;
  readonly ibanLast4: string;
  /** `null` quand le RIB n'en porte pas — le compte est alors écarté. */
  readonly bic: string | null;
  readonly standing: AccountBankStandingView;
}

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
  /** `null` tant que le fichier n'a jamais été téléchargé — « marquer importé » est alors refusé. */
  readonly lastDownloadedAt: string | null;
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
  /** Tous les comptes débités, écartés compris — dans l'ordre de dépôt, écartés à la fin. */
  readonly accounts: readonly AccountBankRowView[];
  /** Le plus récent d'abord. */
  readonly exports: readonly AccountBankExportSummaryView[];
}

export interface AccountBankExportCreatedView {
  readonly exportId: string;
}

/** Déclarer un compte connu de la banque, sans fichier, et dire pourquoi. */
export const declareBankAccountKnownPayloadSchema = z.strictObject({
  bankAccountId: z.string().min(1),
  reason: z.enum(KNOWN_BANK_ACCOUNT_REASON_VALUES),
});
export type DeclareBankAccountKnownPayload = z.infer<typeof declareBankAccountKnownPayloadSchema>;
