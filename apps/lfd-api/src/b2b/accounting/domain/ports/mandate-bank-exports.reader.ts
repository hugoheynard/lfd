/** Un mandat parti dans un export, et l'empreinte du compte sous lequel il est parti. */
export interface ExportedMandateLine {
  readonly mandateId: string;
  readonly rum: string;
  readonly accountFingerprint: string;
}

/** Un export, tel que l'écran le liste. */
export interface MandateBankExportRecord {
  readonly id: string;
  readonly createdAt: Date;
  readonly mandateCount: number;
  readonly importedAt: Date | null;
}

/**
 * **Ce que la banque a déjà reçu** : les lignes des exports MARQUÉS importés
 * d'une entité. Un port à lui, parce que la commande d'export ne lit que ça.
 */
export abstract class ImportedMandateAccountsReader {
  abstract of(legalEntityId: string): Promise<readonly ExportedMandateLine[]>;
}

/** Port de lecture des exports pour l'écran et le fichier. Le mur est l'entité. */
export abstract class MandateBankExportsReader {
  /** Les exports de l'entité, le plus récent d'abord. */
  abstract list(legalEntityId: string): Promise<readonly MandateBankExportRecord[]>;
  /** Les lignes d'un export de CETTE entité, ou `null` s'il ne lui appartient pas. */
  abstract linesOf(
    legalEntityId: string,
    exportId: string,
  ): Promise<readonly ExportedMandateLine[] | null>;
}
