/**
 * **Le changement de déclinaison par défaut est-il ouvert ?**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 10, D-b).
 *
 * Une politique de déploiement, pas un invariant de la fiche : le geste est
 * juste en soi (l'agrégat le tient, `Product.makeVariantDefault`), il a été
 * fermé du L1 à la bascule de la référence du défaut (L3), qui relie la porte
 * ouverte. Un port plutôt qu'un retrait : un retour arrière de la bascule le
 * referme en une ligne du module, sans toucher l'agrégat.
 */
export abstract class DefaultVariantChangeGate {
  /** @throws {DefaultVariantChangeSuspendedError} le geste est fermé. */
  abstract assertOpen(variantSku: string): void;
}
