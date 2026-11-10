/** Une entrée du zip : son nom, ses octets, et le jour qu'elle porte (`AAAA-MM-JJ`). */
export interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly modifiedOn: string;
}

/**
 * Écrit un zip dont chaque entrée est rangée SANS compression (méthode STORE) :
 * un PDF/A est déjà compressé, le recompresser coûte du temps pour rien
 * (plan `plan-page-mes-factures.md` §7.5). La bibliothèque reste derrière ce
 * port, dans `infrastructure/`.
 */
export abstract class StoredZipWriter {
  abstract write(entries: readonly ZipEntry[]): Uint8Array;
}
