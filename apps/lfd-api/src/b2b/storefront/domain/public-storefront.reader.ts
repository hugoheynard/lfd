import type { PublicStorefrontPageView } from "@lfd/contracts";

/**
 * Port de **lecture publique** : la page d'UN rayon, telle que la boutique la
 * compose (plan, D8). Ni révision, ni gabarits, ni objets archivés, ni la
 * liste des rayons d'un objet — rien de ce qui ne regarde que l'éditeur.
 */
export abstract class PublicStorefrontReader {
  /** Un rayon sans page rend `{ rows: 0, objects: [] }` : la boutique l'affiche en cartes. */
  abstract pageOf(shelfKey: string): Promise<PublicStorefrontPageView>;
}
