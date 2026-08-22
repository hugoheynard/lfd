/**
 * Où et comment une gamme se vend — matrice **boutiques × modes**. Chaque boutique
 * décline indépendamment « à emporter » et « sur place ». Le labo ne vend pas : il
 * est absent de la grille. Portée par la catégorie (`channelPreset`), héritée par
 * ses produits sauf override.
 */
export interface BoutiqueChannels {
  readonly emporter: boolean;
  readonly surPlace: boolean;
}

export interface SalesChannels {
  readonly b1: BoutiqueChannels;
  readonly b2: BoutiqueChannels;
  /**
   * La **plateforme B2B** — un booléen, pas une paire.
   *
   * Une boutique décline « à emporter » et « sur place » parce qu'un client y
   * consomme ou emporte ; un professionnel qui commande en gros ne fait ni l'un
   * ni l'autre. Lui donner la même forme qu'une boutique inventerait un choix
   * qui n'existe pas — et il faudrait alors décider ce que « sur place » veut
   * dire pour un grossiste.
   *
   * ⚠️ Ceci reste une **intention** héritée par les fiches. Le fait qu'un produit
   * SOIT publié sur la plateforme vit dans `b2b_channel_binding`, avec sa date
   * et son auteur. Les deux ne disent pas la même chose et ne se remplacent pas.
   */
  readonly b2b: boolean;
}

/** Défaut d'une gamme nouvellement créée : rien n'est vendu tant qu'on ne l'a pas dit. */
export function defaultSalesChannels(): SalesChannels {
  return {
    b1: { emporter: false, surPlace: false },
    b2: { emporter: false, surPlace: false },
    b2b: false,
  };
}

/**
 * Reconstruit un objet **propre** aux seules clés attendues — barrière avant
 * persistance : ni clé parasite ni forme partielle ne franchit le domaine.
 */
export function normalizeSalesChannels(channels: SalesChannels): SalesChannels {
  return {
    b1: { emporter: channels.b1.emporter, surPlace: channels.b1.surPlace },
    b2: { emporter: channels.b2.emporter, surPlace: channels.b2.surPlace },
    b2b: channels.b2b,
  };
}
