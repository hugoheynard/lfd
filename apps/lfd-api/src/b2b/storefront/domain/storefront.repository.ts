import type { Storefront } from "./storefront.js";

/**
 * Port d'**écriture** de la vitrine : il prend et rend l'agrégat entier
 * (CLAUDE.md §3.1), jamais des colonnes.
 *
 * Séparé des deux ports de lecture ({@link StorefrontReader} pour l'éditeur,
 * {@link PublicStorefrontReader} pour la boutique) : une page publique n'a
 * rien à faire d'un port capable de réécrire la vitrine (ISP).
 */
export abstract class StorefrontRepository {
  /**
   * La vitrine, objets VIVANTS seulement. Jamais `null` : une vitrine jamais
   * enregistrée se charge vide, en révision 0 (D6).
   */
  abstract load(): Promise<Storefront>;

  /**
   * Écrit la vitrine composée, dans la transaction ambiante. Le PREMIER ordre
   * est l'upsert conditionnel sur la révision chargée : il sérialise deux
   * enregistrements concurrents, et le second ne touche aucune ligne.
   *
   * @throws {StorefrontChangedError} quelqu'un a enregistré depuis le chargement.
   */
  abstract save(storefront: Storefront): Promise<void>;
}
