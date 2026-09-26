import type { CatalogFamilyView } from "@lfd/contracts";

/**
 * **Le rayon de ce que le fournil fabrique**, demandé au commerce.
 *
 * La fiche d'atelier se range par rayon (décidé le 2026-09-14 : l'écran ne
 * calcule plus rien, il ne joint donc plus le catalogue). Or la production ne
 * connaît un article que par son SKU — elle ne lit ni le catalogue du commerce,
 * ni le référentiel. Elle **déclare** donc la question ici, et le commerce, qui
 * tient le miroir des familles du référentiel, y répond : le rayon EST la
 * famille (id, nom, position), sans traduction depuis le 2026-09-26.
 *
 * ⚠️ **Il vit dans `channels/commerce/`, et l'emplacement EST la frontière** —
 * même motif que `DayOrdersReader` : `lint:context-boundaries` n'autorise
 * `b2b → production` que par ce dossier, et `appBootstrap` relie les deux côtés.
 *
 * Port de LECTURE, étroit exprès : un rayon par SKU, rien d'autre. Ni nom, ni
 * prix — la fiche a déjà le nom figé au tirage, et un prix n'a rien à faire sur
 * une feuille d'atelier.
 *
 * Aucune copie de la catégorie côté production, et c'est voulu : un rayon est
 * une donnée de vente qui peut bouger, pas un fait du four à archiver.
 */
export abstract class WorkshopShelvesReader {
  /**
   * Le rayon de chaque SKU demandé.
   *
   * Un SKU **sans rayon** — inconnu du catalogue ou masqué — est **absent** de la table, jamais présent
   * à `null`, et ne fait pas échouer la lecture des autres : un seul article
   * orphelin ne doit pas priver le fournil du rangement de toute sa fiche.
   *
   * Une panne réelle (base injoignable) **lève** : c'est à l'appelant de décider
   * qu'une fiche sans rayons reste servie, et de le dire.
   */
  abstract shelvesOf(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogFamilyView>>;
}
