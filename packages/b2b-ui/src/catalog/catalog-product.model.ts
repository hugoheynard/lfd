/**
 * Ce qu'une **rangée de catalogue** a besoin de savoir d'un produit — et rien de
 * plus.
 *
 * Volontairement plus étroit que le `FoldProduct` du front client : ni `action`,
 * ni `badge`, ni `detail`, ni `category`. La rangée n'en rend aucun, et les
 * exiger aurait obligé le back-office à fabriquer des champs qu'il n'a pas.
 *
 * Le modèle riche du client reste **assignable** à celui-ci (mêmes noms, mêmes
 * types, champs en plus tolérés) : il continue de passer ses produits tels
 * quels, sans conversion ni cast.
 *
 * **Les prix arrivent formatés.** Une bibliothèque de présentation ne devine ni
 * la devise ni la locale ; c'est l'appelant qui sait s'il montre du HT, du TTC,
 * ou un tarif négocié.
 */
export interface CatalogProduct {
  /** Identifiant stable — la clé de suivi des listes. */
  id: string;
  name: string;
  /** Visuel ; absent ⇒ pastille à l'initiale. */
  image?: string;
  imageAlt?: string;
  /** Prix unitaire **déjà formaté** (« 2,20 € »). */
  price?: string;
  /** L'unité à laquelle le prix s'applique (« / pièce », « / kg »). */
  unit?: string;
  /** Colisage : la quantité est contrainte à un multiple. Absent ⇒ 1. */
  step?: number;
  /** Libellé du colis (« carton de 12 »), pour le sélecteur unité/colis. */
  packLabel?: string;
  /** En rupture : la rangée propose « me prévenir » au lieu d'ajouter. */
  outOfStock?: boolean;
}

/**
 * Un produit commandé à une quantité choisie — la charge de l'action de la
 * rangée.
 *
 * Générique, pour que l'appelant récupère **son** produit avec son type
 * d'origine : le front client remonte un `FoldProduct` complet à ses services,
 * pas une version amputée de ce qu'il a fourni.
 */
export interface CatalogOrder<T extends CatalogProduct = CatalogProduct> {
  readonly product: T;
  readonly quantity: number;
}
