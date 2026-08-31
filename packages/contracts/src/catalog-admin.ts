import { z } from "zod";

/**
 * Le catalogue **vu du paramétrage** — ce que le PIM envoie ET ce que la
 * plateforme décide, côte à côte.
 *
 * Distinct de `catalog.ts`, qui sert la boutique : là-bas on montre un prix, ici
 * on montre **d'où il vient**. Un écran qui n'afficherait que le prix final ne
 * permettrait ni de dire « celui-là, c'est nous qui l'avons posé », ni de
 * revenir en arrière — et un prix sans provenance ne se défend pas devant un
 * client qui le conteste.
 */

/** Un article, avec sa provenance et la décision prise dessus s'il y en a une. */
/** Un allergène tel qu'une étiquette le nomme. */
export interface CatalogAllergenView {
  /** La catégorie réglementaire INCO — la clé, stable et non traduite. */
  readonly category: string;
  /** Le libellé d'étiquette, en français. C'est lui qui fait foi. */
  readonly label: string;
}

export interface CatalogAdminItemView {
  readonly sku: string;
  /** Le SKU du produit dont l'article est une déclinaison. */
  readonly productSku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryName: string;

  /** Le tarif du PIM. Toujours présent — c'est le socle. */
  readonly pimPriceMillicents: number;
  /** Le tarif décidé ici. `null` = on suit le PIM. */
  readonly b2bPriceMillicents: number | null;
  /** Ce qui sera facturé : le B2B s'il existe, le PIM sinon. */
  readonly effectivePriceMillicents: number;

  /**
   * `null` = la famille n'a pas de régime de TVA dans le PIM. L'article est
   * alors visible ici mais **pas vendable** : l'écran doit le dire, plutôt que
   * de laisser croire à un catalogue en ligne.
   */
  readonly vatRatePercent: number | null;

  /**
   * Les allergènes de l'article, **projetés INCO** — les catégories d'étiquette
   * (« Fruits à coque »), pas les codes GS1 du stockage.
   *
   * `null` = **aucune fiche réglementaire** déclarée dans le PIM. `[]` = fiche
   * déclarée, aucun allergène. Les confondre transformerait un oubli de saisie
   * en promesse au consommateur — c'est la seule faute qui compte sur ce champ.
   */
  readonly allergens: readonly CatalogAllergenView[] | null;
  /**
   * Vrai si un code stocké n'existe plus dans le référentiel — la fiche
   * affichée est alors INCOMPLÈTE, et l'écran doit le dire plutôt que de rendre
   * une liste amputée qui a l'air entière.
   */
  readonly allergensIncomplete: boolean;

  readonly isHidden: boolean;
  readonly isFeatured: boolean;

  /** Qui a décidé, et quand. `null` tant que personne n'a rien décidé. */
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  /** Quand le PIM a envoyé ces faits pour la dernière fois. */
  readonly receivedAt: string;
}

/**
 * Poser le **prix de vente B2B**.
 *
 * Le serveur refuse un prix identique à celui du PIM : le geste voulu est alors
 * de **retirer** la décision (`DELETE`), pas de la recopier. Une ligne fantôme
 * annoncerait une négociation inexistante et bloquerait la prochaine hausse du
 * PIM sans que personne ne comprenne pourquoi.
 */
export const setB2bPricePayloadSchema = z.object({
  priceMillicents: z.number().int().positive(),
});
export type SetB2bPricePayload = z.infer<typeof setB2bPricePayloadSchema>;

/** Masquer ou réafficher un article dans la boutique B2B. */
export const setCatalogVisibilityPayloadSchema = z.object({
  hidden: z.boolean(),
});
export type SetCatalogVisibilityPayload = z.infer<typeof setCatalogVisibilityPayloadSchema>;

/**
 * Mettre en avant, ou retirer la mise en avant.
 *
 * Le serveur refuse de mettre en avant un article **masqué** : les deux états
 * ensemble diraient « ne pas le montrer » et « le montrer en premier ».
 */
export const setCatalogFeaturedPayloadSchema = z.object({
  featured: z.boolean(),
});
export type SetCatalogFeaturedPayload = z.infer<typeof setCatalogFeaturedPayloadSchema>;
