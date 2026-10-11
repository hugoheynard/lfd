/**
 * **Combien d'images au fonds** — le seul fait de la médiathèque que la carte
 * de santé a le droit de connaître.
 *
 * Un port, et déclaré ICI plutôt que par `ops`, pour la raison exacte de
 * `StaffAccessResolver` : `ops` n'importe que `platform`, et personne
 * n'importe `ops` — la médiathèque ne pourrait pas implémenter un port qu'il
 * déclarerait. La racine de composition relie les deux côtés
 * (`appBootstrap/media-library-census.module.ts`).
 *
 * Il tient en une méthode, et c'est voulu : lire `media_asset` depuis `ops`
 * en Prisma direct franchirait la frontière sans qu'aucun import ne le dise.
 */
export abstract class MediaLibraryCensus {
  /** Toutes les images au fonds, sans filtre : la borne de toute lecture filtrée. */
  abstract countImages(): Promise<number>;
}
