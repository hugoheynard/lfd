import { z } from "zod";

/**
 * Contrat de fil du **canal plateforme B2B**, côté PIM : ce que l'écran produits
 * échange avec son backend pour décider qui est vendu aux pros.
 *
 * À ne pas confondre avec `@lfd/catalog-sync`, qui porte le format **poussé** à
 * la plateforme. Ici on parle à son propre backend ; là-bas on parle à un autre
 * système. Les mélanger ferait entrer le vocabulaire d'écran du PIM dans un
 * format que la plateforme doit comprendre sans rien savoir du PIM.
 */

/** Mettre en vente, ou retirer. Un booléen plutôt que deux routes : c'est une bascule. */
export const setB2bMembershipPayloadSchema = z.object({
  published: z.boolean(),
});
export type SetB2bMembershipPayload = z.infer<typeof setB2bMembershipPayloadSchema>;

/**
 * La même bascule, **en lot**.
 *
 * Ouvrir un canal se fait une fois, sur tout un catalogue : quatre-vingt-treize
 * appels pour un geste unique ne serait pas de la rigueur, ce serait un écran
 * inutilisable. Les identifiants restent **explicites** — pas de « tout
 * publier » magique qui emporterait un brouillon oublié.
 */
export const setB2bMembershipsPayloadSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1),
  published: z.boolean(),
});
export type SetB2bMembershipsPayload = z.infer<typeof setB2bMembershipsPayloadSchema>;

/** L'état d'un produit vis-à-vis du canal B2B. */
export interface B2bMembershipView {
  readonly productId: string;
  readonly publishedAt: string;
  readonly publishedBy: string | null;
  /**
   * `null` = publié mais **jamais parti**.
   *
   * Rendu séparément de `publishedAt` parce que décider et pousser sont deux
   * actes : un produit peut être en vente dans la tête du commercial et absent
   * de la plateforme depuis trois jours. C'est exactement l'écart qu'un écran
   * doit montrer, et qu'un booléen unique cacherait.
   */
  readonly lastPushedAt: string | null;
}
