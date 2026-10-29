/**
 * **Le changement de déclinaison par défaut est-il ouvert ?**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 10, D-b).
 *
 * Une politique de déploiement, pas un invariant de la fiche : le geste est
 * juste en soi (l'agrégat le tient, `Product.makeVariantDefault`), il est
 * fermé jusqu'à la bascule de la référence du défaut (L3). D'où un port, que
 * le L3 relie à une porte ouverte — ou retire — sans toucher l'agrégat.
 */
export abstract class DefaultVariantChangeGate {
  /** @throws {DefaultVariantChangeSuspendedError} le geste est fermé. */
  abstract assertOpen(variantSku: string): void;
}
