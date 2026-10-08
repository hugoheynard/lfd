import { z } from "zod";

/**
 * **L'export des mandats pour le portail de la banque**, tel que la fiche de
 * l'entité émettrice le lit (plan
 * `documentation/comptabilite/mandat/plan-export-des-mandats-pour-la-banque.md`,
 * § 2 bis). Aucune coordonnée bancaire : l'IBAN ne sort que dans le fichier.
 */

/** Pourquoi un mandat actif ne part pas à la banque. Une VALEUR : stable. */
export type MandateBankExclusionReasonView = "taken_over" | "no_account" | "no_bic";

/** Un mandat actif écarté de l'export, nommé. */
export interface MandateBankExcludedView {
  /** La RUM. */
  readonly reference: string;
  readonly debtorName: string;
  readonly reason: MandateBankExclusionReasonView;
}

/** Un export préparé. `importedAt` : `null` tant que personne ne l'a marqué. */
export interface MandateBankExportSummaryView {
  readonly id: string;
  readonly createdAt: string;
  readonly mandateCount: number;
  readonly importedAt: string | null;
}

/** La carte « Mandats à la banque ». */
export interface MandateBankExportsView {
  /** Mandats actifs exportables (hors écartés). */
  readonly exportableCount: number;
  /** Dont pas encore importés sous leur compte actuel. */
  readonly toExportCount: number;
  /** Dont déjà importés sous leur compte actuel. */
  readonly importedCount: number;
  readonly excluded: readonly MandateBankExcludedView[];
  /** Le plus récent d'abord. */
  readonly exports: readonly MandateBankExportSummaryView[];
}

/**
 * Préparer un export. `all` : tous les mandats actifs exportables, y compris
 * ceux que la banque a déjà ; sinon, seulement ceux « à exporter ».
 */
export const exportMandatesForBankPayloadSchema = z.strictObject({
  all: z.boolean(),
});
export type ExportMandatesForBankPayload = z.infer<typeof exportMandatesForBankPayloadSchema>;

export interface MandateBankExportCreatedView {
  readonly exportId: string;
}
