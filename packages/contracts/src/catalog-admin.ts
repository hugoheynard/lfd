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
   * Vrai si un code stocké **n'apparaît pas** dans la liste projetée — la fiche
   * affichée est alors INCOMPLÈTE, et l'écran doit le dire plutôt que de rendre
   * une liste amputée qui a l'air entière.
   *
   * Deux causes, et elles comptent toutes les deux : le code n'existe plus dans
   * le référentiel, **ou** il existe sans obligation UE (sarrasin, maïs, noix
   * de coco) et la projection INCO l'écarte. Ne compter que la première a fait
   * afficher « Sans allergène » sur des articles qui en déclaraient un.
   *
   * ⚠️ Corollaire pour l'écran : `allergens: []` ne vaut « aucun allergène »
   * que si ce drapeau est **faux**.
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

/** Ce qu'une arrivée fait à un SKU, tel que l'écran de validation le montre. */
export interface DeliveryChangeView {
  readonly sku: string;
  readonly kind: "added" | "removed" | "changed";
  /**
   * Les champs qui diffèrent, **nommés**. Un écran qui dirait « a changé » sans
   * dire quoi obligerait le relecteur à comparer deux catalogues à la main —
   * c'est-à-dire à ne pas relire.
   */
  readonly fields: readonly string[];
  /** Le libellé de l'article, pour que la ligne se lise sans aller le chercher. */
  readonly name: string | null;
}

/**
 * L'arrivée en attente, et ce qu'elle changerait.
 *
 * `null` côté route quand il n'y a rien à valider : c'est l'état normal, pas une
 * erreur.
 */
export interface PendingDeliveryView {
  readonly id: string;
  /** L'ancre du référentiel d'où vient cette livraison. */
  readonly revisionId: string;
  readonly receivedAt: string;
  readonly changes: readonly DeliveryChangeView[];
  /**
   * L'arrivée touche-t-elle une **déclaration d'allergène** ?
   *
   * Le seul motif qui fasse sonner la cloche à la réception : une arrivée peut
   * attendre indéfiniment sans que rien ne casse, sauf une correction
   * d'allergène qui dormirait.
   */
  readonly carriesAllergenChange: boolean;
}

/**
 * Ce que la validation demande.
 *
 * `excludedSkus` porte la troisième voie entre deux mauvaises réponses : le
 * tout-ou-rien bloque sur un seul article faux, la validation étalée laisse des
 * restes qu'une livraison suivante détruit. Ici un prix faux s'écarte, les
 * autres passent, et l'arrivée est close en une fois.
 */
export const acceptDeliveryPayloadSchema = z.object({
  /**
   * L'arrivée qu'on vient de relire — pas « la courante ». Elle a pu être
   * remplacée entre l'affichage et le clic, et c'est précisément ce que le
   * serveur doit pouvoir refuser.
   */
  deliveryId: z.string().min(1),
  excludedSkus: z.array(z.string().min(1)).default([]),
});
export type AcceptDeliveryPayload = z.infer<typeof acceptDeliveryPayloadSchema>;
