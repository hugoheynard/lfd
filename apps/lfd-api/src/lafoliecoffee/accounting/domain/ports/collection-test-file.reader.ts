/** Le fichier gardé d'un envoi d'essai, et de quoi le nommer. */
export interface StoredCollectionTestFile {
  /** Le `MsgId` de l'envoi. */
  readonly messageId: string;
  /** Il porte l'IBAN des débiteurs, en clair — comme le fichier d'un lot. */
  readonly xml: string;
  readonly sha256: string;
}

/**
 * Port de lecture du fichier d'un envoi d'essai, pour son téléchargement —
 * par l'envoi, ou par l'une de ses lignes.
 */
export abstract class CollectionTestFileReader {
  abstract fileOf(fileId: string): Promise<StoredCollectionTestFile | null>;
  /** Le fichier de l'envoi qui porte cet essai. */
  abstract fileOfTest(testId: string): Promise<StoredCollectionTestFile | null>;
}
