import type { ExportPart } from "../services/bank-export-reference.js";
/** Un mandat parti dans un export, et l'empreinte du compte sous lequel il est parti. */
export interface ExportedMandateLine {
  readonly mandateId: string;
  readonly rum: string;
  readonly accountFingerprint: string;
}

/** Un export, tel que l'écran le liste. */
export interface MandateBankExportRecord {
  readonly id: string;
  /** `EXM-<n>`, figé à la préparation. */
  readonly reference: string;
  /** Le rang dans la série ; `null` avant la numérotation. */
  readonly part: ExportPart | null;
  readonly createdAt: Date;
  readonly mandateCount: number;
  readonly lastDownloadedAt: Date | null;
  readonly importedAt: Date | null;
  readonly abandonedAt: Date | null;
}

/** Ce qu'il faut pour servir le fichier d'un export : ses lignes, et s'il est abandonné. */
export interface MandateBankExportFile {
  /** Ce qui nomme le fichier — figé à la préparation. */
  readonly reference: string;
  readonly part: ExportPart | null;
  readonly createdAt: Date;
  readonly mandateCount: number;
  readonly lines: readonly ExportedMandateLine[];
  readonly abandonedAt: Date | null;
}

/**
 * **Ce que la banque a, et ce qui part déjà** : les lignes de l'entité qui
 * retirent un mandat de « à exporter », hors lignes que le compte rendu a
 * rejetées (2026-10-23).
 */
export interface KnownMandateLines {
  /** Lignes des exports MARQUÉS importés. */
  readonly imported: readonly ExportedMandateLine[];
  /** Lignes des exports ouverts : ni importés, ni abandonnés (Hugo, 2026-10-23). */
  readonly inFlight: readonly ExportedMandateLine[];
}

/**
 * Port à lui, parce que la préparation d'un export ne lit que ça — calque de
 * `KnownAccountFingerprintsReader` côté comptes.
 */
export abstract class KnownMandateAccountsReader {
  abstract of(legalEntityId: string): Promise<KnownMandateLines>;
}

/** Port de lecture des exports pour l'écran et le fichier. Le mur est l'entité. */
export abstract class MandateBankExportsReader {
  /** Les exports de l'entité, le plus récent d'abord. */
  abstract list(legalEntityId: string): Promise<readonly MandateBankExportRecord[]>;
  /** Le fichier d'un export de CETTE entité, ou `null` s'il ne lui appartient pas. */
  abstract fileOf(legalEntityId: string, exportId: string): Promise<MandateBankExportFile | null>;
}

/** Une ligne d'un export non abandonné, et où en est son export. */
export interface MandateBankLineStanding {
  readonly mandateId: string;
  readonly accountFingerprint: string;
  readonly exportId: string;
  readonly lastDownloadedAt: Date | null;
  readonly importedAt: Date | null;
  /** `reported_by_bank` / `rejected`, ou `null` — une VALEUR rangée en base. */
  readonly correctedAs: string | null;
  readonly correctedAt: Date | null;
}

/**
 * **Où en est chaque mandat dans les exports de l'entité** — pour le tableau
 * de la carte seul (2026-10-23). Un port à part : la préparation ne lit que
 * les lignes connues (`KnownMandateAccountsReader`).
 */
export abstract class MandateBankLinesReader {
  /** Les lignes des exports NON abandonnés de l'entité. */
  abstract linesOf(legalEntityId: string): Promise<readonly MandateBankLineStanding[]>;
}
