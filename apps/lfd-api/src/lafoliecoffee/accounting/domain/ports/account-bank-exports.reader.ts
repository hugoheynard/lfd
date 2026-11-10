import type { ExportPart } from "../services/bank-export-reference.js";
import type { KnownBankAccountReason } from "../entities/known-bank-account.js";

/** Un compte parti dans un export : la société, le RIB, et l'empreinte de l'IBAN. */
export interface ExportedAccountLine {
  readonly bankAccountId: string;
  readonly companyId: string;
  readonly accountFingerprint: string;
}

/** Un export, tel que l'écran le liste. */
export interface AccountBankExportRecord {
  readonly id: string;
  /** `EXC-<n>`, figé à la préparation. */
  readonly reference: string;
  /** Le rang dans la série ; `null` avant la numérotation. */
  readonly part: ExportPart | null;
  readonly createdAt: Date;
  readonly accountCount: number;
  /** `null` tant que le fichier n'a jamais été téléchargé. */
  readonly lastDownloadedAt: Date | null;
  readonly importedAt: Date | null;
  readonly abandonedAt: Date | null;
}

/** Ce que la banque a, ou va avoir : les empreintes à ne pas renvoyer. */
export interface KnownAccountFingerprints {
  /** Lignes d'un export marqué importé, ou déclarées « déjà connu ». */
  readonly known: ReadonlySet<string>;
  /** Lignes d'un export préparé, ni importé ni abandonné. */
  readonly inFlight: ReadonlySet<string>;
  /**
   * Parmi `inFlight`, celles d'un export déjà téléchargé : seul le compte
   * rendu d'import CENET d'un fichier déposé peut dire qu'un compte y était
   * déjà connu (doc § 2.6, Hugo 2026-10-23).
   */
  readonly inDownloadedExport: ReadonlySet<string>;
}

/**
 * **Ce que la banque a déjà, ou va recevoir** — sur TOUT l'abonnement, pas par
 * entité (R7, Q-B9 : l'annuaire des comptes est supposé propre à l'abonnement
 * CENET). Un port à lui : la préparation et la déclaration ne lisent que ça.
 */
export abstract class KnownAccountFingerprintsReader {
  abstract all(): Promise<KnownAccountFingerprints>;
}

/** Depuis quand, et pourquoi, la banque connaît une empreinte. */
export type KnownAccountStamp =
  /** `exportId` : l'export déposé dont le compte rendu se reporte sur ce compte. */
  | { readonly kind: "imported"; readonly at: Date; readonly exportId: string }
  | { readonly kind: "declared"; readonly reason: KnownBankAccountReason; readonly at: Date };

/**
 * **Depuis quand la banque connaît ces comptes** — pour la carte seule, qui
 * dit « importé le … », « saisi dans CENET le … » ou « signalé par la banque
 * le … ». Un port à part : la préparation et la déclaration n'ont besoin que
 * des empreintes. Même portée que les empreintes : tout l'abonnement.
 */
export abstract class KnownAccountStampsReader {
  /** Le plus ancien tampon de chaque empreinte connue ; une empreinte inconnue n'y est pas. */
  abstract stampsOf(
    fingerprints: readonly string[],
  ): Promise<ReadonlyMap<string, KnownAccountStamp>>;
}

/** Les lignes d'un export, et quand il a été abandonné (`null` s'il ne l'est pas). */
export interface AccountBankExportFile {
  /** Ce qui nomme le fichier — figé à la préparation. */
  readonly reference: string;
  readonly part: ExportPart | null;
  readonly createdAt: Date;
  readonly accountCount: number;
  readonly lines: readonly ExportedAccountLine[];
  readonly abandonedAt: Date | null;
}

/** Port de lecture des exports pour l'écran et le fichier. Le mur est l'entité. */
export abstract class AccountBankExportsReader {
  /** Les exports de l'entité, le plus récent d'abord. */
  abstract list(legalEntityId: string): Promise<readonly AccountBankExportRecord[]>;
  /** Les lignes d'un export de CETTE entité, ou `null` s'il ne lui appartient pas. */
  abstract fileOf(legalEntityId: string, exportId: string): Promise<AccountBankExportFile | null>;
}
