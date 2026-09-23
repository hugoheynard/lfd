import type { OrderLineAllergens } from "@lfd/contracts";

/** Un article vendable, prix **résolu** : la décision locale a déjà gagné. */
export interface ResolvedCatalogItem {
  readonly sku: string;
  /**
   * Le SKU du **produit** dont cet article est une déclinaison.
   *
   * Rendu parce que les deux ne coïncident pas : le PIM dérive le SKU d'une
   * déclinaison de celui de son produit (`VIE-001` → `VIE-001-1`), alors que le
   * seed B2B vend le SKU produit. C'est la clé qui permet de comparer les deux
   * catalogues avant de basculer — sans elle, la comparaison ne verrait que
   * 92 disparitions et 92 apparitions.
   */
  readonly productSku: string;
  readonly name: string;
  /** Prix HT en **millicentimes** réellement applicable — celui du B2B s'il existe. */
  readonly unitPriceMillicents: number;
  /** Le prix du PIM, gardé pour que l'écran puisse montrer l'écart. */
  readonly pimPriceMillicents: number;
  readonly vatRate: number;
  /**
   * **Jusqu'à quand on prend commande de cet article**, tel que le référentiel
   * l'a résolu. `null` = il n'en déclare aucune, et la règle du commerce
   * s'applique.
   */
  readonly orderTimeLimit: {
    readonly daysBefore: number;
    readonly time: string;
    readonly graceMinutes: number;
  } | null;
  readonly categoryId: string;
  readonly categoryName: string;
  /**
   * L'unité vendue **par défaut** du produit.
   *
   * Un produit peut avoir plusieurs déclinaisons (l'unité, le carton) ; c'est
   * celle-ci que le seed connaissait, et c'est donc elle qu'une comparaison
   * doit rapprocher. Sans ce drapeau, le carton écrase l'unité dans un index
   * par produit, et le rapport annonce qu'un croissant coûte 60 €.
   */
  readonly isDefault: boolean;
  readonly isFeatured: boolean;
  /**
   * Ce que le référentiel déclare pour cet article — codes **et** mentions.
   *
   * Il traverse ce port pour une seule raison : être figé sur la ligne de
   * commande. Les codes disent ce qui est vrai, les libellés ce qui a été dit au
   * client, et la traduction n'est pas stable dans le temps.
   *
   * `null` = article reçu avant que le fil ne porte les mentions. Une absence,
   * qu'aucun défaut ne doit transformer en « aucun allergène ».
   */
  readonly allergens: OrderLineAllergens | null;
  /**
   * **Ce que la vitrine montre** : la ligne sous le nom, le packshot, et la
   * vignette de rayon.
   *
   * Reçus du référentiel et rendus tels quels. `null` = rien n'a été saisi
   * là-bas — jamais une chaîne vide, qui dirait « effacé ».
   */
  readonly note: string | null;
  readonly image: {
    readonly url: string;
    readonly alt: string;
    readonly width: number | null;
    readonly height: number | null;
  } | null;
  /**
   * La **vignette de rayon** — distincte du packshot, et pas un doublon :
   * l'une est cadrée serré pour être lisible à 200 px dans une grille, l'autre
   * présente la pièce en ouverture de fiche. 4/3 contre 3/2.
   *
   * ⚠️ `null` = la fiche n'en désigne pas, et le récepteur retombe sur
   * {@link image}. C'est ce que la vitrine faisait pour TOUT avant le fil
   * v10 : le rôle `thumbnail` ne traversait pas, donc le choisir à l'écran ne
   * produisait aucun effet.
   */
  readonly thumbnail: {
    readonly url: string;
    readonly alt: string;
    readonly width: number | null;
    readonly height: number | null;
  } | null;
}

/**
 * Port de **lecture** du catalogue, décisions locales déjà appliquées.
 *
 * Les appelants ne voient jamais les deux tables : ils voient un catalogue. La
 * composition est faite ici une seule fois — la laisser fuir donnerait autant de
 * versions de « quel prix s'applique » qu'il y a d'écrans.
 */
/**
 * **À QUI l'on sert** — et c'est la seule chose qui change le prix d'entrée.
 *
 * 🔴 Un `pro` achète au tarif de son canal : le prix du référentiel, ou celui
 * que la plateforme a posé par-dessus. Un `public` achète **l'étiquette** — le
 * prix saisi au référentiel, mis hors taxe au taux de son contexte de vente.
 * Les deux sont des hors taxe et c'est tout ce qu'ils partagent ; servir l'un
 * pour l'autre facture au mauvais tarif, dans un sens ou dans l'autre.
 *
 * Nommée plutôt que déduite d'un `companyId === null` chez chaque lecteur : la
 * déduction est juste, mais elle appartient à UN endroit (`ShopCataloguePricing`),
 * et la recopier ferait qu'un jour l'un des lecteurs l'oublierait.
 */
export type ShopAudience = "pro" | "public";

export abstract class CatalogReader {
  /** Un SKU, ou `null` s'il est inconnu **ou masqué**. */
  abstract findSku(sku: string): Promise<ResolvedCatalogItem | null>;
  /**
   * Tout ce qui est vendable **pour cette audience**, masqués exclus, dans
   * l'ordre d'affichage.
   *
   * ⚠️ « Vendable » dépend de qui regarde : un article dont le référentiel n'a
   * pas encore poussé le prix public n'est pas vendable au `public`, alors
   * qu'il l'est au `pro`. Il est ÉCARTÉ plutôt que servi au tarif pro — le même
   * refus que pour un article sans taux de TVA, et pour la même raison.
   */
  abstract listSellable(audience: ShopAudience): Promise<ResolvedCatalogItem[]>;

  /**
   * L'unité **par défaut** d'un produit, par le SKU du PRODUIT.
   *
   * Distincte de {@link findSku}, qui prend le SKU d'une déclinaison. Les deux
   * ne coïncident pas — le PIM dérive `VIE-001-1` de `VIE-001` — et c'est le SKU
   * produit que la boutique a toujours vendu : il est écrit dans les commandes
   * passées, dans les paniers récurrents, dans les brouillons. Une bascule qui
   * changerait d'identifiant réécrirait l'histoire ; cette méthode est ce qui
   * permet de ne pas le faire.
   *
   * `null` si le produit est inconnu, masqué, ou sans taux de TVA — un article
   * qu'on ne sait pas facturer ne se vend pas.
   */
  abstract findDefaultByProductSku(
    productSku: string,
    audience: ShopAudience,
  ): Promise<ResolvedCatalogItem | null>;

  /**
   * Les unités par défaut de **plusieurs** produits, en une lecture.
   *
   * Par lot, et pour la même raison que le port des volumes : un panier de vingt
   * lignes, une liste d'habitudes de cinquante articles, résolus un par un,
   * feraient autant de requêtes. Un SKU inconnu est **absent** de la table
   * rendue plutôt que présent à `null` — l'appelant distingue ainsi « inconnu »
   * de « pas demandé ».
   */
  abstract listDefaultsByProductSkus(
    productSkus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, ResolvedCatalogItem>>;
}
