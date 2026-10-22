/** Le fichier gardé d'un essai, et de quoi le nommer. */
export interface StoredCollectionTestFile {
  readonly messageId: string;
  readonly debtorName: string;
  /** Il porte l'IBAN du débiteur, en clair — comme le fichier d'un lot. */
  readonly xml: string;
  readonly sha256: string;
}

/** Port de lecture du fichier d'un essai, pour son téléchargement. */
export abstract class CollectionTestFileReader {
  abstract fileOf(id: string): Promise<StoredCollectionTestFile | null>;
}
