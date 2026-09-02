/**
 * **Le port de RETOUR du canal plateforme B2B** — et le seul.
 *
 * L'aller était en place : le référentiel projette, pousse, et ignore ce que la
 * plateforme en fait. Le retour manquait, et il est le vrai piège de cette
 * frontière : la fiche produit veut dire « poussée le 28, acceptée le 30 », donc
 * le référentiel a besoin d'un fait de l'aval — que la matrice interdit
 * (`pim → b2b` : ✗).
 *
 * ## Pourquoi un port, alors qu'un `findMany` marcherait
 *
 * C'est là qu'est le danger, et il faut le dire une fois pour toutes :
 * `catalog_items` vit dans le **même schéma Postgres**, la base est **unique**,
 * et un `findMany` depuis `pim/` **fonctionnerait**. `lint:cross-schema-join` ne
 * lit que les jointures brutes ; `lint:context-boundaries` ne lit que les
 * imports. Une frontière qu'on ne franchit qu'en SQL est franchie quand même,
 * et rien ici ne l'attraperait.
 *
 * Le port renverse donc la dépendance comme {@link B2bCatalogDriver} le fait
 * dans l'autre sens : `pim` déclare, `b2b` **se conforme**, et la racine de
 * composition relie les deux. Le référentiel ne sait toujours ni qui le
 * consomme, ni sous quelle forme la plateforme range ce qu'elle a reçu.
 *
 * ## 🔴 Ce qu'il a le droit de rendre — et où la frontière se rejouerait
 *
 * **Des faits de LIVRAISON, jamais des faits de commerce.** « Ce SKU a été
 * accepté, ses faits datent du 28, une arrivée le touche depuis le 30 » se dit
 * ici. « Son prix négocié est de 2,10 € », « trois clients l'ont commandé »
 * **ne se disent pas** — le jour où ce port les rendrait, la frontière serait
 * franchie par le contenu, sans qu'aucun import ni aucune jointure ne l'ait
 * signalé. C'est la seule forme de franchissement qu'aucune porte ne voit.
 */

/** Ce que la plateforme dit d'UN sku — trois faits, et rien de plus. */
export interface SkuDeliveryFacts {
  readonly sku: string;
  /**
   * La plateforme l'a **accepté** : il est dans son catalogue.
   *
   * `accepted` et non `sold` : le mot reste du côté de la livraison. Ce qui se
   * vend, à qui et à quel prix est une affaire de commerce, dont ce port n'a
   * pas à parler.
   */
  readonly accepted: boolean;
  /**
   * Quand les faits **en vigueur** pour ce SKU ont été reçus. `null` s'il n'a
   * jamais été accepté.
   *
   * Ce n'est pas la date du dernier push : c'est celle de la livraison dont les
   * faits s'appliquent encore. Les deux diffèrent dès qu'une arrivée a été
   * validée en écartant ce SKU — il garde alors les faits de la précédente, et
   * c'est exactement ce que la fiche doit montrer.
   */
  readonly factsReceivedAt: Date | null;
  /**
   * Depuis quand une arrivée **non validée** touche ce SKU. `null` = rien
   * n'attend pour lui.
   *
   * Indépendant de `accepted`, et il faut que ça le reste : un article en vente
   * dont le prix vient d'être livré est **les deux à la fois**. Les fondre en un
   * seul état obligerait à choisir lequel taire.
   */
  readonly awaitingSince: Date | null;
}

export abstract class B2bDeliveryFactsReader {
  /**
   * Les faits de livraison de plusieurs SKU, **en un appel**.
   *
   * En lot et non un par un : une fiche produit a autant de SKU que de
   * déclinaisons, et l'implémentation doit de toute façon lire le miroir entier
   * pour répondre.
   *
   * Une entrée existe dès que la plateforme sait **quelque chose** du SKU : il a
   * été accepté, ou une arrivée le porte. Son **absence** dit qu'elle n'en sait
   * rien.
   *
   * ⚠️ « Rien » recouvre aujourd'hui deux cas que la plateforme ne distingue
   * pas : jamais arrivé, et arrivé puis retiré — le retrait supprime la ligne.
   * L'écran doit donc s'en tenir à « la plateforme ne l'a pas », sans conclure
   * qu'il n'y a jamais été. La distinction viendra avec le retrait non
   * destructif (§11.1 du document de conception).
   */
  abstract factsFor(skus: readonly string[]): Promise<ReadonlyMap<string, SkuDeliveryFacts>>;
}
