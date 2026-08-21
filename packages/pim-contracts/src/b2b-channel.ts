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

/**
 * ── Le push du catalogue vers la boutique ────────────────────────────────────
 *
 * Le canal savait pousser côté serveur sans aucun appelant : le back-office ne
 * poussait que vers Shopify, et un régime de TVA révisé n'atteignait donc
 * jamais la boutique qui facture. Ces vues sont ce qui manquait pour le
 * brancher.
 */

/** Pourquoi un article n'est **pas** parti. Nommé, jamais tu. */
export type B2bExclusionReason =
  | "variant_sans_prix"
  | "variant_arretee"
  | "produit_sans_variante_vendable"
  | "famille_inconnue";

export interface B2bExclusionView {
  readonly sku: string;
  readonly reason: B2bExclusionReason;
}

/** Ce que la plateforme a réellement enregistré. */
export interface B2bIngestionReportView {
  readonly acceptedProducts: number;
  readonly acceptedVariants: number;
  readonly acceptedCategories: number;
  /** Les SKU retirés de la vente par ce push — nommés, pas comptés. */
  readonly removedSkus: readonly string[];
  readonly appliedAt: string;
}

/**
 * Le compte rendu d'un push.
 *
 * `mode` n'est pas décoratif : c'est le serveur qui tranche entre simulation et
 * envoi réel, et l'écran doit le redire à chaque fois — sans quoi on croit
 * pousser pour de vrai.
 */
export interface B2bPushSummaryView {
  readonly mode: "dry-run" | "live";
  readonly candidates: number;
  readonly report: B2bIngestionReportView | null;
  readonly excluded: readonly B2bExclusionView[];
}
