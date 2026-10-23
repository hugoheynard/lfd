/** Un compte parti dans un export : la société, le RIB, et l'empreinte de l'IBAN. */
export interface ExportedAccountLine {
  readonly bankAccountId: string;
  readonly companyId: string;
  readonly accountFingerprint: string;
}

/** Un export, tel que l'écran le liste. */
export interface AccountBankExportRecord {
  readonly id: string;
  readonly createdAt: Date;
  readonly accountCount: number;
  readonly importedAt: Date | null;
  readonly abandonedAt: Date | null;
}

/** Ce que la banque a, ou va avoir : les empreintes à ne pas renvoyer. */
export interface KnownAccountFingerprints {
  /** Lignes d'un export marqué importé, ou déclarées « déjà connu ». */
  readonly known: ReadonlySet<string>;
  /** Lignes d'un export préparé, ni importé ni abandonné. */
  readonly inFlight: ReadonlySet<string>;
}

/**
 * **Ce que la banque a déjà, ou va recevoir** — sur TOUT l'abonnement, pas par
 * entité (R7, Q-B9 : l'annuaire des comptes est supposé propre à l'abonnement
 * CENET). Un port à lui : la préparation et la déclaration ne lisent que ça.
 */
export abstract class KnownAccountFingerprintsReader {
  abstract all(): Promise<KnownAccountFingerprints>;
}

/** Les lignes d'un export, et quand il a été abandonné (`null` s'il ne l'est pas). */
export interface AccountBankExportFile {
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
