/**
 * **Le nom français de familles, par identifiant** — ce que la famille publie
 * pour qu'un écran voisin nomme une famille qu'il vise sans lire sa table.
 */
export abstract class CategoryNamesReader {
  /**
   * Identifiant → nom français. Une famille introuvable est absente ; une
   * famille sans nom français lisible rend `""` : une valeur écrite à la main
   * ne fait pas tomber l'écran, elle n'a juste pas de nom.
   */
  abstract frenchNamesOf(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
