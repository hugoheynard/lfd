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

/**
 * Ce qu'une bascule **en lot** a réellement touché.
 *
 * Un nombre et non un « c'est fait » : ouvrir un canal sur quatre-vingt-quinze
 * fiches et en voir passer quatre-vingt-treize est une information, et l'écran
 * doit pouvoir dire laquelle.
 */
export interface B2bMembershipBatchResult {
  readonly affected: number;
}

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
 * poussait que vers l'ancien canal de vente en ligne, et un régime de TVA révisé n'atteignait donc
 * jamais la boutique qui facture. Ces vues sont ce qui manquait pour le
 * brancher.
 */

/**
 * Pourquoi un article n'est **pas** parti. Nommé, jamais tu.
 *
 * ⚠️ Cette union est la **source** : le domaine (`Exclusion.reason`, côté
 * projection B2B) l'importe au lieu de la redéclarer, et l'écran de publication
 * en tire son dictionnaire de libellés — un motif ajouté ici ne compile pas
 * tant qu'il n'est pas traduit.
 *
 * Elle a été un synonyme, et elle a dérivé : le domaine produisait déjà
 * `canal_ferme` que l'union ignorait, si bien qu'une fiche écartée parce qu'on
 * ne la vend pas aux professionnels s'affichait avec un motif VIDE. Le
 * compilateur ne pouvait rien en dire — deux déclarations indépendantes ne se
 * contredisent jamais, elles divergent.
 */
export type B2bExclusionReason =
  | "variant_sans_prix"
  | "variant_arretee"
  | "produit_sans_variante_vendable"
  | "famille_inconnue"
  /** La fiche n'est pas vendue sur ce canal — sa matrice, ou celle de sa famille. */
  | "canal_ferme"
  /**
   * Le contexte B2B n'a pas de taux : le hors taxe n'est pas dérivable.
   *
   * Distinct de `variant_sans_prix` — ici le prix existe, c'est le taux qui
   * manque, et c'est un autre écran qu'il faut ouvrir. Le motif s'appelait
   * `variant_ttc_sans_taux` du temps où une déclinaison pouvait être ancrée au
   * hors taxe : il fallait alors dire de quel ancrage on parlait. Il n'y en a
   * plus qu'un, donc le préciser ne distinguait plus rien.
   */
  | "variant_sans_taux"
  /**
   * Sous la méthode `entered` (lot P), la déclinaison n'a pas de prix pro HT
   * saisi : elle ne se vend pas aux professionnels, et c'est la section
   * « Tarif » de la fiche qu'il faut ouvrir — pas l'écran des taux.
   */
  | "variant_sans_prix_pro"
  /**
   * La déclinaison n'a pas de déclaration d'allergènes — la sienne, ou celle
   * du défaut qu'elle suit (lot 2b) : on ne vend pas ce qu'on ne sait pas
   * étiqueter. C'est la section « Allergènes » de la fiche qu'il faut ouvrir.
   */
  | "variant_sans_allergenes"
  /**
   * Un article de la sélection d'une opération datée que CET envoi ne porte
   * pas — non publié, sans prix, canal fermé (fil v11). Il manquerait au rayon
   * de l'opération sans que personne sache pourquoi ; le motif le dit, et
   * l'écran de l'opération dit lequel ouvrir.
   */
  | "operation_article_absent";

/** Une fiche citée par l'aperçu de bascule : de quoi la retrouver à l'écran. */
export interface AudienceSwitchItemView {
  readonly id: string;
  readonly sku: string;
  /** Le nom français. */
  readonly name: string;
}

/**
 * **Ce que la bascule vers l'audience toucherait** (1f du plan
 * `plan-catalogue-synchronise-par-audience.md`) — la mesure qu'on lit en
 * production sans accès direct à sa base. Lecture seule.
 */
export interface AudienceSwitchPreviewView {
  /** En vente au référentiel, mais pas liées au canal B2B : invisibles aux pros aujourd'hui. */
  readonly publishedUnbound: readonly AudienceSwitchItemView[];
  /** Liées au canal, mais pas en vente (brouillon ou archivées) : la projection les écarte. */
  readonly boundUnpublished: readonly AudienceSwitchItemView[];
  /** En vente, mais leur case `b2b` effective est fermée : la projection les écarte aussi. */
  readonly publishedB2bClosed: readonly AudienceSwitchItemView[];
  /**
   * Déclinaisons vendues aux pros aujourd'hui **sans déclaration
   * d'allergènes** (lot 2a, corrections après `vitruve`) : les faits du
   * catalogue les rangent incomplètes, donc elles sortiront de la vente à la
   * bascule (2b3).
   */
  readonly soldWithoutAllergens: readonly AudienceSwitchVariantView[];
  /**
   * Fiches **actives** dont au moins une déclinaison est incomplète selon la
   * règle du lot 2b — prix public, allergènes, prix pro, et un taux pour
   * chaque contexte de vente en service, quelle que soit l'audience. Les
   * déclinaisons incomplètes ne seront pas vendues par les faits du
   * catalogue ; `keepsSelling: false` = la fiche ne vendra plus rien.
   */
  readonly activeIncomplete: readonly AudienceSwitchIncompleteView[];
}

/** Une fiche active citée par l'aperçu de bascule, avec ce qui manque à ses déclinaisons. */
export interface AudienceSwitchIncompleteView extends AudienceSwitchItemView {
  /** Au moins une déclinaison reste complète : la fiche continue de vendre. */
  readonly keepsSelling: boolean;
  /** SKU de déclinaison → ce qui lui manque (`price`, `allergens`, `vat:eatIn`…). */
  readonly gaps: Readonly<Record<string, readonly string[]>>;
}

/**
 * **Ce que la bascule a désactivé** (2b1) : les fiches publiées mais
 * invisibles aujourd'hui (H7), une transaction par fiche. La liste est rendue
 * pour être gardée : c'est elle qui sert au retour arrière (réactiver).
 */
export interface AudienceSwitchAppliedView {
  readonly deactivated: readonly AudienceSwitchItemView[];
  /** Les fiches dont la transaction a échoué — nommées, à relancer. */
  readonly failed: readonly AudienceSwitchItemView[];
}

/** Une déclinaison citée par l'aperçu de bascule. */
export interface AudienceSwitchVariantView {
  readonly productId: string;
  readonly productSku: string;
  readonly variantSku: string;
  /** Le nom français de la déclinaison. */
  readonly name: string;
}

/**
 * La réponse de `POST /pim/channels/b2b/reemit` — ce qu'une réémission a fait.
 *
 * Même forme que le port `ReemissionReport` de l'API
 * (`pim/catalogue/shared/domain/ports/catalog-reemission.ts`) : publiée ici pour
 * que l'écran ne la recopie pas (2026-10-16).
 */
export interface ReemissionReportView {
  readonly categories: number;
  readonly products: number;
  /** Les fiches dont la transaction a échoué, par identifiant. */
  readonly failedProducts: readonly string[];
}
