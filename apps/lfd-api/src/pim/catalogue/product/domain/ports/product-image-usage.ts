/**
 * **Quelles fiches montrent cette image, sous ces rôles ?**
 *
 * Un port à part d'`EditorialReader` (ISP) : son seul lecteur est l'abonné qui
 * réannonce les visuels quand la médiathèque redécrit une image
 * (`on-media-asset-described.ts`, L4, 2026-10-10). Il ne lit que des
 * identifiants — la composition de l'annonce reste à `EditorialReader`.
 *
 * Les rôles sont passés en donnée : seuls ceux qui traversent vers la vitrine
 * méritent une annonce, et une image en galerie ne doit faire réécrire
 * aucune fiche.
 */
export abstract class ProductImageUsage {
  /** Les identifiants des fiches, sans doublon ; vide si aucune ne la porte. */
  abstract productsShowing(url: string, roles: readonly string[]): Promise<readonly string[]>;
}
