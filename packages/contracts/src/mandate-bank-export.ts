import { z } from "zod";

/**
 * **L'export des mandats pour le portail de la banque**, tel que la fiche de
 * l'entité émettrice le lit (plan
 * `documentation/comptabilite/mandat/export-des-mandats-pour-la-banque.md`). Aucune coordonnée bancaire : l'IBAN ne sort que dans le fichier.
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

/**
 * Un export préparé. `importedAt` / `abandonedAt` : `null` tant que personne
 * ne l'a marqué ; jamais les deux à la fois (un export se clôt une fois).
 */
export interface MandateBankExportSummaryView {
  readonly id: string;
  /** Le numéro court, `EXM-<n>` — attribué à la préparation, figé (ajouté le 2026-10-23). */
  readonly reference: string;
  /** « Fichier k sur N », figé à la préparation ; `null` pour un export d'avant la numérotation. */
  readonly part: { readonly rank: number; readonly count: number } | null;
  /** Le nom du fichier téléchargé, figé : un second téléchargement redonne le même. */
  readonly fileName: string;
  readonly createdAt: string;
  readonly mandateCount: number;
  /** `null` tant que le fichier n'a jamais été téléchargé (ajouté le 2026-10-23). */
  readonly lastDownloadedAt: string | null;
  readonly importedAt: string | null;
  /** La banque l'a rejeté (ajouté le 2026-10-23, lot P1). */
  readonly abandonedAt: string | null;
}

/**
 * Où en est un mandat actif (ajouté le 2026-10-23, aligné sur les comptes) :
 * à exporter, dans un export ouvert (`downloaded` : son fichier a été tiré),
 * importé par un export déposé (`correctable` : le compte rendu CENET peut
 * encore s'y reporter), signalé connu par la banque, ou écarté.
 */
export type MandateBankStandingView =
  | { readonly kind: "to_export" }
  | { readonly kind: "in_flight"; readonly exportId: string; readonly downloaded: boolean }
  | {
      readonly kind: "imported";
      readonly at: string;
      readonly exportId: string;
      readonly correctable: boolean;
    }
  | { readonly kind: "reported_by_bank"; readonly at: string }
  | { readonly kind: "excluded"; readonly reason: MandateBankExclusionReasonView };

/** Une ligne du tableau des mandats. L'IBAN ne s'y montre que par ses quatre derniers. */
export interface MandateBankRowView {
  readonly mandateId: string;
  /** La RUM. */
  readonly reference: string;
  readonly debtorName: string;
  /** `null` pour un mandat écarté sans compte. */
  readonly ibanLast4: string | null;
  readonly standing: MandateBankStandingView;
}

/** La carte « Mandats à la banque ». */
export interface MandateBankExportsView {
  /** Mandats actifs exportables (hors écartés). */
  readonly exportableCount: number;
  /**
   * Les lignes « à exporter » du tableau : ni importées sous leur compte
   * actuel, ni dans un export ouvert (corrigé le 2026-10-23 — il comptait
   * aussi les mandats en export).
   */
  readonly toExportCount: number;
  /** « En attente de la banque » : dans un export ouvert (ajouté le 2026-10-23). */
  readonly inFlightCount: number;
  /** Dont déjà importés sous leur compte actuel. */
  readonly importedCount: number;
  readonly excluded: readonly MandateBankExcludedView[];
  /** Tous les mandats actifs, écartés à la fin (ajouté le 2026-10-23). */
  readonly mandates: readonly MandateBankRowView[];
  /** Le plus récent d'abord. */
  readonly exports: readonly MandateBankExportSummaryView[];
}

/**
 * Préparer un export : seulement les mandats « à exporter ». L'option `all`
 * (réexporter tout) est RETIRÉE le 2026-10-23 : la banque rejette l'import
 * entier dès qu'un mandat lui est déjà connu (réponse 12). Le corps est vide,
 * et strict — un `all` envoyé est refusé (400).
 */
export const exportMandatesForBankPayloadSchema = z.strictObject({});
export type ExportMandatesForBankPayload = z.infer<typeof exportMandatesForBankPayloadSchema>;

export interface MandateBankExportCreatedView {
  readonly exportId: string;
}

/**
 * « Rejeté par la banque », d'après le compte rendu d'import d'un export
 * déposé : le motif recopié. La forme seulement — le domaine refuse un motif
 * vide ou trop long (2026-10-23).
 */
export const rejectMandateAtBankPayloadSchema = z.strictObject({ reason: z.string() });
export type RejectMandateAtBankPayload = z.infer<typeof rejectMandateAtBankPayloadSchema>;
