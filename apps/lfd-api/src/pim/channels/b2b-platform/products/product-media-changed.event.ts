import type { SyncMedia } from "@lfd/catalog-sync";

/**
 * **Les visuels d'une fiche ont changé.**
 *
 * 🔴 **Le PREMIER événement de domaine du référentiel**, et c'est une décision
 * d'architecture, pas un branchement. Jusqu'au 2026-09-23, le PIM ne publiait
 * rien : il traçait ses faits au journal et s'arrêtait là. Ce qu'un événement
 * ajoute, et que le journal ne peut pas donner, c'est **un abonné qui agit**.
 *
 * ## Pourquoi il existe
 *
 * `catalog_items.image_url` est une **copie**, écrite par l'ingestion d'un
 * instantané. Changer la photo d'une fiche ne se voyait donc en boutique
 * qu'après une republication du catalogue — un acte lourd, délibéré, et sans
 * rapport avec le geste qu'on vient de faire.
 *
 * ## Ce qu'il n'est pas
 *
 * ⚠️ **Il ne se journalise PAS.** Le référentiel trace déjà
 * `product.media_saved` : c'est la DÉCISION. Ce qui suit est une conséquence,
 * et un second fait pour le même geste ferait deux lignes d'historique là où
 * il s'est passé une seule chose. D'où `publish` et non `publishTraced`.
 *
 * ⚠️ **Il ne remplace pas le push.** La projection sert la FRAÎCHEUR, le push
 * sert la RÉPARATION : il remet tout d'aplomb, y compris ce qu'une projection
 * aurait manqué. Ce qui serait interdit, c'est qu'ils lisent deux sources
 * différentes — ils lisent tous deux le référentiel.
 *
 * 🔴 **Un instantané fabriqué AVANT un changement de photo et ingéré APRÈS
 * annulera cette projection.** C'est correct au sens du modèle — l'instantané
 * dit ce que le catalogue ÉTAIT — mais ça se lira comme un défaut. La fenêtre
 * est celle d'un push, qui dure des minutes et se déclenche à la main ; le
 * jour où la publication devient automatique, il faudra dater.
 *
 * ## Pourquoi il vit dans le CANAL et non sous `catalogue/`
 *
 * 🔴 Un événement qu'un autre bloc consomme **fait partie de la surface
 * publiée**, au même titre qu'un port — c'est ce que dit
 * `lint:context-boundaries`, et elle l'a dit en refusant ce fichier rangé
 * ailleurs. Le précédent est `OrderHandedOverEvent` : « deux natures, une
 * seule surface ».
 *
 * Le rangement n'est pas cosmétique : il sépare ce que le référentiel PUBLIE
 * de ce qu'il garde pour lui. Un consommateur qui atteindrait
 * `catalogue/product/domain/` connaîtrait un chemin intérieur, et rien ne
 * l'empêcherait d'en lire davantage.
 *
 * ## La forme
 *
 * Le fait porte ce qu'il faut pour agir, et rien de plus : l'identifiant du
 * produit, et les deux visuels que le fil transporte. Un abonné qui devrait
 * rappeler le référentiel pour savoir quoi écrire ferait un aller-retour par
 * geste, et il pourrait lire un état déjà changé.
 *
 * ⚠️ `SyncMedia` est le vocabulaire du FIL, que le référentiel parle déjà en
 * tant qu'émetteur (`channels/b2b-platform/products/showcase.ts`). Ce n'est
 * donc pas la forme du récepteur qui remonte ici : c'est la nôtre.
 */
export class ProductMediaChangedEvent {
  constructor(
    readonly productId: string,
    /** L'ouverture de fiche — le `hero`. `null` = la fiche n'en porte pas. */
    readonly image: SyncMedia | null,
    /** La vignette de rayon — le `thumbnail`. `null` = pas désignée. */
    readonly thumbnail: SyncMedia | null,
  ) {}
}
