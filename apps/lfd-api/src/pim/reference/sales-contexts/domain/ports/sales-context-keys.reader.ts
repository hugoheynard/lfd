/**
 * **La clé de chaque contexte, par identifiant** — ce que le registre publie
 * pour qu'un voisin qui compte par identifiant parle en clé à l'écran, sans
 * lire sa table. Les contextes archivés en sont : une ligne qui les vise
 * encore se nomme.
 */
export abstract class SalesContextKeysReader {
  abstract keysById(): Promise<ReadonlyMap<string, string>>;
}
