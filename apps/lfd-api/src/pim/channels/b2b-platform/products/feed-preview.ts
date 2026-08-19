import type { CatalogSnapshot } from "@lfd/catalog-sync";

import type { Exclusion } from "./projection.js";

/** Ce que le référentiel enverrait s'il poussait maintenant — et ce qu'il tairait. */
export interface FeedPreview {
  readonly snapshot: CatalogSnapshot;
  /** Produits publiés sur le canal au moment du calcul, exclusions comprises. */
  readonly candidates: number;
  /** Ce que la projection écarte, avec son motif. Vide est une bonne nouvelle. */
  readonly excluded: readonly Exclusion[];
}

/**
 * **Ce que le référentiel publierait**, sans rien envoyer.
 *
 * Un port de lecture, distinct de {@link B2bCatalogDriver} qui, lui, écrit.
 * Les séparer n'est pas de la symétrie : ce sont deux besoins différents, et le
 * second consommateur l'a prouvé. Le push s'en sert pour savoir quoi envoyer ;
 * le **contrôle de parité** de la plateforme s'en sert pour savoir si son
 * miroir a dérivé de sa source — sans jamais rien écrire.
 *
 * C'est le seul symbole que la plateforme emprunte au référentiel pour cette
 * vérification, et il va dans le sens autorisé : `b2b` lit un port publié par
 * `pim`, jamais une table.
 */
export abstract class B2bCatalogFeedPreview {
  /**
   * @param generatedAt l'instant d'émission, **fourni** plutôt que pris ici.
   *   Une projection qui lit l'horloge n'est pas rejouable, et le push a besoin
   *   que le même instant traverse tout le snapshot.
   */
  abstract preview(generatedAt: string): Promise<FeedPreview>;
}
